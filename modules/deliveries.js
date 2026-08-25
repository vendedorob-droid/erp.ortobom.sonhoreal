// ============================================================
// COLCHOEIRO ERP — Módulo Entregas (Logística)
// ============================================================

const Deliveries = (() => {
  let all = [];          // entregador: pendentes
  let historyList = [];  // entregador: histórico (entregue + recusado, só leitura)
  let courierTab = 'pendente';
  let pendingRating = 0; // estrelas escolhidas no modal de feedback

  async function render(container) {
    if (Auth.hasMinRole('gerente')) {
      return _renderAdmin(container);
    }
    return _renderCourier(container);
  }

  // ── Visão do Entregador ─────────────────────────────────────
  async function _renderCourier(container) {
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Minhas Entregas</div><div class="page-sub" id="d-sub">Organize sua rota de hoje</div></div>
      </div>
      <div class="tabs" style="max-width:320px; margin-bottom:18px">
        <button class="tab active" id="d-tab-pendente" onclick="Deliveries._changeCourierTab('pendente')">Pendentes</button>
        <button class="tab" id="d-tab-historico" onclick="Deliveries._changeCourierTab('historico')">Meu Histórico</button>
      </div>
      <div id="d-list" class="delivery-grid" style="display:flex; flex-direction:column; gap:15px">
        ${UI.skeleton(3,['100%'])}
      </div>
      <div id="d-empty" style="display:none; text-align:center; padding:50px">
        <div style="font-size:60px">🎉</div>
        <div style="font-size:20px; font-weight:800; margin-top:15px">Parabéns!</div>
        <div style="color:var(--muted)">Você não tem mais nenhuma entrega para hoje.</div>
      </div>
    </div>`;
    await _load();
  }

  async function _changeCourierTab(tab) {
    courierTab = tab;
    ['pendente','historico'].forEach(t =>
      document.getElementById(`d-tab-${t}`).classList.toggle('active', t === tab));
    document.getElementById('d-empty').style.display = 'none';
    document.getElementById('d-list').style.display = 'flex';
    document.getElementById('d-list').innerHTML = UI.skeleton(3,['100%']);
    if (tab === 'pendente') await _load();
    else await _loadHistory();
  }

  // ── Visão do Admin/Gerente: acompanha todas as entregas ────
  let adminTab = 'pendente';
  let adminList = [];

  async function _renderAdmin(container) {
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Entregas</div><div class="page-sub" id="da-sub">Acompanhe as entregas do dia e o histórico da equipe</div></div>
      </div>
      <div class="tabs" style="max-width:420px; margin-bottom:18px">
        <button class="tab active" id="da-tab-pendente" onclick="Deliveries._changeAdminTab('pendente')">Pendentes</button>
        <button class="tab" id="da-tab-entregue" onclick="Deliveries._changeAdminTab('entregue')">Entregues</button>
        <button class="tab" id="da-tab-recusado" onclick="Deliveries._changeAdminTab('recusado')">Recusadas</button>
      </div>
      <div id="da-list" style="display:flex; flex-direction:column; gap:12px">${UI.skeleton(4,['100%'])}</div>
    </div>`;
    await _loadAdmin();
  }

  async function _changeAdminTab(tab) {
    adminTab = tab;
    ['pendente','entregue','recusado'].forEach(t =>
      document.getElementById(`da-tab-${t}`).classList.toggle('active', t === tab));
    await _loadAdmin();
  }

  async function _loadAdmin() {
    const companyId = Auth.getCompanyId();
    const dateField = adminTab === 'entregue' ? 'deliveredAt' : adminTab === 'recusado' ? 'failedAt' : 'createdAt';
    let snap;
    try {
      snap = await db.collection('companies').doc(companyId).collection('deliveries')
        .where('status', '==', adminTab).orderBy(dateField, 'desc').get();
    } catch (err) {
      // Fallback caso falte o índice composto — busca sem orderBy e ordena no cliente
      snap = await db.collection('companies').doc(companyId).collection('deliveries')
        .where('status', '==', adminTab).get();
    }
    adminList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    adminList.sort((a, b) => {
      const ta = a[dateField]?.toMillis ? a[dateField].toMillis() : 0;
      const tb = b[dateField]?.toMillis ? b[dateField].toMillis() : 0;
      return tb - ta;
    });
    _renderAdminList();
  }

  function _renderAdminList() {
    const el = document.getElementById('da-list');
    document.getElementById('da-sub').textContent = `${adminList.length} entrega(s) — ${
      adminTab === 'pendente' ? 'pendentes' : adminTab === 'entregue' ? 'entregues' : 'recusadas'}`;

    if (adminList.length === 0) {
      el.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:var(--muted)">Nenhuma entrega nesta categoria.</div>';
      return;
    }

    el.innerHTML = adminList.map(d => `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:start; gap:12px; flex-wrap:wrap">
          <div style="min-width:0">
            <div style="font-weight:800; font-size:15px">${d.customerName}</div>
            <div style="font-size:12px; color:var(--muted); margin-bottom:6px">${d.address || '—'}${d.building ? ' · ' + d.building : ''}${d.apartment ? ' · Apto ' + d.apartment : ''}</div>
            ${d.items && d.items.length ? `<div class="delivery-items">${d.items.map(i => `<span class="delivery-item-badge">📦 ${i.qty}× ${i.name}</span>`).join('')}</div>` : ''}
            ${adminTab === 'entregue' ? `
              <div style="font-size:12px; color:var(--green)">✅ Entregue por <b>${d.deliveredByName || '—'}</b> em ${UI.dateTime(d.deliveredAt)}</div>
              ${d.feedback || d.rating ? `
                <div class="feedback-box">
                  💬 ${d.feedback ? `"${d.feedback}"` : '<span style="color:var(--muted)">Sem observações</span>'}
                  ${d.rating ? ` · ${'⭐'.repeat(d.rating)}` : ''}
                </div>` : `<div style="font-size:11px; color:var(--muted); margin-top:4px">Sem feedback registrado.</div>`}
            ` : ''}
            ${adminTab === 'recusado' ? `
              <div style="font-size:12px; color:var(--red)">❌ Recusada por <b>${d.failedByName || '—'}</b> em ${UI.dateTime(d.failedAt)}</div>
              <div style="font-size:12px; color:var(--muted); margin-top:2px">Motivo: ${d.failReason || '—'}</div>
            ` : ''}
            ${adminTab === 'pendente' ? `
              <div style="font-size:12px; color:var(--muted)">Criada em ${UI.dateTime(d.createdAt)}</div>
            ` : ''}
          </div>
          <div>${UI.badge(d.status)}</div>
        </div>
      </div>
    `).join('');
  }

  // ── Entregador: pendentes ───────────────────────────────────
  async function _load() {
    const companyId = Auth.getCompanyId();
    let query = db.collection('companies').doc(companyId).collection('deliveries')
      .where('status', '==', 'pendente');

    // Simplificado: numa loja pequena, qualquer entregador vê todas as entregas pendentes.
    // (não há tela de atribuição de entregador por enquanto)

    const snap = await query.get();
    all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _renderList();
  }

  function _renderList() {
    const list = document.getElementById('d-list');
    const empty = document.getElementById('d-empty');

    if (all.length === 0) {
      list.style.display = 'none';
      empty.style.display = 'block';
      return;
    }

    list.style.display = 'flex';
    empty.style.display = 'none';
    document.getElementById('d-sub').textContent = `${all.length} entregas pendentes`;

    list.innerHTML = all.map((d, idx) => `
      <div class="card delivery-card" draggable="true" ondragstart="Deliveries._drag(event, ${idx})" ondragover="event.preventDefault()" ondrop="Deliveries._drop(event, ${idx})" style="cursor:move; border-left:5px solid var(--primary, var(--accent))">
        <div style="display:flex; justify-content:space-between; align-items:start; gap:12px; flex-wrap:wrap">
          <div style="min-width:0">
            <div style="font-weight:800; font-size:16px">${d.customerName}</div>
            <div style="font-size:12px; color:var(--muted); margin-bottom:8px">${d.address}</div>

            ${d.items && d.items.length ? `<div class="delivery-items">${d.items.map(i => `<span class="delivery-item-badge">📦 ${i.qty}× ${i.name}</span>`).join('')}</div>` : ''}

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:12px; background:var(--surface2); padding:10px; border-radius:8px; margin-top:8px">
              <div><b>Prédio:</b> ${d.building||'—'}</div>
              <div><b>Quadra:</b> ${d.block||'—'}</div>
              <div><b>Andar:</b> ${d.floor||'—'}</div>
              <div><b>Apto:</b> ${d.apartment||'—'}</div>
            </div>
          </div>
          <div style="text-align:right">
            <a href="https://wa.me/55${d.phone?.replace(/\D/g,'')}" target="_blank" class="btn btn-success btn-sm" style="margin-bottom:5px; display:block">💬 WhatsApp</a>
            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address)}" target="_blank" class="btn btn-secondary btn-sm" style="display:block">📍 Maps</a>
          </div>
        </div>

        <div style="margin-top:15px; display:flex; gap:10px">
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="Deliveries._confirm('${d.id}')">✅ Confirmar Entrega</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="Deliveries._fail('${d.id}')">❌ Recusa</button>
        </div>
      </div>
    `).join('');
  }

  // ── Entregador: histórico (somente leitura) ─────────────────
  async function _loadHistory() {
    const companyId = Auth.getCompanyId();
    const profileId = Auth.getProfileId();
    const snap = await db.collection('companies').doc(companyId).collection('deliveries')
      .where('status', 'in', ['entregue', 'recusado']).get();

    historyList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(d => d.deliveredBy === profileId || d.failedBy === profileId);

    historyList.sort((a, b) => {
      const ta = (a.deliveredAt || a.failedAt)?.toMillis ? (a.deliveredAt || a.failedAt).toMillis() : 0;
      const tb = (b.deliveredAt || b.failedAt)?.toMillis ? (b.deliveredAt || b.failedAt).toMillis() : 0;
      return tb - ta;
    });
    _renderHistoryList();
  }

  function _renderHistoryList() {
    const list = document.getElementById('d-list');
    document.getElementById('d-empty').style.display = 'none';
    list.style.display = 'flex';
    document.getElementById('d-sub').textContent = `${historyList.length} entrega(s) no seu histórico`;

    if (historyList.length === 0) {
      list.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:var(--muted)">Você ainda não tem entregas no histórico.</div>';
      return;
    }

    // Somente leitura: sem botões de editar/excluir/reabrir.
    list.innerHTML = historyList.map(d => `
      <div class="card" style="border-left:5px solid ${d.status === 'entregue' ? 'var(--green)' : 'var(--red)'}">
        <div style="display:flex; justify-content:space-between; align-items:start; gap:12px; flex-wrap:wrap">
          <div style="min-width:0">
            <div style="font-weight:800; font-size:15px">${d.customerName}</div>
            <div style="font-size:12px; color:var(--muted); margin-bottom:6px">${d.address || '—'}</div>
            ${d.items && d.items.length ? `<div class="delivery-items">${d.items.map(i => `<span class="delivery-item-badge">📦 ${i.qty}× ${i.name}</span>`).join('')}</div>` : ''}
            ${d.status === 'entregue' ? `
              <div style="font-size:12px; color:var(--green); margin-top:4px">✅ Entregue em ${UI.dateTime(d.deliveredAt)}</div>
              ${d.feedback || d.rating ? `
                <div class="feedback-box">
                  💬 ${d.feedback ? `"${d.feedback}"` : 'Sem observações'}${d.rating ? ` · ${'⭐'.repeat(d.rating)}` : ''}
                </div>` : ''}
            ` : `
              <div style="font-size:12px; color:var(--red); margin-top:4px">❌ Recusada em ${UI.dateTime(d.failedAt)}</div>
              <div style="font-size:12px; color:var(--muted); margin-top:2px">Motivo: ${d.failReason || '—'}</div>
            `}
          </div>
          <div>${UI.badge(d.status)}</div>
        </div>
      </div>
    `).join('');
  }

  function _drag(e, idx) { e.dataTransfer.setData('idx', idx); }
  function _drop(e, targetIdx) {
    const sourceIdx = e.dataTransfer.getData('idx');
    const item = all.splice(sourceIdx, 1)[0];
    all.splice(targetIdx, 0, item);
    _renderList();
  }

  function _confirm(id) {
    UI.confirm('Realmente confirma a entrega?', async () => {
      UI.loading(true);
      try {
        await db.collection('companies').doc(Auth.getCompanyId()).collection('deliveries').doc(id).update({
          status: 'entregue',
          deliveredAt: firebase.firestore.FieldValue.serverTimestamp(),
          deliveredBy: Auth.getProfileId(),
          deliveredByName: Auth.getProfile().name
        });
        all = all.filter(x => x.id !== id);
        _renderList();
        UI.loading(false);
        UI.toast('Entrega confirmada!', 'success');
        _openFeedback(id);
      } catch (err) { UI.loading(false); UI.toast(err.message, 'error'); }
    });
  }

  function _fail(id) {
    UI.modal({
      title: 'Motivo da Recusa',
      body: `
        <div class="form-group">
          <label class="form-label">Por que o cliente não quis receber?</label>
          <textarea class="form-input" id="fail-reason" rows="3" placeholder="Ex: Produto com defeito, Endereço errado..."></textarea>
        </div>
      `,
      actions: [
        { label: 'Voltar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: 'Registrar Recusa', cls: 'btn btn-danger', action: `Deliveries._saveFail('${id}')` }
      ]
    });
  }

  async function _saveFail(id) {
    const reason = document.getElementById('fail-reason').value;
    if (!reason) return;
    UI.loading(true);
    try {
      await db.collection('companies').doc(Auth.getCompanyId()).collection('deliveries').doc(id).update({
        status: 'recusado',
        failReason: reason,
        failedAt: firebase.firestore.FieldValue.serverTimestamp(),
        failedBy: Auth.getProfileId(),
        failedByName: Auth.getProfile().name
      });
      all = all.filter(x => x.id !== id);
      _renderList();
      UI.closeModal();
      UI.toast('Recusa registrada.');
    } catch (err) { UI.toast(err.message, 'error'); }
    UI.loading(false);
  }

  // ── Feedback pós-entrega (entregador) ───────────────────────
  function _openFeedback(id) {
    pendingRating = 0;
    UI.modal({
      title: 'Como foi a entrega?',
      size: 'sm',
      body: `
        <div style="text-align:center; margin-bottom:16px" class="star-picker" id="fb-stars">${_starsHtml(0)}</div>
        <div class="form-group">
          <label class="form-label">Observações (opcional)</label>
          <textarea class="form-input" id="fb-text" rows="3" placeholder="Ex: Cliente satisfeito, sem imprevistos, subiu sem elevador..."></textarea>
        </div>
      `,
      actions: [
        { label: 'Pular', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: 'Enviar Feedback', cls: 'btn btn-primary', action: `Deliveries._saveFeedback('${id}')` }
      ]
    });
  }

  function _starsHtml(n) {
    return Array.from({ length: 5 }, (_, i) => `
      <span onclick="Deliveries._setRating(${i+1})" style="color:${i < n ? '#f59e0b' : 'var(--border2)'}">★</span>
    `).join('');
  }

  function _setRating(n) {
    pendingRating = n;
    const el = document.getElementById('fb-stars');
    if (el) el.innerHTML = _starsHtml(n);
  }

  async function _saveFeedback(id) {
    const text = document.getElementById('fb-text')?.value?.trim() || '';
    UI.loading(true);
    try {
      await db.collection('companies').doc(Auth.getCompanyId()).collection('deliveries').doc(id).update({
        feedback: text,
        rating: pendingRating || null,
        feedbackAt: firebase.firestore.FieldValue.serverTimestamp(),
        feedbackBy: Auth.getProfileId()
      });
      UI.loading(false);
      UI.closeModal();
      UI.toast('Obrigado pelo feedback!', 'success');
    } catch (err) { UI.loading(false); UI.toast(err.message, 'error'); }
  }

  return {
    render, _drag, _drop, _confirm, _fail, _saveFail,
    _changeAdminTab, _changeCourierTab, _setRating, _saveFeedback
  };
})();
