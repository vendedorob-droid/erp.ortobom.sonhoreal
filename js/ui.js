// ============================================================
// COLCHOEIRO ERP — Utilitários de Interface
// ============================================================

const UI = (() => {

  // ── Toast notifications ────────────────────────────────────
  function toast(message, type = 'success', duration = 3500) {
    const wrap = document.getElementById('toast-container') || createToastContainer();
    const el = document.createElement('div');
    const icons = { success:'✅', error:'❌', warn:'⚠️', info:'ℹ️' };
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span>${message}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('toast-hide'); setTimeout(() => el.remove(), 400); }, duration);
  }

  function createToastContainer() {
    const div = document.createElement('div');
    div.id = 'toast-container';
    document.body.appendChild(div);
    return div;
  }

  // ── Modal genérico ─────────────────────────────────────────
  function modal({ title, body, actions = [], size = 'md' }) {
    closeModal(); // fecha eventual modal aberto
    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal modal-${size}" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2 class="modal-title">${title}</h2>
          <button class="modal-close" onclick="UI.closeModal()" aria-label="Fechar">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${actions.length ? `<div class="modal-footer">${
          actions.map(a => `<button class="${a.cls||'btn-secondary'}" onclick="${a.action}">${a.label}</button>`).join('')
        }</div>` : ''}
      </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    const el = document.getElementById('modal-overlay');
    if (el) el.remove();
    document.body.style.overflow = '';
  }

  // ── Loading overlay ────────────────────────────────────────
  function loading(show, message = 'Carregando...') {
    let el = document.getElementById('loading-overlay');
    if (show) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'loading-overlay';
        el.innerHTML = `<div class="loading-box"><div class="spinner"></div><p>${message}</p></div>`;
        document.body.appendChild(el);
      }
    } else {
      if (el) el.remove();
    }
  }

  // ── Skeleton loader ────────────────────────────────────────
  function skeleton(rows = 5, cols = ['60%','30%','20%']) {
    return Array(rows).fill(0).map(() => `
      <div class="skeleton-row">
        ${cols.map(w => `<div class="skeleton-cell" style="width:${w}"></div>`).join('')}
      </div>`).join('');
  }

  // ── Confirmação ────────────────────────────────────────────
  function confirm(message, onConfirm, confirmLabel = 'Confirmar', danger = false) {
    modal({
      title: 'Confirmar ação',
      body: `<p style="margin:0;font-size:15px">${message}</p>`,
      actions: [
        { label: 'Cancelar', cls: 'btn-secondary', action: 'UI.closeModal()' },
        { label: confirmLabel, cls: danger ? 'btn-danger' : 'btn-primary', action: `UI._confirmCb()` },
      ]
    });
    UI._confirmCb = () => { closeModal(); onConfirm(); };
  }

  // ── Formatadores ───────────────────────────────────────────
  function money(value) {
    return 'R$\u00a0' + Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function date(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR');
  }

  function dateTime(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('pt-BR');
  }

  function phone(v = '') {
    v = v.replace(/\D/g, '');
    if (v.length === 11) return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
    if (v.length === 10) return `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
    return v;
  }

  function cpfCnpj(v = '') {
    v = v.replace(/\D/g, '');
    if (v.length === 11) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
    if (v.length === 14) return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');
    return v;
  }

  // ── Badge de status ────────────────────────────────────────
  const STATUS_MAP = {
    rascunho:   { label: 'Rascunho',    cls: 'badge-gray'   },
    pendente:   { label: 'Pendente',    cls: 'badge-yellow' },
    aprovado:   { label: 'Aprovado',    cls: 'badge-green'  },
    negociacao: { label: 'Negociação',  cls: 'badge-blue'   },
    expirado:   { label: 'Expirado',    cls: 'badge-red'    },
    cancelado:  { label: 'Cancelado',   cls: 'badge-red'    },
    concluido:  { label: 'Concluída',   cls: 'badge-green'  },
    pago:       { label: 'Pago',        cls: 'badge-green'  },
    parcial:    { label: 'Parcial',     cls: 'badge-yellow' },
    aberto:     { label: 'Em aberto',   cls: 'badge-yellow' },
    ativo:      { label: 'Ativo',       cls: 'badge-green'  },
    inativo:    { label: 'Inativo',     cls: 'badge-gray'   },
  };

  function badge(status) {
    const s = STATUS_MAP[status] || { label: status, cls: 'badge-gray' };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
  }

  // ── Inicializar máscaras em inputs ─────────────────────────
  function maskPhone(el) {
    el.addEventListener('input', () => {
      let v = el.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
      else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d*)/, '($1) $2-$3');
      else if (v.length > 2) v = v.replace(/(\d{2})(\d*)/, '($1) $2');
      el.value = v;
    });
  }

  function maskMoney(el) {
    el.addEventListener('input', () => {
      let v = el.value.replace(/\D/g, '');
      v = (parseInt(v || '0', 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      el.value = v;
    });
  }

  // ── Gera ID curto único ────────────────────────────────────
  function shortId(prefix = '') {
    return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
  }

  // ── Paginação simples ──────────────────────────────────────
  function paginate(items, page, perPage = 15) {
    const total = Math.ceil(items.length / perPage);
    const start = (page - 1) * perPage;
    return {
      items:    items.slice(start, start + perPage),
      total,
      page,
      perPage,
      hasNext:  page < total,
      hasPrev:  page > 1,
    };
  }

  return {
    toast, modal, closeModal, loading, skeleton, confirm,
    money, date, dateTime, phone, cpfCnpj, badge,
    maskPhone, maskMoney, shortId, paginate,
    _confirmCb: null,
  };

})();
