// ============================================================
// COLCHOEIRO ERP — Módulo Orçamentos (Edição e CRM)
// ============================================================

const Quotes = (() => {
  let all = [], page = 1;
  let companySettings = {};
  let products = [];

  async function render(container) {
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Orçamentos</div><div class="page-sub" id="q-sub">Carregando...</div></div>
        <button class="btn btn-primary" onclick="Quotes._new()">+ Novo Orçamento</button>
      </div>
      <div class="filter-bar" style="margin-bottom:16px">
        <button class="filter-btn active" onclick="Quotes._filter('todos',this)">Todos</button>
        <button class="filter-btn" onclick="Quotes._filter('pendente',this)">Pendentes</button>
        <button class="filter-btn" onclick="Quotes._filter('aprovado',this)">Aprovados</button>
        <button class="filter-btn" onclick="Quotes._filter('expirado',this)">Expirados</button>
      </div>
      <div id="q-list">${UI.skeleton(5,['20%','30%','20%','15%','15%'])}</div>
    </div>`;
    await _load();
  }

  async function _load() {
    const companyId = Auth.getCompanyId();
    // Carrega settings para sugestões de texto
    const sSnap = await db.collection('companies').doc(companyId).collection('settings').doc('general').get();
    companySettings = sSnap.exists ? sSnap.data() : {};

    // Pré-carrega produtos ativos (usado na busca dentro do formulário de orçamento)
    const pSnap = await db.collection('companies').doc(companyId).collection('products').where('active', '==', true).get();
    products = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    let query = db.collection('companies').doc(companyId).collection('quotes').orderBy('createdAt','desc');
    if (Auth.getRole() === 'vendedor') query = query.where('sellerId','==',Auth.getProfileId());
    const snap = await query.limit(100).get();
    all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _render('todos');
  }

  function _filter(status, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _render(status);
  }

  // ── Link do WhatsApp para enviar o orçamento ao cliente ──────────────
  function _waLink(q) {
    if (!q.customerPhone) return null;
    const phone = q.customerPhone.replace(/\D/g, '');
    if (!phone) return null;
    const lines = [
      `Olá ${q.customerName}! Segue o orçamento ${q.number || ''}:`,
      '',
      ...(q.items || []).map(i => `• ${i.qty}x ${i.name} — ${UI.money(i.price)}`),
      '',
      `Total: ${UI.money(q.total)}`,
      q.expiresAt ? `Válido até ${UI.date(q.expiresAt)}` : '',
      q.notes ? q.notes : ''
    ].filter(Boolean);
    return `https://wa.me/55${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
  }

  function _render(status) {
    const list = status === 'todos' ? all : all.filter(q => q.status === status);
    document.getElementById('q-sub').textContent = `${list.length} orçamentos encontrados`;
    document.getElementById('q-list').innerHTML = `
    <div class="quote-grid">
      ${list.map(q => {
        const wa = _waLink(q);
        const itemCount = (q.items || []).length;
        return `
        <div class="quote-card">
          <div class="quote-card-top">
            <span class="quote-number">${q.number || q.id.slice(-8).toUpperCase()}</span>
            ${UI.badge(q.status || 'pendente')}
          </div>
          <div class="quote-customer">${q.customerName || '—'}</div>
          <div class="quote-meta">🗓️ ${UI.date(q.createdAt)} · 📦 ${itemCount} ite${itemCount === 1 ? 'm' : 'ns'}</div>
          <div class="quote-total">${UI.money(q.total || 0)}</div>
          <div class="quote-actions">
            <button class="btn btn-secondary btn-sm" style="flex:1" onclick="Quotes._view('${q.id}')">👁️ Ver</button>
            <button class="btn btn-ghost btn-sm" onclick="Quotes._edit('${q.id}')" title="Editar">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="Quotes._printPreview('${q.id}')" title="Imprimir">🖨️</button>
            ${wa ? `<a class="btn btn-success btn-sm" href="${wa}" target="_blank" title="Enviar por WhatsApp">📱</a>` : ''}
          </div>
        </div>`;
      }).join('') || '<div class="card" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">Nenhum orçamento encontrado.</div>'}
    </div>`;
  }

  function _new() { _openForm(); }
  function _edit(id) { const q = all.find(x => x.id === id); if (q) _openForm(q); }

  function _openForm(q = null) {
    const suggestions = companySettings.quoteSuggestions || ['Garantia de 1 ano', 'Entrega imediata', 'Pagamento facilitado'];

    UI.modal({
      title: q ? 'Editar Orçamento' : 'Novo Orçamento',
      size: 'lg',
      body: `
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Cliente</label><input class="form-input" id="q-customer" value="${q?.customerName||''}" placeholder="Nome do cliente"></div>
        <div class="form-group"><label class="form-label">Telefone</label><input class="form-input" id="q-phone" value="${q?.customerPhone||''}" placeholder="(11) 99999-9999"></div>
        <div class="form-group"><label class="form-label">Validade</label><input class="form-input" type="date" id="q-expires" value="${q?.expiresAt ? q.expiresAt.toDate().toISOString().split('T')[0] : ''}"></div>
        <div class="form-group"><label class="form-label">Entrega (dias)</label><input class="form-input" type="number" id="q-delivery" value="${q?.deliveryDays||7}"></div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:-6px">Cliente novo? Pode digitar o nome e telefone direto aqui — ele é cadastrado automaticamente no CRM ao salvar.</div>

      <div style="margin-top:15px">
        <label class="form-label">Observações</label>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">
          ${suggestions.map(s => `<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 8px" onclick="document.getElementById('q-notes').value += '${s}\\n'">${s}</button>`).join('')}
        </div>
        <textarea class="form-input" id="q-notes" rows="3">${q?.notes||''}</textarea>
      </div>

      <div style="margin-top:15px">
        <label class="form-label">Adicionar Produto do Estoque</label>
        <div class="form-group" style="position:relative;margin-top:6px">
          <input class="form-input" id="q-prod-search" placeholder="Digite nome, marca ou código de barras..." oninput="Quotes._searchProd(this.value)" autocomplete="off">
          <div id="q-prod-results" class="search-dropdown" style="display:none"></div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 10px">
          <label class="form-label">Itens do Orçamento</label>
          <button class="btn btn-ghost btn-sm" onclick="Quotes._addManualRow()">+ Item avulso (sem cadastro)</button>
        </div>
        <div id="q-items-list" style="display:flex;flex-direction:column;gap:8px">
          ${(q?.items||[]).map((item, idx) => _itemRow(item, idx)).join('')}
        </div>
      </div>`,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: q ? 'Salvar Alterações' : 'Criar Orçamento', cls: 'btn btn-primary', action: `Quotes._save('${q?.id||''}')` }
      ]
    });
    if (!q) {
      const d = new Date(); d.setDate(d.getDate() + 7);
      document.getElementById('q-expires').value = d.toISOString().split('T')[0];
    }
  }

  function _itemRow(item = {}, idx = Date.now()) {
    return `
    <div class="q-item-row" id="row-${idx}">
      <div class="q-item-icon">🛏️</div>
      <div class="q-item-fields">
        <input class="form-input" placeholder="Nome do produto" value="${item.name||''}">
        <div class="q-item-numbers">
          <div><label>Qtd</label><input class="form-input" type="number" min="1" value="${item.qty||1}"></div>
          <div><label>Preço</label><input class="form-input" type="number" step="0.01" value="${item.price||0}"></div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm q-item-remove" onclick="this.parentElement.remove()">✕</button>
    </div>`;
  }

  function _addManualRow() {
    const list = document.getElementById('q-items-list');
    if (!list) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = _itemRow({}, Date.now());
    list.appendChild(wrap.firstElementChild);
  }

  // ── Busca de produto embutida no próprio formulário (sem modal aninhado) ──
  function _searchProd(q) {
    const div = document.getElementById('q-prod-results');
    if (!div) return;
    if (q.length < 2) { div.style.display = 'none'; return; }
    const term = q.toLowerCase();
    const results = products.filter(p => `${p.brand} ${p.model} ${p.barcode||''}`.toLowerCase().includes(term));
    div.style.display = 'block';
    div.innerHTML = results.map(p => `
      <div class="search-item" onclick="Quotes._selectProd('${p.id}')">
        <div style="font-weight:700">${p.brand} ${p.model}</div>
        <div style="font-size:11px;color:var(--muted)">${UI.money(p.price)} · ${p.technology||''}</div>
      </div>
    `).join('') || '<div style="padding:10px;font-size:12px;color:var(--muted)">Nenhum produto encontrado.</div>';
  }

  function _selectProd(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const list = document.getElementById('q-items-list');
    if (!list) return;
    const idx = Date.now();
    const wrap = document.createElement('div');
    wrap.innerHTML = `
    <div class="q-item-row" id="row-${idx}" data-id="${id}">
      <div class="q-item-icon">🛏️</div>
      <div class="q-item-fields">
        <div class="q-item-title">
          <div style="font-weight:700;font-size:13px">${p.brand} ${p.model}</div>
          <div style="font-size:11px;color:var(--muted2)">${p.description||p.technology||''}</div>
          <input type="hidden" value="${p.brand} ${p.model}">
        </div>
        <div class="q-item-numbers">
          <div><label>Qtd</label><input class="form-input" type="number" min="1" value="1"></div>
          <div><label>Preço</label><input class="form-input" type="number" step="0.01" value="${p.price||0}"></div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm q-item-remove" onclick="this.parentElement.remove()">✕</button>
    </div>`;
    list.appendChild(wrap.firstElementChild);

    const searchInput = document.getElementById('q-prod-search');
    const resultsDiv = document.getElementById('q-prod-results');
    if (searchInput) searchInput.value = '';
    if (resultsDiv) resultsDiv.style.display = 'none';
  }

  async function _save(id = '') {
    const customerName = document.getElementById('q-customer').value.trim();
    const phone = document.getElementById('q-phone').value.trim();
    if (!customerName) { UI.toast('Informe o cliente.', 'warn'); return; }

    const items = [];
    document.querySelectorAll('.q-item-row').forEach(row => {
      const inputs = row.querySelectorAll('input');
      const hiddenName = row.querySelector('input[type="hidden"]')?.value;
      const name = hiddenName || inputs[0].value.trim();
      const qty = parseInt(inputs[0].type === 'hidden' ? inputs[1].value : inputs[0].value) || 0;
      const price = parseFloat(inputs[0].type === 'hidden' ? inputs[2].value : inputs[1].value) || 0;
      const productId = row.getAttribute('data-id') || null;
      if (name && qty > 0) items.push({ id: productId, name, qty, price, subtotal: qty * price });
    });

    if (items.length === 0) { UI.toast('Adicione ao menos um item ao orçamento.', 'warn'); return; }

    const total = items.reduce((s, i) => s + i.subtotal, 0);
    const companyId = Auth.getCompanyId();

    UI.loading(true);
    try {
      // 1. Integrar com CRM (Criar cliente se não existir)
      const cSnap = await db.collection('companies').doc(companyId).collection('customers').where('name', '==', customerName).limit(1).get();
      if (cSnap.empty) {
        await db.collection('companies').doc(companyId).collection('customers').add({
          name: customerName, phone,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: Auth.getProfileId(),
          createdByName: Auth.getProfile().name
        });
      }

      const data = {
        customerName, customerPhone: phone,
        notes: document.getElementById('q-notes').value,
        deliveryDays: parseInt(document.getElementById('q-delivery').value) || 7,
        expiresAt: new Date(document.getElementById('q-expires').value),
        items, total,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (id) {
        await db.collection('companies').doc(companyId).collection('quotes').doc(id).update(data);
      } else {
        const now = new Date();
        data.number = `ORC-${now.getFullYear()}-${UI.shortId()}`;
        data.status = 'pendente';
        data.sellerId = Auth.getProfileId();
        data.sellerName = Auth.getProfile().name;
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('companies').doc(companyId).collection('quotes').add(data);
      }

      UI.loading(false); UI.closeModal(); UI.toast('Orçamento salvo!');
      await _load();
    } catch (err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  function _view(id) {
    const q = all.find(x => x.id === id);
    if (!q) return;
    const wa = _waLink(q);
    UI.modal({
      title: `🧾 Orçamento ${q.number}`,
      size: 'lg',
      body: `
      <div class="quote-view-header">
        <div>
          <div class="quote-view-label">Cliente</div>
          <div class="quote-view-name">${q.customerName}</div>
          <div class="quote-view-sub">${q.customerPhone || 'Sem telefone cadastrado'}</div>
        </div>
        <div style="text-align:right">
          <div class="quote-view-label">Total</div>
          <div class="quote-view-total">${UI.money(q.total)}</div>
          ${UI.badge(q.status || 'pendente')}
        </div>
      </div>
      <div class="quote-view-sub" style="margin:14px 0 8px">📅 Válido até ${UI.date(q.expiresAt)} · 🚚 Entrega em ${q.deliveryDays || 7} dia(s)</div>
      <div class="table-wrap" style="margin-bottom:18px">
        <table>
          <thead><tr><th>Item</th><th>Qtd</th><th>Preço</th><th style="text-align:right">Subtotal</th></tr></thead>
          <tbody>
            ${q.items.map(i => `<tr><td>${i.name}</td><td>${i.qty}</td><td>${UI.money(i.price)}</td><td style="text-align:right;font-weight:700">${UI.money(i.subtotal)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${q.notes ? `<div class="quote-notes">📝 ${q.notes.replace(/\n/g, '<br>')}</div>` : ''}
      <div class="quote-view-actions">
        ${wa ? `<a class="btn btn-success" href="${wa}" target="_blank">📱 Enviar por WhatsApp</a>` : '<span style="font-size:12px;color:var(--muted);align-self:center">Cadastre o telefone do cliente para poder enviar por WhatsApp.</span>'}
        <button class="btn btn-secondary" onclick="Quotes._printPreview('${id}')">🖨️ Imprimir</button>
        <button class="btn btn-success" style="background:rgba(16,185,129,.15)" onclick="Quotes._setStatus('${id}','aprovado')">✅ Aprovar</button>
        <button class="btn btn-danger" onclick="Quotes._setStatus('${id}','expirado')">❌ Expirar</button>
        ${q.status === 'aprovado' ? `<button class="btn btn-primary" onclick="Quotes._convertToSale('${id}')">🔄 Converter em Venda</button>` : ''}
      </div>`,
      actions: [{ label: 'Fechar', cls: 'btn btn-secondary', action: 'UI.closeModal()' }]
    });
  }

  async function _setStatus(id, status) {
    await db.collection('companies').doc(Auth.getCompanyId()).collection('quotes').doc(id).update({ status });
    UI.closeModal(); UI.toast('Status atualizado!'); await _load();
  }

  async function _convertToSale(id) {
    const q = all.find(x => x.id === id);
    if (!q) return;
    UI.confirm(`Deseja converter o orçamento de ${q.customerName} em uma venda final?`, async () => {
      UI.loading(true);
      try {
        const companyId = Auth.getCompanyId();
        await db.collection('companies').doc(companyId).collection('sales').add({
          customerName: q.customerName, customerPhone: q.customerPhone,
          sellerId: q.sellerId, sellerName: q.sellerName,
          items: q.items, total: q.total, status: 'concluido',
          paymentMethod: 'a_definir', createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('companies').doc(companyId).collection('quotes').doc(id).update({ status: 'concluido' });
        UI.loading(false); UI.closeModal(); UI.toast('Venda registrada!');
        loadModule('sales');
      } catch (err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
    });
  }

  // ============================================================
  // Impressão do Orçamento — sempre mostra a prévia antes de imprimir
  // ============================================================
  function _printPreview(id) {
    const q = all.find(x => x.id === id);
    if (!q) return;
    UI.modal({
      title: '🖨️ Prévia de Impressão',
      size: 'md',
      body: `
        <div style="max-height:65vh; overflow:auto; background:#fff; border-radius:8px">${_quoteDocHtml(q, companySettings)}</div>
        <div style="font-size:11px; color:var(--muted); text-align:center; margin-top:10px">
          Dica: se aparecer link/data no topo, desmarque "Cabeçalhos e rodapés" em Mais configurações no diálogo de impressão.
        </div>
      `,
      actions: [
        { label: 'Fechar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: '🖨️ Imprimir', cls: 'btn btn-primary', action: `Quotes._printQuote('${id}')` }
      ]
    });
  }

  function _printQuote(id) {
    const q = all.find(x => x.id === id);
    if (!q) return;
    PrintDoc.open(_quoteDocHtml(q, companySettings), `Orcamento-${q.number || id.slice(-8).toUpperCase()}`);
  }

  function _quoteDocHtml(q, company) {
    const created = q.createdAt?.toDate ? q.createdAt.toDate() : new Date();
    const dateStr = created.toLocaleDateString('pt-BR');
    const expires = q.expiresAt?.toDate ? q.expiresAt.toDate() : (q.expiresAt ? new Date(q.expiresAt) : null);

    return `
    <style>
      .quote-doc { font-family:'DM Sans', Arial, sans-serif; color:#161616; background:#fff; max-width:640px; margin:0 auto; padding:30px; }
      .quote-doc .qd-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; border-bottom:3px solid #6366f1; padding-bottom:18px; margin-bottom:22px; }
      .quote-doc .qd-brand { display:flex; align-items:center; gap:10px; }
      .quote-doc .qd-brand img { max-height:46px; max-width:120px; object-fit:contain; }
      .quote-doc .qd-brand-name { font-size:21px; font-weight:800; letter-spacing:-.02em; }
      .quote-doc .qd-doc-title { text-align:right; flex-shrink:0; }
      .quote-doc .qd-label { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:#6366f1; font-weight:800; }
      .quote-doc .qd-number { font-size:16px; font-weight:800; font-family:'Courier New',monospace; margin-top:2px; }
      .quote-doc .qd-date { font-size:11px; color:#777; margin-top:3px; }
      .quote-doc .qd-info-grid { display:flex; justify-content:space-between; gap:20px; margin-bottom:22px; flex-wrap:wrap; }
      .quote-doc .qd-info-label { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#999; font-weight:700; margin-bottom:3px; }
      .quote-doc .qd-info-value { font-size:13px; font-weight:700; }
      .quote-doc table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:20px; }
      .quote-doc th { text-align:left; background:#f4f4f9; padding:9px 8px; font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:#666; border-bottom:2px solid #e2e2ea; }
      .quote-doc td { padding:9px 8px; border-bottom:1px solid #eee; }
      .quote-doc .qd-total-row { display:flex; justify-content:flex-end; align-items:baseline; gap:12px; margin-bottom:22px; padding-top:6px; }
      .quote-doc .qd-total-label { font-size:13px; color:#666; }
      .quote-doc .qd-total-value { font-size:28px; font-weight:900; color:#0a9d6f; letter-spacing:-.03em; }
      .quote-doc .qd-notes { background:#f9f9fc; border-left:3px solid #6366f1; border-radius:6px; padding:13px 15px; font-size:12px; color:#444; margin-bottom:22px; line-height:1.6; }
      .quote-doc .qd-footer { border-top:1px solid #eee; padding-top:14px; font-size:11px; color:#999; text-align:center; line-height:1.6; }
    </style>
    <div class="quote-doc">
      <div class="qd-header">
        <div class="qd-brand">
          ${company.logoUrl ? `<img src="${company.logoUrl}">` : ''}
          <div class="qd-brand-name">${company.fantasyName || 'Colchoeiro ERP'}</div>
        </div>
        <div class="qd-doc-title">
          <div class="qd-label">Orçamento</div>
          <div class="qd-number">${q.number || ('#' + (q.id || '').slice(-8).toUpperCase())}</div>
          <div class="qd-date">Emitido em ${dateStr}</div>
        </div>
      </div>

      <div class="qd-info-grid">
        <div>
          <div class="qd-info-label">Cliente</div>
          <div class="qd-info-value">${q.customerName || '—'}</div>
          ${q.customerPhone ? `<div style="font-size:11px;color:#888;margin-top:2px">${q.customerPhone}</div>` : ''}
        </div>
        <div>
          <div class="qd-info-label">Validade</div>
          <div class="qd-info-value">${expires ? expires.toLocaleDateString('pt-BR') : '—'}</div>
        </div>
        <div>
          <div class="qd-info-label">Prazo de Entrega</div>
          <div class="qd-info-value">${q.deliveryDays || 7} dia(s)</div>
        </div>
      </div>

      <table>
        <thead><tr><th>Item</th><th>Qtd</th><th style="text-align:right">Preço</th><th style="text-align:right">Subtotal</th></tr></thead>
        <tbody>
          ${(q.items || []).map(i => `<tr>
            <td>${i.name}</td>
            <td>${i.qty}</td>
            <td style="text-align:right">${UI.money(i.price)}</td>
            <td style="text-align:right; font-weight:700">${UI.money(i.subtotal ?? (i.price * i.qty))}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <div class="qd-total-row">
        <span class="qd-total-label">Total do Orçamento</span>
        <span class="qd-total-value">${UI.money(q.total)}</span>
      </div>

      ${q.notes ? `<div class="qd-notes">📝 ${q.notes.replace(/\n/g, '<br>')}</div>` : ''}

      <div class="qd-footer">
        Orçamento sujeito à disponibilidade de estoque no momento do fechamento.<br>
        Atendido por ${q.sellerName || '—'} · ${company.fantasyName || 'Colchoeiro ERP'}
      </div>
    </div>`;
  }

  return { render, _filter, _new, _edit, _save, _view, _setStatus, _convertToSale, _addManualRow, _searchProd, _selectProd, _printPreview, _printQuote };
})();
