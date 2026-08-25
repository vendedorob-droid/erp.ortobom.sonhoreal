// ============================================================
// COLCHOEIRO ERP — Módulo Estoque (Multi-Loja)
// ============================================================
// Modelo de dados:
//   companies/{cid}/stores/{id}        → { name, address, sellerId, sellerName, active, isDefault, createdAt }
//   products/{id}.stockByStore         → { [storeId]: qty }  (fonte de verdade por loja)
//   products/{id}.stock                → soma total (mantido por compatibilidade com telas antigas)
//   companies/{cid}/stock_movements    → log de entradas / transferências / estornos

const Stock = (() => {
  let stores = [];
  let defaultStoreId = null;
  let allProducts = [];
  let movements = [];
  let currentTab = 'lojas';

  // ── Garante que existe ao menos uma loja (migração automática) ─────
  async function getStores(force = false) {
    if (stores.length && !force) return stores;
    const companyId = Auth.getCompanyId();
    const snap = await db.collection('companies').doc(companyId).collection('stores').orderBy('name').get();
    let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (list.length === 0) {
      const ref = await db.collection('companies').doc(companyId).collection('stores').add({
        name: 'Loja Matriz', address: '', sellerId: null, sellerName: null,
        active: true, isDefault: true, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      list = [{ id: ref.id, name: 'Loja Matriz', address: '', active: true, isDefault: true }];
    }
    stores = list;
    defaultStoreId = (list.find(s => s.isDefault) || list[0]).id;
    return stores;
  }

  // Qtd de um produto numa loja, com fallback pro estoque legado (pré-multi-loja)
  function _qtyAt(p, storeId) {
    if (p.stockByStore && p.stockByStore[storeId] != null) return p.stockByStore[storeId];
    if (storeId === defaultStoreId) return p.stock || 0;
    return 0;
  }

  async function render(container) {
    if (!Auth.hasMinRole('gerente')) { container.innerHTML = '<div class="p-20">Acesso negado.</div>'; return; }
    await getStores();

    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Estoque</div><div class="page-sub">Lojas, itens, transferências e relatórios</div></div>
      </div>
      <div class="tabs" style="max-width:600px; margin-bottom:18px; flex-wrap:wrap">
        <button class="tab active" id="st-tab-lojas" onclick="Stock._changeTab('lojas')">🏬 Lojas</button>
        <button class="tab" id="st-tab-itens" onclick="Stock._changeTab('itens')">📦 Itens</button>
        <button class="tab" id="st-tab-historico" onclick="Stock._changeTab('historico')">🕓 Histórico</button>
        <button class="tab" id="st-tab-critico" onclick="Stock._changeTab('critico')">⚠️ Crítico</button>
        <button class="tab" id="st-tab-relatorio" onclick="Stock._changeTab('relatorio')">📊 Relatório</button>
      </div>
      <div id="st-content">${UI.skeleton(4,['100%'])}</div>
    </div>`;

    await _renderLojas();
  }

  async function _changeTab(tab) {
    currentTab = tab;
    ['lojas','itens','historico','critico','relatorio'].forEach(t =>
      document.getElementById(`st-tab-${t}`).classList.toggle('active', t === tab));
    document.getElementById('st-content').innerHTML = UI.skeleton(4,['100%']);
    if (tab === 'lojas') await _renderLojas();
    else if (tab === 'itens') await _renderItens();
    else if (tab === 'historico') await _renderHistorico();
    else if (tab === 'critico') await _renderCritico();
    else if (tab === 'relatorio') await _renderRelatorio();
  }

  // ============================================================
  // Aba: Lojas
  // ============================================================
  async function _renderLojas() {
    await getStores(true);
    const el = document.getElementById('st-content');
    el.innerHTML = `
      <div class="page-header" style="margin-bottom:14px">
        <div class="card-title">Lojas cadastradas</div>
        <button class="btn btn-primary btn-sm" onclick="Stock._openStoreForm(null)">+ Nova Loja</button>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px">
        ${stores.map(s => `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px">
            <div style="width:40px; height:40px; border-radius:10px; background:rgba(99,102,241,.12); display:flex; align-items:center; justify-content:center; font-size:18px">🏬</div>
            ${UI.badge(s.active !== false ? 'ativo' : 'inativo')}
          </div>
          <div style="font-weight:800; font-size:16px">${s.name}${s.isDefault ? ' <span style="font-size:10px;color:var(--muted)">(padrão)</span>' : ''}</div>
          <div style="font-size:12px; color:var(--muted); margin-bottom:10px">${s.address || 'Sem endereço cadastrado'}</div>
          <div style="font-size:12px; color:var(--muted2); margin-bottom:12px">👤 Responsável: <b>${s.sellerName || 'Não atribuído'}</b></div>
          <button class="btn btn-secondary btn-sm" style="width:100%" onclick="Stock._openStoreForm('${s.id}')">Editar</button>
        </div>`).join('')}
      </div>`;
  }

  async function _openStoreForm(id) {
    const s = id ? stores.find(x => x.id === id) : {};
    const companyId = Auth.getCompanyId();
    const profSnap = await db.collection('profiles').where('companyId', '==', companyId).get();
    const sellers = profSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false);

    UI.modal({
      title: id ? 'Editar Loja' : 'Nova Loja',
      size: 'sm',
      body: `
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Nome da Loja</label><input class="form-input" id="st-name" value="${s.name||''}" placeholder="Ex: Loja 2 - Centro"></div>
          <div class="form-group"><label class="form-label">Endereço</label><input class="form-input" id="st-address" value="${s.address||''}" placeholder="Rua, número, bairro..."></div>
          <div class="form-group">
            <label class="form-label">Vendedor responsável</label>
            <select class="form-input" id="st-seller">
              <option value="">— Nenhum —</option>
              ${sellers.map(p => `<option value="${p.id}" ${s.sellerId===p.id?'selected':''}>${p.name} (${p.role})</option>`).join('')}
            </select>
          </div>
          <div style="text-align:center; margin-top:-6px">
            <button class="btn btn-ghost btn-sm" onclick="Stock._quickAddSeller()">+ Cadastrar novo vendedor</button>
          </div>
          <div class="form-group"><label class="form-label">Status</label>
            <select class="form-input" id="st-active">
              <option value="1" ${s.active!==false?'selected':''}>Ativa</option>
              <option value="0" ${s.active===false?'selected':''}>Inativa</option>
            </select>
          </div>
        </div>`,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: id ? '💾 Salvar' : '➕ Criar Loja', cls: 'btn btn-primary', action: `Stock._saveStore('${id||''}')` }
      ]
    });
  }

  // Cadastro rápido de vendedor sem sair do formulário da loja
  function _quickAddSeller() {
    UI.modal({
      title: 'Novo Vendedor',
      size: 'sm',
      body: `
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Nome Completo</label><input class="form-input" id="qs-name" placeholder="Ex: Maria Silva"></div>
          <div class="form-group"><label class="form-label">PIN de acesso (4 dígitos)</label><input class="form-input" type="text" inputmode="numeric" maxlength="4" id="qs-pin" placeholder="Ex: 5678"></div>
        </div>`,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'Stock._openStoreForm(null)' },
        { label: 'Cadastrar', cls: 'btn btn-primary', action: 'Stock._saveQuickSeller()' }
      ]
    });
  }

  async function _saveQuickSeller() {
    const name = document.getElementById('qs-name').value.trim();
    const pin = document.getElementById('qs-pin').value.trim();
    if (!name) { UI.toast('Informe o nome.', 'warn'); return; }
    if (!/^\d{4}$/.test(pin)) { UI.toast('Informe um PIN de 4 dígitos.', 'warn'); return; }
    UI.loading(true);
    try {
      const dup = await db.collection('profiles').where('pin', '==', pin).get();
      if (!dup.empty) { UI.loading(false); UI.toast('Esse PIN já está em uso.', 'warn'); return; }
      const ref = await db.collection('profiles').add({
        name, pin, role: 'vendedor', active: true,
        companyId: Auth.getCompanyId(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      UI.loading(false);
      UI.toast('Vendedor cadastrado!', 'success');
      _openStoreForm(null);
      setTimeout(() => { const sel = document.getElementById('st-seller'); if (sel) { const opt = document.createElement('option'); opt.value = ref.id; opt.textContent = `${name} (vendedor)`; opt.selected = true; sel.appendChild(opt); } }, 50);
    } catch (err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  async function _saveStore(id) {
    const name = document.getElementById('st-name').value.trim();
    if (!name) { UI.toast('Informe o nome da loja.', 'warn'); return; }
    const sellerId = document.getElementById('st-seller').value || null;
    const sellerName = sellerId ? document.getElementById('st-seller').selectedOptions[0].textContent.replace(/\s*\(.+\)$/, '') : null;

    const data = {
      name,
      address: document.getElementById('st-address').value.trim(),
      sellerId, sellerName,
      active: document.getElementById('st-active').value === '1',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    UI.loading(true);
    try {
      const col = db.collection('companies').doc(Auth.getCompanyId()).collection('stores');
      let storeId = id;
      if (id) { await col.doc(id).update(data); }
      else { data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); const ref = await col.add(data); storeId = ref.id; }

      // Vincula a loja ao perfil do vendedor escolhido
      if (sellerId) {
        await db.collection('profiles').doc(sellerId).update({ storeId, storeName: name });
      }

      UI.loading(false); UI.closeModal(); UI.toast('Loja salva!', 'success');
      await _renderLojas();
    } catch (err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  // ============================================================
  // Aba: Itens por Loja
  // ============================================================
  async function _loadProducts() {
    const snap = await db.collection('companies').doc(Auth.getCompanyId()).collection('products').orderBy('brand').get();
    allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function _renderItens(searchTerm = '') {
    if (allProducts.length === 0) await _loadProducts();
    const term = searchTerm.toLowerCase();
    const list = term
      ? allProducts.filter(p => `${p.brand} ${p.model} ${p.barcode||''}`.toLowerCase().includes(term))
      : allProducts;

    document.getElementById('st-content').innerHTML = `
      <div class="table-wrap">
        <div class="table-toolbar">
          <input class="form-input" style="max-width:280px" placeholder="Buscar produto..." value="${searchTerm}" oninput="Stock._searchItens(this.value)">
        </div>
        <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Produto</th>${stores.map(s => `<th>${s.name}</th>`).join('')}<th>Total</th><th></th></tr></thead>
          <tbody>
            ${list.map(p => `<tr>
              <td><div style="font-weight:700">${p.brand} ${p.model}</div><div style="font-size:11px;color:var(--muted)">${p.barcode||'—'}</div></td>
              ${stores.map(s => { const q = _qtyAt(p, s.id); return `<td><span style="font-weight:700; color:${q<=3?'var(--red)':'inherit'}">${q}${q<=3?' ⚠️':''}</span></td>`; }).join('')}
              <td style="font-weight:800">${p.stock||0}</td>
              <td><button class="btn btn-secondary btn-sm" onclick="Stock._openTransfer('${p.id}')">🔁 Transferir</button></td>
            </tr>`).join('') || `<tr><td colspan="${stores.length+3}" style="text-align:center;padding:24px;color:var(--muted)">Nenhum produto encontrado.</td></tr>`}
          </tbody>
        </table></div>
      </div>`;
  }

  function _searchItens(v) { _renderItens(v); }

  function _openTransfer(productId) {
    const p = allProducts.find(x => x.id === productId);
    if (!p) return;
    const options = stores.filter(s => s.active !== false).map(s => `<option value="${s.id}">${s.name} (${_qtyAt(p, s.id)} un)</option>`).join('');
    UI.modal({
      title: '🔁 Transferir Estoque',
      size: 'sm',
      body: `
        <div class="form-group"><label class="form-label">Produto</label><div style="font-weight:700">${p.brand} ${p.model}</div></div>
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Loja de Origem</label><select class="form-input" id="tr-from" onchange="Stock._updateTransferHint('${productId}')">${options}</select></div>
          <div class="form-group"><label class="form-label">Loja de Destino</label><select class="form-input" id="tr-to">${options}</select></div>
        </div>
        <div class="form-group"><label class="form-label">Quantidade</label><input class="form-input" type="number" id="tr-qty" min="1" value="1"></div>
        <div id="tr-hint" style="font-size:12px; color:var(--muted)"></div>
      `,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: 'Confirmar Transferência', cls: 'btn btn-primary', action: `Stock._doTransfer('${productId}')` }
      ]
    });
    _updateTransferHint(productId);
  }

  function _updateTransferHint(productId) {
    const p = allProducts.find(x => x.id === productId);
    const fromId = document.getElementById('tr-from')?.value;
    if (!p || !fromId) return;
    const avail = _qtyAt(p, fromId);
    document.getElementById('tr-hint').textContent = `Disponível na loja de origem: ${avail} unidade(s).`;
  }

  async function _doTransfer(productId) {
    const fromId = document.getElementById('tr-from').value;
    const toId = document.getElementById('tr-to').value;
    const qty = parseInt(document.getElementById('tr-qty').value) || 0;
    if (!fromId || !toId || fromId === toId) { UI.toast('Selecione lojas de origem e destino diferentes.', 'warn'); return; }
    if (qty <= 0) { UI.toast('Informe uma quantidade válida.', 'warn'); return; }

    UI.loading(true);
    try {
      const companyId = Auth.getCompanyId();
      const pRef = db.collection('companies').doc(companyId).collection('products').doc(productId);
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(pRef);
        if (!doc.exists) throw new Error('Produto não encontrado.');
        const p = doc.data();
        const map = { ...(p.stockByStore || {}) };
        const fromQty = map[fromId] != null ? map[fromId] : (fromId === defaultStoreId ? (p.stock || 0) : 0);
        if (fromQty < qty) throw new Error('Estoque insuficiente na loja de origem.');
        map[fromId] = fromQty - qty;
        map[toId] = (map[toId] != null ? map[toId] : (toId === defaultStoreId ? (p.stock || 0) : 0)) + qty;
        tx.update(pRef, { stockByStore: map });
      });

      const p = allProducts.find(x => x.id === productId);
      const fromName = stores.find(s => s.id === fromId)?.name || '—';
      const toName = stores.find(s => s.id === toId)?.name || '—';
      await db.collection('companies').doc(companyId).collection('stock_movements').add({
        type: 'transferencia',
        productId, productName: `${p.brand} ${p.model}`,
        fromStoreId: fromId, fromStoreName: fromName,
        toStoreId: toId, toStoreName: toName,
        qty,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: Auth.getProfileId(), createdByName: Auth.getProfile().name
      });

      UI.loading(false); UI.closeModal(); UI.toast('Transferência realizada!', 'success');
      await _loadProducts();
      await _renderItens();
    } catch (err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  // ============================================================
  // Aba: Histórico (entradas + transferências + estornos)
  // ============================================================
  let historyFilter = 'todos';

  async function _renderHistorico() {
    const companyId = Auth.getCompanyId();
    const snap = await db.collection('companies').doc(companyId).collection('stock_movements')
      .orderBy('createdAt', 'desc').limit(200).get();
    movements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _drawHistorico();
  }

  function _filterHistorico(type) {
    historyFilter = type;
    document.querySelectorAll('#hist-filters .filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`hf-${type}`).classList.add('active');
    _drawHistorico();
  }

  function _drawHistorico() {
    const list = historyFilter === 'todos' ? movements : movements.filter(m => m.type === historyFilter);
    const TYPE_LABEL = { entrada: '📥 Entrada', transferencia: '🔁 Transferência', estorno: '↩️ Estorno (cancelamento)' };

    document.getElementById('st-content').innerHTML = `
      <div class="filter-bar" id="hist-filters" style="margin-bottom:16px">
        <button class="filter-btn ${historyFilter==='todos'?'active':''}" id="hf-todos" onclick="Stock._filterHistorico('todos')">Todos</button>
        <button class="filter-btn ${historyFilter==='entrada'?'active':''}" id="hf-entrada" onclick="Stock._filterHistorico('entrada')">Entradas</button>
        <button class="filter-btn ${historyFilter==='transferencia'?'active':''}" id="hf-transferencia" onclick="Stock._filterHistorico('transferencia')">Transferências</button>
        <button class="filter-btn ${historyFilter==='estorno'?'active':''}" id="hf-estorno" onclick="Stock._filterHistorico('estorno')">Estornos</button>
      </div>
      <div class="table-wrap"><div style="overflow-x:auto">
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Movimento</th><th>Qtd</th><th>Responsável</th></tr></thead>
          <tbody>
            ${list.map(m => `<tr>
              <td>${UI.dateTime(m.createdAt)}</td>
              <td>${TYPE_LABEL[m.type] || m.type}</td>
              <td>${m.productName || '—'}</td>
              <td>${m.type === 'transferencia' ? `${m.fromStoreName} → ${m.toStoreName}` : (m.storeName || m.toStoreName || '—')}</td>
              <td style="font-weight:700">${m.qty}</td>
              <td>${m.createdByName || '—'}</td>
            </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Nenhuma movimentação registrada ainda.</td></tr>'}
          </tbody>
        </table>
      </div></div>`;
  }

  // ============================================================
  // Aba: Estoque Crítico
  // ============================================================
  async function _renderCritico() {
    if (allProducts.length === 0) await _loadProducts();
    const rows = [];
    allProducts.forEach(p => {
      stores.forEach(s => {
        const q = _qtyAt(p, s.id);
        if (q <= 3) rows.push({ p, store: s, q });
      });
    });
    rows.sort((a, b) => a.q - b.q);

    document.getElementById('st-content').innerHTML = `
      <div class="page-sub" style="margin-bottom:14px">${rows.length} item(ns) em estoque crítico (≤ 3 unidades)</div>
      <div class="table-wrap"><div style="overflow-x:auto">
        <table>
          <thead><tr><th>Produto</th><th>Loja</th><th>Qtd Atual</th><th></th></tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td><div style="font-weight:700">${r.p.brand} ${r.p.model}</div><div style="font-size:11px;color:var(--muted)">${r.p.barcode||'—'}</div></td>
              <td>${r.store.name}</td>
              <td><span style="font-weight:800; color:var(--red)">${r.q} un ⚠️</span></td>
              <td><button class="btn btn-secondary btn-sm" onclick="Stock._openTransfer('${r.p.id}')">🔁 Transferir</button></td>
            </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted)">Nenhum item em estoque crítico. 🎉</td></tr>'}
          </tbody>
        </table>
      </div></div>`;
  }

  // ============================================================
  // Aba: Relatório de Estoque (filtros + impressão)
  // ============================================================
  let reportResults = [];
  let reportFilters = {};
  let companySettings = {};

  async function _renderRelatorio() {
    if (allProducts.length === 0) await _loadProducts();
    try {
      const snap = await db.collection('companies').doc(Auth.getCompanyId()).collection('settings').doc('general').get();
      companySettings = snap.exists ? snap.data() : {};
    } catch (e) { companySettings = {}; }

    document.getElementById('st-content').innerHTML = `
      <div class="card" style="margin-bottom:20px">
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Buscar (marca/modelo)</label><input class="form-input" id="rp-search" placeholder="Ex: Castor"></div>
          <div class="form-group">
            <label class="form-label">Loja</label>
            <select class="form-input" id="rp-store">
              <option value="">Todas (consolidado)</option>
              ${stores.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="display:flex; gap:10px; margin-top:6px; flex-wrap:wrap">
          <button class="btn btn-primary" onclick="Stock._generateStockReport()">Gerar Relatório</button>
        </div>
      </div>
      <div id="rp-summary"></div>
      <div id="rp-results"></div>
    `;
  }

  function _generateStockReport() {
    const term = document.getElementById('rp-search').value.trim().toLowerCase();
    const storeId = document.getElementById('rp-store').value;

    let results = allProducts.filter(p => p.active !== false);
    if (term) results = results.filter(p => `${p.brand} ${p.model}`.toLowerCase().includes(term));

    const rows = results.map(p => ({
      brand: p.brand, model: p.model, cost: p.cost || 0,
      qty: storeId ? _qtyAt(p, storeId) : (p.stock || 0)
    }));

    reportResults = rows;
    reportFilters = { term, storeId, storeName: storeId ? stores.find(s => s.id === storeId)?.name : 'Todas as lojas (consolidado)' };
    _drawStockReport(rows);
  }

  function _drawStockReport(rows) {
    const totalUnits = rows.reduce((s, r) => s + r.qty, 0);
    const totalValue = rows.reduce((s, r) => s + r.qty * r.cost, 0);

    document.getElementById('rp-summary').innerHTML = `
      <div class="metric-grid" style="margin-bottom:20px">
        <div class="metric-card"><div class="metric-label">Itens Diferentes</div><div class="metric-value">${rows.length}</div></div>
        <div class="metric-card"><div class="metric-label">Unidades em Estoque</div><div class="metric-value">${totalUnits}</div></div>
        <div class="metric-card"><div class="metric-label">Valor em Estoque (custo)</div><div class="metric-value" style="color:var(--green)">${UI.money(totalValue)}</div></div>
      </div>`;

    document.getElementById('rp-results').innerHTML = `
      <div class="table-wrap">
        <div class="table-toolbar" style="justify-content:flex-end; flex-direction:column; align-items:flex-end; gap:4px">
          <button class="btn btn-secondary btn-sm" onclick="Stock._printStockReport()" ${rows.length===0?'disabled':''}>🖨️ Imprimir Relatório</button>
          <span style="font-size:10.5px; color:var(--muted)">Se aparecer link/data no topo, desmarque "Cabeçalhos e rodapés" no diálogo de impressão.</span>
        </div>
        <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Marca</th><th>Modelo</th><th>Estoque Atual</th><th>Último Custo</th><th>Valor em Estoque</th></tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td>${r.brand}</td><td>${r.model}</td>
              <td style="font-weight:700; color:${r.qty<=3?'var(--red)':'inherit'}">${r.qty}</td>
              <td>${UI.money(r.cost)}</td>
              <td style="font-weight:700">${UI.money(r.qty * r.cost)}</td>
            </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">Nenhum item encontrado.</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  }

  function _printStockReport() {
    if (reportResults.length === 0) return;
    const totalUnits = reportResults.reduce((s, r) => s + r.qty, 0);
    const totalValue = reportResults.reduce((s, r) => s + r.qty * r.cost, 0);
    const f = reportFilters;

    const html = `
      <style>
        .report-doc { font-family:'DM Sans', Arial, sans-serif; color:#111; background:#fff; padding:24px; }
        .report-doc h1 { font-size:18px; margin:0 0 4px; }
        .report-doc .rp-sub { font-size:11px; color:#555; margin-bottom:16px; }
        .report-doc table { width:100%; border-collapse:collapse; font-size:11px; }
        .report-doc th { text-align:left; background:#f2f2f2; padding:6px 4px; border-bottom:1px solid #ccc; }
        .report-doc td { padding:5px 4px; border-bottom:1px solid #eee; }
        .report-doc .rp-summary { display:flex; gap:24px; margin-bottom:16px; }
        .report-doc .rp-summary span { font-size:11px; color:#555; display:block; }
        .report-doc .rp-summary b { display:block; font-size:15px; }
      </style>
      <div class="report-doc">
        <h1>${companySettings.fantasyName || 'Colchoeiro ERP'} — Relatório de Estoque</h1>
        <div class="rp-sub">
          Loja: ${f.storeName}${f.term ? ` · Busca: "${f.term}"` : ''} · Gerado em ${new Date().toLocaleString('pt-BR')}
        </div>
        <div class="rp-summary">
          <div><span>Itens diferentes</span><b>${reportResults.length}</b></div>
          <div><span>Unidades em estoque</span><b>${totalUnits}</b></div>
          <div><span>Valor em estoque (custo)</span><b>${UI.money(totalValue)}</b></div>
        </div>
        <table>
          <thead><tr><th>Marca</th><th>Modelo</th><th>Estoque Atual</th><th>Último Custo</th><th>Valor em Estoque</th></tr></thead>
          <tbody>
            ${reportResults.map(r => `<tr>
              <td>${r.brand}</td><td>${r.model}</td><td>${r.qty}</td><td>${UI.money(r.cost)}</td><td>${UI.money(r.qty * r.cost)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    PrintDoc.open(html, `Relatorio-Estoque-${new Date().toISOString().slice(0, 10)}`);
  }

  return {
    render, _changeTab,
    _openStoreForm, _saveStore, _quickAddSeller, _saveQuickSeller,
    _searchItens, _openTransfer, _updateTransferHint, _doTransfer,
    _filterHistorico, _renderCritico,
    _generateStockReport, _printStockReport,
    getStores
  };
})();
