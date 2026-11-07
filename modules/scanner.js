// ============================================================
// COLCHOEIRO ERP — Módulo Vendas (Scanner + Manual)
// ============================================================

const Scanner = (() => {
  let cart = [];
  let products = [];
  let customers = [];
  let paymentMethods = [];
  let sellerStoreId = null;
  let sellerStoreName = '';

  // Estado da venda em andamento — fica na memória do módulo (não no HTML),
  // por isso sobrevive quando o vendedor sai pra outra aba e volta. Só é
  // zerado ao finalizar a venda ou clicar em "Limpar Informações".
  let selectedCustomerId = null;
  let saleState = { payment: 'pix', installments: 1, origin: 'loja', building: '', block: '', floor: '', apartment: '', obs: '', date: '' };

  // Mesma lista padrão usada em Configurações — ids fixos para compatibilidade
  // com vendas antigas e pra bater com o que Configurações mostra por padrão.
  function _defaultPaymentMethods(legacyCashDiscount) {
    const d = legacyCashDiscount != null ? legacyCashDiscount : 5;
    return [
      { id: 'pix', name: 'PIX', discount: d, installments: false },
      { id: 'dinheiro', name: 'Dinheiro', discount: d, installments: false },
      { id: 'cartao_debito', name: 'Cartão de Débito', discount: 0, installments: false },
      { id: 'cartao_credito', name: 'Cartão de Crédito', discount: 0, installments: true },
    ];
  }

  async function render(container) {
    await _loadData(); // produtos, clientes, loja e formas de pagamento — precisa vir antes pra montar o formulário já certo

    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Nova Venda</div><div class="page-sub">Selecione produtos e finalize a venda</div></div>
        <button class="btn btn-ghost btn-sm" onclick="Scanner._clearAll()">🗑️ Limpar Informações</button>
      </div>

      <div class="sale-layout" style="display:grid; grid-template-columns: 1fr 350px; gap:20px; align-items: start">
        
        <!-- Lado Esquerdo: Busca e Seleção -->
        <div class="sale-main">
          <div class="card" style="margin-bottom:15px">
            <div class="form-group">
              <label class="form-label">1. Selecionar Cliente (CRM)</label>
              <div style="display:flex;gap:8px">
                <input class="form-input" id="sale-cust-search" placeholder="Buscar por nome ou celular..." oninput="Scanner._searchCust(this.value)" style="flex:1">
                <button class="btn btn-secondary btn-sm" onclick="Scanner._openNewCustomer()" style="white-space:nowrap">+ Novo Cliente</button>
              </div>
              <div id="sale-cust-results" class="search-dropdown" style="display:none"></div>
            </div>
          </div>

          <div class="card" style="margin-bottom:15px">
            <div class="form-group">
              <label class="form-label">2. Adicionar Produtos</label>
              <input class="form-input" id="sale-prod-search" placeholder="Digite nome, marca ou código..." oninput="Scanner._searchProd(this.value)">
              <div id="sale-prod-results" class="search-dropdown" style="display:none"></div>
            </div>
          </div>

          <!-- Planilha da Venda: junta cliente + itens num único painel,
               separado dos campos de busca acima. -->
          <div class="card">
            <div class="page-header" style="margin-bottom:14px">
              <div class="card-title" style="margin:0">📋 Planilha da Venda</div>
              <button class="btn btn-secondary btn-sm" onclick="Scanner._previewSheet()">👁️ Visualizar</button>
            </div>

            <div id="selected-customer" class="sale-customer-card" style="display:none; margin-top:0"></div>
            <div id="sheet-cust-empty" style="text-align:center; padding:16px; color:var(--muted); font-size:13px; background:var(--surface2); border-radius:10px">Nenhum cliente selecionado ainda.</div>

            <div id="cart-items" style="margin-top:16px">
              <div style="text-align:center; padding:30px; color:var(--muted)">O carrinho está vazio.</div>
            </div>
          </div>
        </div>

        <!-- Lado Direito: Resumo e Fechamento -->
        <div class="sale-sidebar card" style="position:sticky; top:20px">
          <div class="card-title">Resumo da Venda</div>
          <div style="margin:20px 0; border-top:1px solid var(--border); padding-top:15px">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px">
              <span>Subtotal</span>
              <span id="sale-subtotal">R$ 0,00</span>
            </div>
            <div class="form-group">
              <label class="form-label">Forma de Pagamento</label>
              <select class="form-input" id="sale-payment" onchange="Scanner._onPaymentChange()">
                ${paymentMethods.map(pm => `<option value="${pm.id}" ${pm.id === saleState.payment ? 'selected' : ''}>${pm.name}${pm.discount > 0 ? ` (${pm.discount}% desc.)` : ''}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" id="installments-group" style="display:${paymentMethods.find(p => p.id === saleState.payment)?.installments ? 'block' : 'none'}">
              <label class="form-label">Parcelas</label>
              <select class="form-input" id="sale-installments" onchange="Scanner._updateTotal()">
                ${Array.from({length:12}, (_,i) => i+1).map(n => `<option value="${n}" ${n === saleState.installments ? 'selected' : ''}>${n}x</option>`).join('')}
              </select>
              <div id="installment-value" style="font-size:11px;color:var(--muted);margin-top:4px"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Origem da Venda</label>
              <select class="form-input" id="sale-origin" onchange="Scanner._updateTotal()">
                <option value="loja" ${saleState.origin === 'loja' ? 'selected' : ''}>Loja Física (Comissão 5%)</option>
                <option value="online" ${saleState.origin === 'online' ? 'selected' : ''}>Venda Online (Comissão 10%)</option>
              </select>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:15px; font-weight:800; font-size:20px">
              <span>Total</span>
              <span id="sale-total" style="color:var(--green)">R$ 0,00</span>
            </div>
            <div id="discount-notice" style="font-size:11px; color:var(--green); text-align:right; margin-top:4px"></div>
          </div>

          <div style="margin-bottom:20px; padding:15px; background:var(--surface2); border-radius:12px">
            <div style="font-weight:800; margin-bottom:10px; font-size:14px">📍 Dados de Entrega</div>
            <div class="form-group">
              <label class="form-label">Prédio / Casa</label>
              <input class="form-input" id="ent-building" value="${saleState.building}" oninput="Scanner._syncField('building', this.value)" placeholder="Ex: Edf. Solar">
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px">
              <div class="form-group">
                <label class="form-label">Quadra</label>
                <input class="form-input" id="ent-block" value="${saleState.block}" oninput="Scanner._syncField('block', this.value)" placeholder="Ex: Q. 05">
              </div>
              <div class="form-group">
                <label class="form-label">Andar</label>
                <input class="form-input" id="ent-floor" value="${saleState.floor}" oninput="Scanner._syncField('floor', this.value)" placeholder="Ex: 12º">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Apartamento / Complemento</label>
              <input class="form-input" id="ent-apt" value="${saleState.apartment}" oninput="Scanner._syncField('apartment', this.value)" placeholder="Ex: 1202">
            </div>
            <div class="form-group">
              <label class="form-label">Data da entrega / saída</label>
              <input class="form-input" type="date" id="ent-date" value="${saleState.date || ''}" oninput="Scanner._syncField('date', this.value)">
            </div>
            <div class="form-group">
              <label class="form-label">Observação do cliente (sai no comprovante)</label>
              <input class="form-input" id="ent-obs" value="${saleState.obs || ''}" oninput="Scanner._syncField('obs', this.value)" placeholder="Ex: Entregar depois das 18h">
            </div>
          </div>

          <button class="btn btn-primary" style="width:100%; padding:15px" onclick="Scanner._checkout()">Finalizar Venda</button>
        </div>
      </div>
    </div>`;

    _restoreState();
  }

  function _restoreState() {
    if (selectedCustomerId && customers.some(c => c.id === selectedCustomerId)) {
      _selectCust(selectedCustomerId);
    }
    _renderCart();
  }

  function _syncField(key, val) {
    saleState[key] = val;
  }

  function _clearAll() {
    UI.confirm('Limpar cliente, produtos, pagamento e entrega desta venda?', () => {
      cart = [];
      selectedCustomerId = null;
      saleState = { payment: 'pix', installments: 1, origin: 'loja', building: '', block: '', floor: '', apartment: '', obs: '', date: '' };
      loadModule('scanner');
      UI.toast('Informações limpas.', 'success');
    }, 'Limpar', true);
  }

  async function _loadData() {
    const companyId = Auth.getCompanyId();
    const pSnap = await db.collection('companies').doc(companyId).collection('products').where('active', '==', true).get();
    products = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cSnap = await db.collection('companies').doc(companyId).collection('customers').get();
    customers = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Formas de pagamento configuradas em Configurações → Formas de Pagamento
    try {
      const sSnap = await db.collection('companies').doc(companyId).collection('settings').doc('general').get();
      const s = sSnap.exists ? sSnap.data() : {};
      paymentMethods = (s.paymentMethods && s.paymentMethods.length) ? s.paymentMethods : _defaultPaymentMethods(s.cashDiscount);
    } catch (e) { paymentMethods = _defaultPaymentMethods(); }
    if (!paymentMethods.some(p => p.id === saleState.payment)) saleState.payment = paymentMethods[0]?.id || 'pix';

    // Loja do vendedor logado (usada para mostrar o estoque correto na busca)
    const stores = await Stock.getStores();
    const profile = Auth.getProfile();
    const store = stores.find(s => s.id === profile.storeId) || stores.find(s => s.isDefault) || stores[0];
    sellerStoreId = store?.id || null;
    sellerStoreName = store?.name || '';
  }

  function _stockAt(p) {
    if (!sellerStoreId) return p.stock || 0;
    return p.stockByStore && p.stockByStore[sellerStoreId] != null ? p.stockByStore[sellerStoreId] : (p.stock || 0);
  }

  function _searchCust(q) {
    const results = customers.filter(c => `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));
    const div = document.getElementById('sale-cust-results');
    if (q.length < 2) { div.style.display = 'none'; return; }
    div.style.display = 'block';
    div.innerHTML = results.map(c => `<div class="search-item" onclick="Scanner._selectCust('${c.id}')">
      <b>${c.name}</b><br><small>${c.phone||''}</small>
    </div>`).join('') || `<div class="search-item" onclick="Scanner._openNewCustomer()">➕ Cliente não encontrado — cadastrar novo</div>`;
  }

  function _openNewCustomer() {
    UI.modal({
      title: 'Novo Cliente',
      size: 'sm',
      body: `
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Nome Completo</label><input class="form-input" id="nc-name" placeholder="Ex: João Silva"></div>
        <div class="form-group"><label class="form-label">Celular / WhatsApp</label><input class="form-input" id="nc-phone" placeholder="(11) 99999-9999"></div>
        <div class="form-group"><label class="form-label">Endereço</label><input class="form-input" id="nc-address" placeholder="Rua, número, bairro..."></div>
      </div>`,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: 'Salvar e Selecionar', cls: 'btn btn-primary', action: 'Scanner._saveNewCustomer()' }
      ]
    });
  }

  async function _saveNewCustomer() {
    const name = document.getElementById('nc-name').value.trim();
    if (!name) { UI.toast('Informe o nome do cliente.', 'warn'); return; }
    const data = {
      name,
      phone: document.getElementById('nc-phone').value.trim(),
      address: document.getElementById('nc-address').value.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: Auth.getProfileId(),
      createdByName: Auth.getProfile().name
    };
    UI.loading(true);
    try {
      const companyId = Auth.getCompanyId();
      const ref = await db.collection('companies').doc(companyId).collection('customers').add(data);
      customers.push({ id: ref.id, ...data, createdAt: new Date() });
      UI.loading(false);
      UI.closeModal();
      UI.toast('Cliente cadastrado!');
      _selectCust(ref.id);
    } catch (err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  function _selectCust(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    selectedCustomerId = id;
    document.getElementById('sale-cust-results').style.display = 'none';
    document.getElementById('sale-cust-search').value = '';
    const initials = c.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const el = document.getElementById('selected-customer');
    el.setAttribute('data-id', id);
    el.style.display = 'flex';
    el.innerHTML = `
      <div class="sale-customer-avatar">${initials}</div>
      <div class="sale-customer-info">
        <div class="sale-customer-name">${c.name}</div>
        <div class="sale-customer-sub">${[c.phone, c.address].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="Scanner._clearCust()" title="Trocar cliente">✕</button>
    `;
    document.getElementById('sheet-cust-empty').style.display = 'none';
  }

  function _clearCust() {
    selectedCustomerId = null;
    const el = document.getElementById('selected-customer');
    el.style.display = 'none';
    el.removeAttribute('data-id');
    el.innerHTML = '';
    document.getElementById('sheet-cust-empty').style.display = 'block';
  }

  function _searchProd(q) {
    const results = products.filter(p => `${p.brand} ${p.model} ${p.barcode}`.toLowerCase().includes(q.toLowerCase()));
    const div = document.getElementById('sale-prod-results');
    if (q.length < 2) { div.style.display = 'none'; return; }
    div.style.display = 'block';
    div.innerHTML = results.map(p => `<div class="search-item" onclick="Scanner._addToCart('${p.id}')">
      <b>${p.brand} ${p.model}</b><br><small>${UI.money(p.price)} · Estoque em ${sellerStoreName || 'sua loja'}: ${_stockAt(p)}</small>
    </div>`).join('') || '<div class="search-item">Produto não encontrado.</div>';
  }

  function _addToCart(id) {
    const p = products.find(x => x.id === id);
    const existing = cart.find(item => item.id === id);
    if (existing) existing.qty++;
    else cart.push({ ...p, qty: 1, originalPrice: p.price });
    
    document.getElementById('sale-prod-results').style.display = 'none';
    document.getElementById('sale-prod-search').value = '';
    _renderCart();
  }

  function _renderCart() {
    const container = document.getElementById('cart-items');
    if (cart.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--muted)">O carrinho está vazio.</div>';
      _updateTotal();
      return;
    }

    container.innerHTML = `
    <table class="sale-cart-table">
      <thead>
        <tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th><th></th></tr>
      </thead>
      <tbody>
        ${cart.map(item => `
          <tr>
            <td>
              <div style="display:flex; align-items:center; gap:10px">
                <div class="sale-cart-thumb">
                  ${item.photoUrl ? `<img src="${item.photoUrl}" onerror="this.parentElement.innerHTML='📦'">` : '📦'}
                </div>
                <div>
                  <div class="sale-cart-name">${item.brand} ${item.model}</div>
                  <div class="sale-cart-sub">Sugerido: ${UI.money(item.originalPrice)}</div>
                </div>
              </div>
            </td>
            <td><input type="number" class="form-input" min="1" value="${item.qty}" onchange="Scanner._updateQty('${item.id}', this.value)"></td>
            <td><input type="number" class="form-input" step="0.01" value="${item.price}" onchange="Scanner._updatePrice('${item.id}', this.value)"></td>
            <td style="font-weight:800; color:var(--green); white-space:nowrap">${UI.money(item.price * item.qty)}</td>
            <td><button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="Scanner._removeItem('${item.id}')">✕</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
    _updateTotal();
  }

  function _updateQty(id, val) {
    const item = cart.find(x => x.id === id);
    if (item) item.qty = parseInt(val) || 1;
    _updateTotal();
  }

  function _updatePrice(id, val) {
    const item = cart.find(x => x.id === id);
    if (item) item.price = parseFloat(val) || 0;
    _updateTotal();
  }

  function _removeItem(id) {
    cart = cart.filter(x => x.id !== id);
    _renderCart();
  }

  // Mostra num modal maior exatamente como a Planilha da Venda está agora
  // (cliente + itens) — útil pra conferir tudo antes de finalizar.
  function _previewSheet() {
    const custId = document.getElementById('selected-customer').getAttribute('data-id');
    const cust = custId ? customers.find(c => c.id === custId) : null;
    const subtotal = cart.reduce((s, i) => s + (i.price * i.qty), 0);

    UI.modal({
      title: '📋 Planilha da Venda',
      size: 'md',
      body: `
        ${cust ? `
          <div class="sale-customer-card" style="margin-top:0">
            <div class="sale-customer-avatar">${cust.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</div>
            <div class="sale-customer-info">
              <div class="sale-customer-name">${cust.name}</div>
              <div class="sale-customer-sub">${[cust.phone, cust.address].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}</div>
            </div>
          </div>
        ` : '<div style="text-align:center; color:var(--muted); padding:16px; background:var(--surface2); border-radius:10px">Nenhum cliente selecionado ainda.</div>'}

        ${cart.length ? `
          <table class="sale-cart-table">
            <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${cart.map(item => `
                <tr>
                  <td>
                    <div style="display:flex; align-items:center; gap:10px">
                      <div class="sale-cart-thumb">${item.photoUrl ? `<img src="${item.photoUrl}" onerror="this.parentElement.innerHTML='📦'">` : '📦'}</div>
                      <div class="sale-cart-name">${item.brand} ${item.model}</div>
                    </div>
                  </td>
                  <td>${item.qty}</td>
                  <td>${UI.money(item.price)}</td>
                  <td style="font-weight:800; color:var(--green)">${UI.money(item.price * item.qty)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="text-align:right; margin-top:14px; font-weight:800; font-size:17px">Subtotal: ${UI.money(subtotal)}</div>
        ` : '<div style="text-align:center; color:var(--muted); padding:16px; margin-top:14px; background:var(--surface2); border-radius:10px">Nenhum produto adicionado ainda.</div>'}
      `,
      actions: [{ label: 'Fechar', cls: 'btn btn-secondary', action: 'UI.closeModal()' }]
    });
  }

  function _onPaymentChange() {
    const payment = document.getElementById('sale-payment').value;
    saleState.payment = payment;
    const method = paymentMethods.find(p => p.id === payment);
    const grp = document.getElementById('installments-group');
    grp.style.display = method?.installments ? 'block' : 'none';
    _updateTotal();
  }

  function _updateTotal() {
    const subtotal = cart.reduce((s, i) => s + (i.price * i.qty), 0);
    const payment = document.getElementById('sale-payment').value;
    const method = paymentMethods.find(p => p.id === payment);

    const installmentsEl = document.getElementById('sale-installments');
    if (installmentsEl) saleState.installments = parseInt(installmentsEl.value) || 1;
    const originEl = document.getElementById('sale-origin');
    if (originEl) saleState.origin = originEl.value;

    const discount = subtotal * ((method?.discount || 0) / 100);
    const total = subtotal - discount;
    document.getElementById('sale-subtotal').textContent = UI.money(subtotal);
    document.getElementById('sale-total').textContent = UI.money(total);
    document.getElementById('discount-notice').textContent = discount > 0 ? `Desconto aplicado: ${UI.money(discount)}` : '';

    const instValEl = document.getElementById('installment-value');
    if (instValEl) {
      if (method?.installments) {
        const n = saleState.installments;
        instValEl.textContent = n > 1 ? `${n}x de ${UI.money(total / n)}` : 'À vista';
      } else {
        instValEl.textContent = '';
      }
    }
  }

  async function _checkout() {
    if (cart.length === 0) { UI.toast('Carrinho vazio.', 'warn'); return; }
    const customerId = document.getElementById('selected-customer').getAttribute('data-id');
    if (!customerId) { UI.toast('Selecione um cliente.', 'warn'); return; }

    UI.confirm('Deseja finalizar esta venda?', async () => {
      UI.loading(true, 'Registrando venda...');
      try {
        const companyId = Auth.getCompanyId();
        const subtotal = cart.reduce((s, i) => s + (i.price * i.qty), 0);
        const payment = document.getElementById('sale-payment').value;
        const total = parseFloat(document.getElementById('sale-total').textContent.replace('R$','').replace('.','').replace(',','.'));
        
        const origin = document.getElementById('sale-origin').value;
        const commissionPct = origin === 'online' ? 10 : 5;
        const commissionVal = total * (commissionPct / 100);
        const method = paymentMethods.find(p => p.id === payment);
        const installments = method?.installments ? (parseInt(document.getElementById('sale-installments')?.value) || 1) : 1;

        // Loja de onde o estoque será baixado: a loja vinculada ao vendedor,
        // ou a loja padrão caso o perfil ainda não tenha uma loja atribuída.
        const stores = await Stock.getStores();
        const profile = Auth.getProfile();
        const store = stores.find(s => s.id === profile.storeId) || stores.find(s => s.isDefault) || stores[0];

        const cust = customers.find(x => x.id === customerId);

        // Número sequencial do pedido (PI), por empresa — contador transacional.
        const counterRef = db.collection('companies').doc(companyId).collection('settings').doc('counters');
        const orderNumber = await db.runTransaction(async tx => {
          const c = await tx.get(counterRef);
          const next = ((c.exists && c.data().sale) || 0) + 1;
          tx.set(counterRef, { sale: next }, { merge: true });
          return next;
        });

        const saleData = {
          orderNumber,
          customerId,
          customerName: cust.name,
          customerPhone: cust.phone || '',
          customerDocument: cust.document || '',
          customerAddress: cust.address || '',
          customerNeighborhood: cust.neighborhood || '',
          customerCep: cust.cep || '',
          customerCity: cust.city || '',
          delivery: {
            building: document.getElementById('ent-building').value,
            block: document.getElementById('ent-block').value,
            floor: document.getElementById('ent-floor').value,
            apartment: document.getElementById('ent-apt').value,
            date: document.getElementById('ent-date')?.value || '',
          },
          obs: document.getElementById('ent-obs')?.value.trim() || '',
          sellerId: Auth.getProfileId(),
          sellerName: Auth.getProfile().name,
          storeId: store?.id || null,
          storeName: store?.name || null,
          items: cart,
          subtotal,
          total,
          paymentMethod: payment,
          paymentMethodName: method?.name || payment,
          installments,
          installmentValue: installments > 1 ? total / installments : total,
          origin,
          commissionPct,
          commissionVal,
          status: 'concluido',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const deliveryData = {
          customerName: cust.name,
          customerId,
          phone: cust.phone || '',
          address: cust.address || '',
          building: document.getElementById('ent-building').value,
          block: document.getElementById('ent-block').value,
          floor: document.getElementById('ent-floor').value,
          apartment: document.getElementById('ent-apt').value,
          items: cart.map(i => ({ name: `${i.brand||''} ${i.model||''}`.trim(), qty: i.qty })),
          status: 'pendente',
          driverId: null, // Será atribuído pelo Admin ou pego pelo primeiro entregador
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const batch = db.batch();
        const saleRef = db.collection('companies').doc(companyId).collection('sales').doc();
        batch.set(saleRef, saleData);
        
        const deliveryRef = db.collection('companies').doc(companyId).collection('deliveries').doc();
        batch.set(deliveryRef, { ...deliveryData, saleId: saleRef.id });

        // Baixa de estoque — desconta da loja da venda e do total geral
        cart.forEach(item => {
          const pRef = db.collection('companies').doc(companyId).collection('products').doc(item.id);
          const update = { stock: firebase.firestore.FieldValue.increment(-item.qty) };
          if (store?.id) update[`stockByStore.${store.id}`] = firebase.firestore.FieldValue.increment(-item.qty);
          batch.update(pRef, update);
        });

        await batch.commit();
        UI.loading(false);
        UI.toast('Venda finalizada com sucesso!', 'success');
        cart = [];
        selectedCustomerId = null;
        saleState = { payment: paymentMethods[0]?.id || 'pix', installments: 1, origin: 'loja', building: '', block: '', floor: '', apartment: '', obs: '', date: '' };
        // Mostra o recibo de compra (impressão/PDF) assim que a venda fecha.
        // Usa a hora local aqui porque o valor gravado é um FieldValue
        // (carimbo do servidor), que só vira data real depois de recarregado.
        // Se o vendedor fechar o recibo sem imprimir, ele consegue reabrir
        // depois em Vendas → 🧾 (reimpressão a qualquer momento).
        await Receipt.show(saleRef.id, { ...saleData, createdAt: new Date() });
        loadModule('dashboard');
      } catch (err) {
        UI.loading(false);
        UI.toast('Erro: ' + err.message, 'error');
      }
    });
  }

  return { render, _searchCust, _selectCust, _clearCust, _openNewCustomer, _saveNewCustomer, _searchProd, _addToCart, _updateQty, _updatePrice, _removeItem, _checkout, _updateTotal, _onPaymentChange, _previewSheet, _syncField, _clearAll };
})();
