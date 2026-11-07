// ============================================================
// COLCHOEIRO ERP — Módulo Vendas
// ============================================================

// Lista padrão de formas de pagamento — usada quando a empresa ainda
// não configurou nada em Configurações → Formas de Pagamento. Os IDs
// são fixos de propósito (não aleatórios) para ficar compatível com
// vendas antigas gravadas com esses mesmos valores, e para que Vendas,
// Financeiro e Configurações sempre caiam nos mesmos padrões mesmo sem
// nada salvo ainda no Firestore.
function _defaultPaymentMethods(legacyCashDiscount) {
  const d = legacyCashDiscount != null ? legacyCashDiscount : 5;
  return [
    { id: 'pix', name: 'PIX', discount: d, installments: false },
    { id: 'dinheiro', name: 'Dinheiro', discount: d, installments: false },
    { id: 'cartao_debito', name: 'Cartão de Débito', discount: 0, installments: false },
    { id: 'cartao_credito', name: 'Cartão de Crédito', discount: 0, installments: true },
  ];
}

const Sales = (() => {

  let all = [], filtered = [], page = 1;
  let paymentMethods = [];
  const PER_PAGE = 15;

  async function _loadPaymentMethods() {
    try {
      const snap = await db.collection('companies').doc(Auth.getCompanyId()).collection('settings').doc('general').get();
      const d = snap.exists ? snap.data() : {};
      paymentMethods = (d.paymentMethods && d.paymentMethods.length) ? d.paymentMethods : _defaultPaymentMethods(d.cashDiscount);
    } catch (e) { paymentMethods = _defaultPaymentMethods(); }
  }

  async function render(container) {
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Vendas</div><div class="page-sub" id="s-sub">Carregando...</div></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          ${Auth.hasMinRole('gerente') ? '<button class="btn btn-secondary" onclick="Sales._openReport()">📊 Relatório</button>' : ''}
          <button class="btn btn-primary" onclick="loadModule('scanner')">+ Nova Venda</button>
        </div>
      </div>
      <div class="table-wrap">
        <div class="table-toolbar">
          <div class="filter-bar" id="s-filters">
            <button class="filter-btn active" onclick="Sales._filter('todos',this)">Todas</button>
            <button class="filter-btn" onclick="Sales._filter('concluido',this)">Concluídas</button>
            <button class="filter-btn" onclick="Sales._filter('cancelado',this)">Canceladas</button>
          </div>
        </div>
        <div id="s-table">${UI.skeleton(8, ['15%','25%','15%','15%','15%','15%'])}</div>
      </div>
      <div id="s-pg" style="display:flex;gap:8px;justify-content:flex-end;padding:14px 0"></div>
    </div>`;
    await Promise.all([_load(), _loadPaymentMethods()]);
  }

  async function _load() {
    try {
      const companyId = Auth.getCompanyId();
      const isVendedor = Auth.getRole() === 'vendedor';

      let snap;
      if (isVendedor) {
        // Vendedor só vê as próprias vendas, nunca o total da loja.
        // Filtro simples (sem orderBy) pra não depender de índice
        // composto — ordenamos aqui no código mesmo.
        snap = await db.collection('companies').doc(companyId).collection('sales')
          .where('sellerId', '==', Auth.getProfileId()).get();
      } else {
        snap = await db.collection('companies').doc(companyId).collection('sales').orderBy('createdAt', 'desc').get();
      }

      all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (isVendedor) {
        all.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      }
      filtered = all;
      document.getElementById('s-sub').textContent = isVendedor ? `${all.length} vendas suas registradas` : `${all.length} vendas registradas`;
      _render(all);
    } catch(err) {
      document.getElementById('s-table').innerHTML = `<div style="padding:20px;color:#ef4444">Erro: ${err.message}</div>`;
    }
  }

  function _filter(type, btn) {
    document.querySelectorAll('#s-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (type === 'todos') filtered = all;
    else filtered = all.filter(s => s.status === type);
    page = 1; _render(filtered);
  }

  function _render(list) {
    const paged = UI.paginate(list, page, PER_PAGE);
    document.getElementById('s-table').innerHTML = `
    <div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>Data</th><th>Cliente</th><th>Vendedor</th><th>Origem</th><th>Pagamento</th><th>Total</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>
        ${paged.items.map(s => `<tr>
          <td>${UI.dateTime(s.createdAt)}</td>
          <td><div style="font-weight:700">${s.customerName}</div></td>
          <td>${s.sellerName||'—'}</td>
          <td>${UI.badge(s.origin||'loja')}</td>
          <td>${(s.paymentMethodName || s.paymentMethod || '').toUpperCase()}</td>
          <td style="text-align:right;font-weight:800;color:#10b981">${UI.money(s.total||0)}</td>
          <td>${UI.badge(s.status||'concluido')}</td>
          <td>
            <div style="display:flex;gap:4px">
              <button class="btn btn-ghost btn-sm" onclick="Sales._detail('${s.id}')">Ver</button>
              <button class="btn btn-ghost btn-sm" title="Reimprimir Recibo" onclick="Receipt.show('${s.id}')">🧾</button>
              ${s.status !== 'cancelado' ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" title="Cancelar Venda" onclick="Sales._askCancel('${s.id}')">🚫</button>` : ''}
              ${Auth.hasRole('admin') ? `
                <button class="btn btn-ghost btn-sm" title="Editar Financeiro" onclick="Sales._editFinance('${s.id}')">💰</button>
                <button class="btn btn-ghost btn-sm" title="Excluir Venda" onclick="Sales._askDelete('${s.id}')">🗑️</button>
              ` : ''}
              <button class="btn btn-secondary btn-sm" onclick="Sales._addProof('${s.id}')">📎</button>
            </div>
          </td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:24px;color:#64748b">Nenhuma venda encontrada.</td></tr>'}
      </tbody>
    </table></div>`;
    const pg = document.getElementById('s-pg');
    pg.innerHTML = paged.total > 1
      ? `<span style="font-size:13px;color:#64748b;align-self:center">${list.length} venda(s)</span>
         ${paged.hasPrev ? `<button class="btn btn-secondary btn-sm" onclick="Sales._pg(${page-1})">← Anterior</button>`:''}
         <span style="font-size:13px;font-weight:700;align-self:center">Pág ${page}/${paged.total}</span>
         ${paged.hasNext ? `<button class="btn btn-secondary btn-sm" onclick="Sales._pg(${page+1})">Próxima →</button>`:''}` : '';
  }

  function _pg(p) { page = p; _render(all); }

  async function _detail(id) {
    let s = all.find(x => x.id === id);
    const companyId = Auth.getCompanyId();
    if (!s) {
      // Acontece com o vendedor: o dashboard dele abre o detalhe direto,
      // sem passar pela lista completa de Vendas (que ele nem acessa).
      const doc = await db.collection('companies').doc(companyId).collection('sales').doc(id).get();
      if (!doc.exists) return;
      s = { id: doc.id, ...doc.data() };
    }

    const proofSnap = await db.collection('companies').doc(companyId).collection('paymentProofs').where('saleId','==',id).get();
    const proofs = proofSnap.docs.map(d => ({id: d.id, ...d.data()}));

    UI.modal({
      title: `Venda #${id.slice(-8).toUpperCase()}`,
      size: 'lg',
      body: `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px">
          <div>
            <div class="form-label">Dados da Venda</div>
            <p><b>Cliente:</b> ${s.customerName}</p>
            <p><b>Vendedor:</b> ${s.sellerName}</p>
            <p><b>Data:</b> ${UI.dateTime(s.createdAt)}</p>
            <p><b>Status:</b> ${UI.badge(s.status)}</p>
          </div>
          <div>
            <div class="form-label">Financeiro</div>
            <p><b>Total:</b> ${UI.money(s.total)}</p>
            <p><b>Pagamento:</b> ${(s.paymentMethodName || s.paymentMethod || '').toUpperCase()}${s.installments > 1 ? ` — ${s.installments}x de ${UI.money(s.installmentValue || s.total / s.installments)}` : ''}</p>
            <p><b>Comissão:</b> ${UI.money(s.commissionVal)} (${s.commissionPct}%)</p>
          </div>
        </div>
        <div style="margin-top:20px">
          <div class="form-label">Itens</div>
          <table class="table-sm">
            <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${s.items.map(i => `<tr>
                <td>${i.brand} ${i.model}</td>
                <td>${i.qty}</td>
                <td>${UI.money(i.price)}</td>
                <td>${UI.money(i.price * i.qty)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="margin-top:20px">
          <div class="form-label">Comprovantes</div>
          ${proofs.map(p => `<div style="padding:8px; background:var(--surface2); border-radius:6px; margin-bottom:4px; font-size:12px">
            <b>${p.method.toUpperCase()}</b> - ${UI.money(p.amount)} - NSU: ${p.nsu || '—'}
          </div>`).join('') || '<p style="font-size:12px; color:var(--muted)">Nenhum comprovante anexado.</p>'}
        </div>
      `,
      actions: [
        { label: 'Fechar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: '🖨️ Imprimir Recibo', cls: 'btn btn-primary', action: `Receipt.show('${id}')` }
      ]
    });
  }

  function _addProof(saleId) {
    UI.modal({
      title: 'Anexar Comprovante',
      body: `
        <div class="form-group">
          <label class="form-label">Método</label>
          <select class="form-input" id="p-method"><option value="pix">PIX</option><option value="cartao">Cartão</option><option value="dinheiro">Dinheiro</option></select>
        </div>
        <div class="form-group">
          <label class="form-label">Valor (R$)</label>
          <input type="number" class="form-input" id="p-amount" step="0.01">
        </div>
        <div class="form-group">
          <label class="form-label">NSU / Código Transação</label>
          <input class="form-input" id="p-nsu" placeholder="Opcional">
        </div>
      `,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: '💾 Salvar', cls: 'btn btn-primary', action: `Sales._saveProof('${saleId}')` }
      ]
    });
  }

  async function _saveProof(saleId) {
    const amount = parseFloat(document.getElementById('p-amount').value);
    if (!amount) return;
    UI.loading(true);
    try {
      await db.collection('companies').doc(Auth.getCompanyId()).collection('paymentProofs').add({
        saleId,
        method: document.getElementById('p-method').value,
        amount,
        nsu: document.getElementById('p-nsu').value,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      UI.loading(false); UI.closeModal(); UI.toast('Comprovante salvo!');
    } catch(err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  function _askCancel(id) {
    UI.modal({
      title: '🚫 Cancelar Venda',
      body: `
        <p>Tem certeza que deseja cancelar esta venda? O estoque será devolvido.</p>
        <div class="form-group" style="margin-top:15px">
          <label class="form-label">Digite o PIN de admin para confirmar</label>
          <input type="password" inputmode="numeric" maxlength="4" class="form-input" id="cancel-pass">
        </div>
      `,
      actions: [
        { label: 'Voltar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: 'Confirmar Cancelamento', cls: 'btn btn-danger', action: `Sales._confirmCancel('${id}')` }
      ]
    });
  }

  async function _confirmCancel(id) {
    const pass = document.getElementById('cancel-pass').value;
    if (!pass) { UI.toast('Digite o PIN de admin.', 'warn'); return; }
    if (!Auth.verifyAdminPin(pass)) { UI.toast('PIN de admin incorreto.', 'error'); return; }
    UI.loading(true);
    try {
      const companyId = Auth.getCompanyId();
      const s = all.find(x => x.id === id);
      const batch = db.batch();
      batch.update(db.collection('companies').doc(companyId).collection('sales').doc(id), { status: 'cancelado' });

      // Devolve o estoque à loja de origem da venda (ou ao total, se a venda for antiga e não tiver loja registrada)
      s.items.forEach(item => {
        const pRef = db.collection('companies').doc(companyId).collection('products').doc(item.id);
        const update = { stock: firebase.firestore.FieldValue.increment(item.qty) };
        if (s.storeId) update[`stockByStore.${s.storeId}`] = firebase.firestore.FieldValue.increment(item.qty);
        batch.update(pRef, update);
      });

      await batch.commit();

      // Registra o estorno no histórico de estoque
      const movementsCol = db.collection('companies').doc(companyId).collection('stock_movements');
      for (const item of s.items) {
        await movementsCol.add({
          type: 'estorno',
          productId: item.id, productName: `${item.brand||''} ${item.model||''}`.trim(),
          storeId: s.storeId || null, storeName: s.storeName || 'Loja não identificada (venda antiga)',
          qty: item.qty,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: Auth.getProfileId(), createdByName: Auth.getProfile().name
        });
      }

      UI.loading(false); UI.closeModal(); UI.toast('Venda cancelada. Estoque devolvido.');
      await _load();
    } catch(err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  function _editFinance(id) {
    const s = all.find(x => x.id === id);
    UI.modal({
      title: '💰 Editar Financeiro',
      body: `
        <div class="form-group">
          <label class="form-label">PIN de Admin</label>
          <input type="password" inputmode="numeric" maxlength="4" class="form-input" id="admin-pass-fin">
        </div>
        <div class="form-group">
          <label class="form-label">Total da Venda (R$)</label>
          <input type="number" class="form-input" id="fin-total" value="${s.total}">
        </div>
        <div class="form-group">
          <label class="form-label">Método de Pagamento</label>
          <select class="form-input" id="fin-method">
            ${paymentMethods.map(pm => `<option value="${pm.id}" ${s.paymentMethod===pm.id?'selected':''}>${pm.name}</option>`).join('')}
          </select>
        </div>
      `,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: '💾 Salvar Alterações', cls: 'btn btn-primary', action: `Sales._saveFinance('${id}')` }
      ]
    });
  }

  async function _saveFinance(id) {
    const pass = document.getElementById('admin-pass-fin').value;
    if (!pass) { UI.toast('Informe o PIN de admin.', 'warn'); return; }
    if (!Auth.verifyAdminPin(pass)) { UI.toast('PIN de admin incorreto.', 'error'); return; }

    UI.loading(true);
    try {
      const companyId = Auth.getCompanyId();
      await db.collection('companies').doc(companyId).collection('sales').doc(id).update({
        total: parseFloat(document.getElementById('fin-total').value),
        paymentMethod: document.getElementById('fin-method').value,
        paymentMethodName: paymentMethods.find(pm => pm.id === document.getElementById('fin-method').value)?.name || document.getElementById('fin-method').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      UI.loading(false); UI.closeModal(); UI.toast('Financeiro atualizado!', 'success');
      _load();
    } catch(err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  function _askDelete(id) {
    UI.modal({
      title: '🗑️ Excluir Venda',
      body: `
        <p style="color:var(--red); font-weight:700">Atenção: Esta ação é permanente e não pode ser desfeita!</p>
        <div class="form-group" style="margin-top:15px">
          <label class="form-label">Digite o PIN de admin para confirmar</label>
          <input type="password" inputmode="numeric" maxlength="4" class="form-input" id="admin-pass-del">
        </div>
      `,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: '🗑️ Excluir Agora', cls: 'btn btn-primary', style: 'background:var(--red)', action: `Sales._confirmDelete('${id}')` }
      ]
    });
  }

  async function _confirmDelete(id) {
    const pass = document.getElementById('admin-pass-del').value;
    if (!pass) { UI.toast('Informe o PIN de admin.', 'warn'); return; }
    if (!Auth.verifyAdminPin(pass)) { UI.toast('PIN de admin incorreto.', 'error'); return; }

    UI.loading(true);
    try {
      const companyId = Auth.getCompanyId();
      await db.collection('companies').doc(companyId).collection('sales').doc(id).delete();
      UI.loading(false); UI.closeModal(); UI.toast('Venda excluída com sucesso.', 'success');
      _load();
    } catch(err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  // ============================================================
  // Relatório de Vendas (admin/gerente) — filtros + impressão
  // ============================================================
  let reportSettings = {};
  let reportResults = [];
  let reportFilters = {};

  async function _openReport() {
    const container = document.getElementById('content');
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Relatório de Vendas</div><div class="page-sub">Filtre por período, produto ou cliente</div></div>
        <button class="btn btn-secondary" onclick="loadModule('sales')">← Voltar</button>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="form-grid form-grid-2">
          <div class="form-group"><label class="form-label">Data Início</label><input class="form-input" type="date" id="rep-start"></div>
          <div class="form-group"><label class="form-label">Data Fim</label><input class="form-input" type="date" id="rep-end"></div>
          <div class="form-group"><label class="form-label">Produto (marca / modelo)</label><input class="form-input" id="rep-product" placeholder="Ex: Castor Dream Plus"></div>
          <div class="form-group"><label class="form-label">Cliente</label><input class="form-input" id="rep-customer" placeholder="Nome do cliente"></div>
          <div class="form-group">
            <label class="form-label">Vendedor</label>
            <select class="form-input" id="rep-seller">
              <option value="">Todos os vendedores</option>
              ${[...new Set(all.map(s => s.sellerName).filter(Boolean))].sort().map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-input" id="rep-status">
              <option value="concluido" selected>Concluídas</option>
              <option value="todos">Todas</option>
              <option value="cancelado">Canceladas</option>
            </select>
          </div>
        </div>
        <div style="display:flex; gap:10px; margin-top:6px; flex-wrap:wrap">
          <button class="btn btn-primary" onclick="Sales._generateReport()">Gerar Relatório</button>
          <button class="btn btn-secondary" onclick="Sales._clearReport()">Limpar Filtros</button>
        </div>
      </div>
      <div id="rep-summary"></div>
      <div id="rep-results"></div>
    </div>`;

    // Garante que temos as vendas carregadas e o nome/logo da empresa para o cabeçalho impresso
    if (all.length === 0) await _load();
    // Recarrega a lista de vendedores agora que "all" está garantidamente populado
    document.getElementById('rep-seller').innerHTML = `<option value="">Todos os vendedores</option>` +
      [...new Set(all.map(s => s.sellerName).filter(Boolean))].sort().map(n => `<option value="${n}">${n}</option>`).join('');
    try {
      const snap = await db.collection('companies').doc(Auth.getCompanyId()).collection('settings').doc('general').get();
      reportSettings = snap.exists ? snap.data() : {};
    } catch (e) { reportSettings = {}; }
  }

  function _generateReport() {
    const startVal = document.getElementById('rep-start').value;
    const endVal = document.getElementById('rep-end').value;
    const prodTerm = document.getElementById('rep-product').value.trim().toLowerCase();
    const custTerm = document.getElementById('rep-customer').value.trim().toLowerCase();
    const sellerFilter = document.getElementById('rep-seller').value;
    const statusFilter = document.getElementById('rep-status').value;

    let results = all.slice();
    if (statusFilter !== 'todos') results = results.filter(s => (s.status || 'concluido') === statusFilter);
    if (startVal) {
      const sd = new Date(startVal + 'T00:00:00');
      results = results.filter(s => s.createdAt?.toDate && s.createdAt.toDate() >= sd);
    }
    if (endVal) {
      const ed = new Date(endVal + 'T23:59:59');
      results = results.filter(s => s.createdAt?.toDate && s.createdAt.toDate() <= ed);
    }
    if (custTerm) results = results.filter(s => (s.customerName || '').toLowerCase().includes(custTerm));
    if (prodTerm) results = results.filter(s => (s.items || []).some(i => `${i.brand || ''} ${i.model || ''}`.toLowerCase().includes(prodTerm)));
    if (sellerFilter) results = results.filter(s => s.sellerName === sellerFilter);

    results.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });

    reportResults = results;
    reportFilters = { startVal, endVal, prodTerm, custTerm, sellerFilter, statusFilter };
    _renderReport(results);
  }

  function _clearReport() {
    ['rep-start', 'rep-end', 'rep-product', 'rep-customer'].forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('rep-seller').value = '';
    document.getElementById('rep-status').value = 'concluido';
    document.getElementById('rep-summary').innerHTML = '';
    document.getElementById('rep-results').innerHTML = '';
    reportResults = []; reportFilters = {};
  }

  function _renderReport(results) {
    const total = results.reduce((s, x) => s + (x.total || 0), 0);
    const count = results.length;
    const avg = count ? total / count : 0;

    // Quando nenhum vendedor específico está selecionado, mostra também
    // um ranking de quanto cada um vendeu no período filtrado.
    let bySellerHtml = '';
    if (!reportFilters.sellerFilter && count > 0) {
      const bySeller = {};
      results.forEach(s => {
        const key = s.sellerName || 'Sem vendedor';
        if (!bySeller[key]) bySeller[key] = { total: 0, count: 0 };
        bySeller[key].total += s.total || 0;
        bySeller[key].count++;
      });
      const ranked = Object.entries(bySeller).sort((a, b) => b[1].total - a[1].total);
      bySellerHtml = `
        <div class="card" style="margin-bottom:20px">
          <div class="card-title" style="font-size:15px; margin-bottom:12px">👤 Vendas por Vendedor no Período</div>
          <div style="display:flex; flex-direction:column; gap:8px">
            ${ranked.map(([name, d]) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:var(--surface2); border-radius:8px">
                <span style="font-weight:700; font-size:13px">${name}</span>
                <span style="font-size:12px; color:var(--muted)">${d.count} venda(s)</span>
                <span style="font-weight:800; color:var(--green)">${UI.money(d.total)}</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }

    document.getElementById('rep-summary').innerHTML = `
      <div class="metric-grid" style="margin-bottom:20px">
        <div class="metric-card"><div class="metric-label">Total do Período</div><div class="metric-value" style="color:var(--green)">${UI.money(total)}</div></div>
        <div class="metric-card"><div class="metric-label">Qtd de Vendas</div><div class="metric-value">${count}</div></div>
        <div class="metric-card"><div class="metric-label">Ticket Médio</div><div class="metric-value">${UI.money(avg)}</div></div>
      </div>
      ${bySellerHtml}`;

    document.getElementById('rep-results').innerHTML = `
      <div class="table-wrap">
        <div class="table-toolbar" style="justify-content:flex-end; flex-direction:column; align-items:flex-end; gap:4px">
          <button class="btn btn-secondary btn-sm" onclick="Sales._printReport()" ${count === 0 ? 'disabled' : ''}>🖨️ Imprimir Relatório</button>
          <span style="font-size:10.5px; color:var(--muted)">Se aparecer link/data no topo, desmarque "Cabeçalhos e rodapés" no diálogo de impressão.</span>
        </div>
        <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Produtos</th><th>Pagamento</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            ${results.map(s => `<tr>
              <td>${UI.dateTime(s.createdAt)}</td>
              <td>${s.customerName}</td>
              <td>${s.sellerName || '—'}</td>
              <td style="max-width:220px">${(s.items || []).map(i => `${i.brand || ''} ${i.model || ''} (${i.qty}x)`).join(', ')}</td>
              <td>${(s.paymentMethodName || s.paymentMethod || '').toUpperCase()}</td>
              <td style="text-align:right;font-weight:800;color:#10b981">${UI.money(s.total || 0)}</td>
              <td>${UI.badge(s.status || 'concluido')}</td>
            </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:24px;color:#64748b">Nenhuma venda encontrada com esses filtros.</td></tr>'}
          </tbody>
        </table></div>
      </div>`;
  }

  function _printReport() {
    if (reportResults.length === 0) return;
    const total = reportResults.reduce((s, x) => s + (x.total || 0), 0);
    const count = reportResults.length;
    const avg = count ? total / count : 0;
    const f = reportFilters;
    const periodStr = (f.startVal || f.endVal)
      ? `${f.startVal ? new Date(f.startVal + 'T00:00:00').toLocaleDateString('pt-BR') : '—'} até ${f.endVal ? new Date(f.endVal + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}`
      : 'Todo o período';
    const statusLabel = f.statusFilter === 'todos' ? 'Todas' : f.statusFilter === 'cancelado' ? 'Canceladas' : 'Concluídas';

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
        <h1>${reportSettings.fantasyName || 'Colchoeiro ERP'} — Relatório de Vendas</h1>
        <div class="rp-sub">
          Período: ${periodStr}${f.custTerm ? ` · Cliente: "${f.custTerm}"` : ''}${f.prodTerm ? ` · Produto: "${f.prodTerm}"` : ''}${f.sellerFilter ? ` · Vendedor: "${f.sellerFilter}"` : ''}
          · Status: ${statusLabel} · Gerado em ${new Date().toLocaleString('pt-BR')}
        </div>
        <div class="rp-summary">
          <div><span>Total do período</span><b>${UI.money(total)}</b></div>
          <div><span>Qtd de vendas</span><b>${count}</b></div>
          <div><span>Ticket médio</span><b>${UI.money(avg)}</b></div>
        </div>
        <table>
          <thead><tr><th>Data</th><th>Cliente</th><th>Vendedor</th><th>Produtos</th><th>Pagamento</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            ${reportResults.map(s => `<tr>
              <td>${UI.dateTime(s.createdAt)}</td>
              <td>${s.customerName}</td>
              <td>${s.sellerName || '—'}</td>
              <td>${(s.items || []).map(i => `${i.brand || ''} ${i.model || ''} (${i.qty}x)`).join(', ')}</td>
              <td>${(s.paymentMethodName || s.paymentMethod || '').toUpperCase()}</td>
              <td>${UI.money(s.total || 0)}</td>
              <td>${s.status || 'concluido'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    PrintDoc.open(html, `Relatorio-Vendas-${new Date().toISOString().slice(0, 10)}`);
  }

  return {
    render, _filter, _pg, _detail, _addProof, _askCancel, _confirmCancel, _editFinance, _saveFinance, _askDelete, _confirmDelete,
    _openReport, _generateReport, _clearReport, _printReport
  };
})();

// ============================================================
// COLCHOEIRO ERP — Módulo Financeiro
// ============================================================
const Financial = (() => {
  async function render(container) {
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Financeiro</div><div class="page-sub">Contas a pagar, receber e fluxo de caixa</div></div>
      </div>
      <div class="card" style="text-align:center;padding:60px;color:var(--muted)">
        <div style="font-size:48px;margin-bottom:20px">🏦</div>
        <h3>Módulo Financeiro Consolidado</h3>
        <p>O fluxo de caixa é gerado automaticamente a partir das Vendas.</p>
        <button class="btn btn-primary" style="margin-top:20px" onclick="loadModule('sales')">Ver Vendas e Recebimentos</button>
      </div>
    </div>`;
  }
  return { render };
})();

// ============================================================
// COLCHOEIRO ERP — Módulo Configurações
// ============================================================
const Settings = (() => {
  let config = {};
  let paymentMethods = [];

  async function render(container) {
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Configurações</div><div class="page-sub">Personalize seu ERP</div></div>
      </div>
      
      <div class="form-grid" style="grid-template-columns: 1fr 1fr">
        <div class="card" id="admin-cleanup" style="display:none; border: 1px solid #ef4444">
          <div class="card-title" style="color:#ef4444">🗑️ Zona de Perigo: Limpar Dados</div>
          <p style="font-size:12px; color:#64748b; margin-bottom:15px">Use esta opção para zerar os dados de vendas, faturamento e orçamentos antes de entregar o sistema.</p>
          <div class="form-group">
            <label class="form-label">PIN de Admin para Confirmar</label>
            <input type="password" inputmode="numeric" maxlength="4" class="form-input" id="cleanup-pass" placeholder="Seu PIN">
          </div>
          <button class="btn btn-danger" style="width:100%; margin-top:10px; background:#ef4444" onclick="Settings._cleanup()">Zerar Todo o Sistema</button>
        </div>

        <div class="card">
          <div class="card-title">Empresa e Identidade</div>
          <div class="form-group">
            <label class="form-label">Nome Fantasia</label>
            <input class="form-input" id="set-name" placeholder="Ex: Nome da sua loja">
          </div>
          <div class="form-group">
            <label class="form-label">Logo da Empresa</label>
            <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap">
              <img id="set-logo-preview" src="" style="width:52px; height:52px; border-radius:8px; object-fit:contain; background:var(--surface2); display:none" onerror="this.style.display='none'">
              <div>
                <input type="file" accept="image/*" id="set-logo-file" style="display:none">
                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('set-logo-file').click()">📤 Enviar Logo</button>
                <div id="set-logo-progress" style="display:none; font-size:11px; color:var(--muted); margin-top:6px"></div>
              </div>
            </div>
            <input class="form-input" id="set-logo" placeholder="ou cole uma URL de imagem" style="margin-top:8px" oninput="const pv=document.getElementById('set-logo-preview'); pv.src=this.value; pv.style.display=this.value?'block':'none'">
          </div>
          <div class="form-group">
            <label class="form-label">Pasta do Google Drive (Link)</label>
            <input class="form-input" id="set-drive" placeholder="Para fotos de notas e comprovantes">
          </div>
          <button class="btn btn-primary" onclick="Settings._save()">Salvar Empresa</button>
        </div>

        <div class="card">
          <div class="card-title">🖼️ Imagens (Cloudinary)</div>
          <p style="font-size:12px; color:var(--muted); margin-bottom:14px">
            Permite enviar fotos de produtos e a logo direto do celular/computador, sem precisar colar link.
            Crie uma conta grátis em <a href="https://cloudinary.com" target="_blank">cloudinary.com</a> e, no painel,
            vá em Settings → Upload → Upload presets → Add upload preset → Signing Mode: <b>Unsigned</b>.
          </p>
          <div class="form-group">
            <label class="form-label">Cloud Name</label>
            <input class="form-input" id="set-cld-name" placeholder="Ex: dxyzabc123">
          </div>
          <div class="form-group">
            <label class="form-label">Upload Preset (unsigned)</label>
            <input class="form-input" id="set-cld-preset" placeholder="Ex: colchoeiro_unsigned">
          </div>
          <button class="btn btn-primary" onclick="Settings._save()">Salvar Imagens</button>
        </div>

        <div class="card">
          <div class="card-title">💳 Formas de Pagamento</div>
          <p style="font-size:12px; color:var(--muted); margin-bottom:12px">Edite nomes, o desconto de cada forma e se ela permite parcelamento. Isso alimenta o formulário de venda automaticamente.</p>
          <div id="pm-list"></div>
          <button class="btn btn-secondary btn-sm" onclick="Settings._addPM()" style="margin-top:6px">+ Nova Forma</button>
          <button class="btn btn-primary" style="width:100%; margin-top:14px" onclick="Settings._savePaymentMethods()">Salvar Formas de Pagamento</button>
        </div>

        <div class="card">
          <div class="card-title">Regras de Venda</div>
          <div class="form-group">
            <label class="form-label">Meta de Vendas Mensal (R$)</label>
            <input type="number" class="form-input" id="set-goal" placeholder="Ex: 50000">
          </div>
          <div class="form-group">
            <label class="form-label">Sugestões de Observações (uma por linha)</label>
            <textarea class="form-input" id="set-obs" rows="4" placeholder="Garantia de 1 ano&#10;Entrega em 24h"></textarea>
          </div>
          <button class="btn btn-primary" onclick="Settings._save()">Salvar Regras</button>
        </div>
      </div>
    </div>`;
    await _load();
    Cloudinary.bindPicker({ fileInputId: 'set-logo-file', previewId: 'set-logo-preview', urlInputId: 'set-logo', progressId: 'set-logo-progress' });
  }

  async function _load() {
    const companyId = Auth.getCompanyId();
    const snap = await db.collection('companies').doc(companyId).collection('settings').doc('general').get();
    if (snap.exists) {
      config = snap.data();
      document.getElementById('set-name').value = config.fantasyName || '';
      document.getElementById('set-logo').value = config.logoUrl || '';
      document.getElementById('set-drive').value = config.driveUrl || '';
      document.getElementById('set-goal').value = config.monthlyGoal || '';
      document.getElementById('set-obs').value = (config.obsSuggestions || []).join('\n');
      document.getElementById('set-cld-name').value = config.cloudinaryCloudName || '';
      document.getElementById('set-cld-preset').value = config.cloudinaryUploadPreset || '';
      if (config.logoUrl) {
        const pv = document.getElementById('set-logo-preview');
        pv.src = config.logoUrl; pv.style.display = 'block';
      }
    }
    paymentMethods = (config.paymentMethods && config.paymentMethods.length) ? config.paymentMethods : _defaultPaymentMethods(config.cashDiscount);
    _renderPaymentMethods();
    if (Auth.hasRole('admin')) {
      document.getElementById('admin-cleanup').style.display = 'block';
    }
  }

  function _renderPaymentMethods() {
    document.getElementById('pm-list').innerHTML = paymentMethods.map((pm, idx) => `
      <div style="display:grid; grid-template-columns:1fr 84px auto 32px; gap:8px; align-items:center; margin-bottom:8px">
        <input class="form-input" value="${pm.name}" placeholder="Nome" oninput="Settings._updatePM(${idx},'name',this.value)">
        <input class="form-input" type="number" min="0" max="100" step="0.5" value="${pm.discount}" title="Desconto (%)" oninput="Settings._updatePM(${idx},'discount',this.value)">
        <label style="display:flex; align-items:center; gap:5px; font-size:11px; color:var(--muted); white-space:nowrap">
          <input type="checkbox" ${pm.installments ? 'checked' : ''} onchange="Settings._updatePM(${idx},'installments',this.checked)"> Parcela
        </label>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="Settings._removePM(${idx})" title="Remover">✕</button>
      </div>
    `).join('') || '<p style="font-size:12px;color:var(--muted)">Nenhuma forma de pagamento cadastrada.</p>';
  }

  function _updatePM(idx, field, val) {
    paymentMethods[idx][field] = field === 'discount' ? (parseFloat(val) || 0) : val;
  }

  function _removePM(idx) {
    paymentMethods.splice(idx, 1);
    _renderPaymentMethods();
  }

  function _addPM() {
    paymentMethods.push({ id: UI.shortId('pm_'), name: '', discount: 0, installments: false });
    _renderPaymentMethods();
  }

  async function _savePaymentMethods() {
    const clean = paymentMethods.filter(p => p.name && p.name.trim());
    if (clean.length === 0) { UI.toast('Adicione ao menos uma forma de pagamento.', 'warn'); return; }
    UI.loading(true);
    try {
      await db.collection('companies').doc(Auth.getCompanyId()).collection('settings').doc('general')
        .set({ paymentMethods: clean, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      paymentMethods = clean;
      _renderPaymentMethods();
      UI.loading(false); UI.toast('Formas de pagamento salvas!');
    } catch (err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  async function _save() {
    UI.loading(true);
    try {
      const companyId = Auth.getCompanyId();
      const data = {
        fantasyName: document.getElementById('set-name').value,
        logoUrl: document.getElementById('set-logo').value,
        driveUrl: document.getElementById('set-drive').value,
        monthlyGoal: parseFloat(document.getElementById('set-goal').value) || 0,
        obsSuggestions: document.getElementById('set-obs').value.split('\n').filter(x => x.trim()),
        cloudinaryCloudName: document.getElementById('set-cld-name').value.trim(),
        cloudinaryUploadPreset: document.getElementById('set-cld-preset').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection('companies').doc(companyId).collection('settings').doc('general').set(data, { merge: true });
      await Cloudinary.getConfig(true); // recarrega o cache com as novas credenciais
      UI.loading(false); UI.toast('Configurações salvas!');
    } catch(err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  async function _cleanup() {
    const pass = document.getElementById('cleanup-pass').value;
    if (!pass) { UI.toast('PIN obrigatório.', 'warn'); return; }
    if (!Auth.verifyAdminPin(pass)) { UI.toast('PIN de admin incorreto.', 'error'); return; }

    if (!confirm('ATENÇÃO: Isso vai apagar TODAS as vendas, orçamentos, financeiro e comissões. Esta ação não pode ser desfeita. Deseja continuar?')) return;

    UI.loading(true);
    try {
      const companyId = Auth.getCompanyId();
      
      const collections = ['sales', 'quotes', 'paymentProofs', 'commissions', 'deliveries'];
      
      for (const col of collections) {
        const snap = await db.collection('companies').doc(companyId).collection(col).get();
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      
      UI.loading(false);
      UI.toast('Sistema zerado com sucesso!', 'success');
      setTimeout(() => window.location.reload(), 2000);
    } catch(err) {
      UI.loading(false);
      UI.toast('Erro ao limpar dados: ' + err.message, 'error');
    }
  }

  return { render, _save, _cleanup, _updatePM, _removePM, _addPM, _savePaymentMethods };
})();
