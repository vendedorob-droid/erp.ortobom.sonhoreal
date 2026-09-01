// ============================================================
// COLCHOEIRO ERP — Módulo Produtos
// ============================================================

const Products = (() => {

  let allProducts = [], filtered = [], page = 1;
  const PER_PAGE = 15;

  async function render(container) {
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Produtos</div><div class="page-sub" id="prod-sub">Carregando...</div></div>
        ${Auth.hasMinRole('gerente') ? '<button class="btn btn-primary" onclick="Products._openForm(null)">+ Novo Produto</button>' : ''}
      </div>
      <div class="table-wrap">
        <div class="table-toolbar">
          <div class="filter-bar" id="prod-filters">
            <button class="filter-btn active" onclick="Products._filter('todos',this)">Todos</button>
            <button class="filter-btn" onclick="Products._filter('ativos',this)">Ativos</button>
            <button class="filter-btn" onclick="Products._filter('inativos',this)">Inativos</button>
            <button class="filter-btn" onclick="Products._filter('baixo',this)">Estoque baixo ⚠️</button>
          </div>
          <input class="form-input" style="max-width:220px;padding:7px 12px" placeholder="Buscar produto..." oninput="Products._search(this.value)">
        </div>
        <div id="prod-table">${UI.skeleton(8, ['40%','20%','15%','15%','10%'])}</div>
      </div>
      <div id="prod-pagination" style="display:flex;gap:8px;justify-content:flex-end;padding:14px 0"></div>
    </div>`;
    await _load();
  }

  async function _load() {
    try {
      const snap = await db
        .collection('companies').doc(Auth.getCompanyId())
        .collection('products').orderBy('brand').get();
      allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      filtered = allProducts;
      document.getElementById('prod-sub').textContent = `${allProducts.length} produtos cadastrados`;
      _renderTable();
    } catch(err) {
      document.getElementById('prod-table').innerHTML = `<div style="padding:20px;color:#ef4444">Erro: ${err.message}</div>`;
    }
  }

  function _filter(type, btn) {
    document.querySelectorAll('#prod-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (type === 'ativos')   filtered = allProducts.filter(p => p.active);
    else if (type === 'inativos') filtered = allProducts.filter(p => !p.active);
    else if (type === 'baixo')    filtered = allProducts.filter(p => (p.stock||0) <= 3);
    else filtered = allProducts;
    page = 1; _renderTable();
  }

  function _search(q) {
    const term = q.toLowerCase();
    filtered = allProducts.filter(p =>
      `${p.brand} ${p.model} ${p.technology} ${p.barcode}`.toLowerCase().includes(term));
    page = 1; _renderTable();
  }

  function _renderTable() {
    const paged = UI.paginate(filtered, page, PER_PAGE);
    const rows = paged.items.map(p => `
      <tr>
        <td>
          ${p.photoUrl ? `<div class="prod-thumb-box"><img src="${p.photoUrl}" onerror="this.parentElement.innerHTML='📦'"></div>` : `<div class="prod-thumb-box" style="font-size:18px">📦</div>`}
        </td>
        <td><div style="font-weight:700">${p.brand}</div><div style="font-size:11px;color:#64748b;font-family:monospace">${p.barcode||'—'}</div></td>
        <td style="font-weight:600">${p.model}</td>
        <td style="color:#64748b">${p.technology||'—'}</td>
        <td style="color:#64748b">${p.density||'—'} · ${p.measures||'—'}</td>
        <td style="font-weight:700;color:#10b981">${UI.money(p.price)}</td>
        <td style="color:#94a3b8">${UI.money(p.cost)}</td>
        <td><span style="color:${(p.stock||0)<=3?'#ef4444':'#e2e8f0'};font-weight:700">${p.stock||0} un${(p.stock||0)<=3?' ⚠️':''}</span></td>
        <td>${UI.badge(p.active ? 'ativo' : 'inativo')}</td>
        <td>
          <div style="display:flex;gap:6px">
            ${Auth.hasMinRole('gerente') ? `<button class="btn btn-ghost btn-sm" onclick="Products._openForm('${p.id}')">Editar</button>` : ''}
            ${Auth.hasRole('admin') ? `<button class="btn btn-danger btn-sm" onclick="Products._delete('${p.id}','${p.brand} ${p.model}')">Excluir</button>` : ''}
          </div>
        </td>
      </tr>`).join('');

    document.getElementById('prod-table').innerHTML = `
    <table>
      <thead><tr>
        <th>Foto</th><th>Marca / Cód</th><th>Modelo</th><th>Tecnologia</th><th>Especificações</th>
        <th>Preço</th><th>Custo</th><th>Estoque</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="10" style="text-align:center;padding:24px;color:#64748b">Nenhum produto encontrado.</td></tr>'}</tbody>
    </table>`;

    // Paginação
    const pg = document.getElementById('prod-pagination');
    pg.innerHTML = paged.total > 1
      ? `<span style="font-size:13px;color:#64748b;align-self:center">${filtered.length} produto(s)</span>
         ${paged.hasPrev ? `<button class="btn btn-secondary btn-sm" onclick="Products._goPage(${page-1})">← Anterior</button>` : ''}
         <span style="font-size:13px;font-weight:700;align-self:center">Pág ${page} / ${paged.total}</span>
         ${paged.hasNext ? `<button class="btn btn-secondary btn-sm" onclick="Products._goPage(${page+1})">Próxima →</button>` : ''}`
      : '';
  }

  function _goPage(p) { page = p; _renderTable(); }

  async function _openForm(productId) {
    const product = productId ? allProducts.find(p => p.id === productId) : null;
    const p = product || {};
    const stores = await Stock.getStores();

    UI.modal({
      title: product ? 'Editar Produto' : 'Novo Produto',
      size: 'lg',
      body: `
      <div class="form-grid form-grid-2">
        <div class="form-group"><label class="form-label">Código de barras (EAN)</label><input class="form-input" id="f-barcode" value="${p.barcode||''}" placeholder="7891234560001" style="font-family:monospace"></div>
        <div class="form-group"><label class="form-label">Marca</label><select class="form-input" id="f-brand"><option>Castor</option><option>Probel</option><option>Ortobom</option><option>Sealy</option><option>Anjos</option></select></div>
        <div class="form-group form-full"><label class="form-label">Modelo</label><input class="form-input" id="f-model" value="${p.model||''}" placeholder="Dream Plus King"></div>
        <div class="form-group"><label class="form-label">Tecnologia</label><select class="form-input" id="f-tech"><option>Molas Pocket</option><option>Molas Bonnel</option><option>Espuma HR</option><option>Memory Foam</option><option>Látex</option></select></div>
        <div class="form-group"><label class="form-label">Densidade</label><select class="form-input" id="f-density"><option>D28</option><option>D33</option><option>D45</option><option>D50</option><option>D65</option></select></div>
        <div class="form-group"><label class="form-label">Medidas (m)</label><input class="form-input" id="f-measures" value="${p.measures||''}" placeholder="1,58 x 1,98"></div>
        <div class="form-group"><label class="form-label">Altura (cm)</label><input class="form-input" id="f-height" value="${p.height||''}" placeholder="25"></div>
        <div class="form-group"><label class="form-label">Garantia</label><input class="form-input" id="f-warranty" value="${p.warranty||''}" placeholder="5 anos"></div>
        <div class="form-group"><label class="form-label">Custo (R$)</label><input class="form-input" type="number" id="f-cost" value="${p.cost||''}" step="0.01" oninput="Products._calcPrice()"></div>
        <div class="form-group"><label class="form-label">Margem (%)</label><input class="form-input" type="number" id="f-margin" value="${p.margin||''}" step="1" placeholder="Da marca" oninput="Products._calcPrice()"></div>
        <div class="form-group"><label class="form-label">Preço de venda (R$)</label><input class="form-input" type="number" id="f-price" value="${p.price||''}" step="0.01"></div>
        <div class="form-group"><label class="form-label">Desc. máximo (%)</label><input class="form-input" type="number" id="f-maxdisc" value="${p.maxDiscount||10}" min="0" max="30"></div>
        <div class="form-group"><label class="form-label">Status</label><select class="form-input" id="f-active"><option value="1" ${p.active!==false?'selected':''}>Ativo</option><option value="0" ${p.active===false?'selected':''}>Inativo</option></select></div>
        <div class="form-group form-full"><label class="form-label">Descrição</label><textarea class="form-input" id="f-desc" rows="2" placeholder="Detalhes adicionais...">${p.description||''}</textarea></div>
        <div class="form-group form-full">
          <label class="form-label">Foto do Produto</label>
          <div style="display:flex; gap:14px; align-items:flex-start; flex-wrap:wrap">
            <img id="f-photo-preview" src="${p.photoUrl || ''}" style="width:64px; height:64px; border-radius:8px; object-fit:contain; background:var(--surface3); flex-shrink:0; padding:4px; ${p.photoUrl ? '' : 'display:none'}" onerror="this.style.display='none'">
            <div style="flex:1; min-width:220px">
              <input type="file" accept="image/*" id="f-photo-file" style="display:none">
              <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('f-photo-file').click()">📤 Enviar Imagem</button>
              <div id="f-photo-progress" style="display:none; font-size:11px; color:var(--muted); margin-top:6px"></div>
              <input class="form-input" id="f-photo-url" value="${p.photoUrl || ''}" placeholder="ou cole uma URL de imagem" style="margin-top:8px" oninput="document.getElementById('f-photo-preview').src=this.value; document.getElementById('f-photo-preview').style.display=this.value?'block':'none'">
            </div>
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:4px">Upload via Cloudinary (configure em Configurações → Imagens). Colar um link de imagem direto também funciona.</div>
        </div>
        <div class="form-group form-full">
          <label class="form-label">Estoque por Loja</label>
          <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; background:var(--surface2); padding:12px; border-radius:10px">
            ${stores.map(s => `
              <div>
                <div style="font-size:11px; color:var(--muted); margin-bottom:4px">${s.name}</div>
                <input class="form-input" type="number" min="0" id="f-stock-${s.id}" value="${p.stockByStore && p.stockByStore[s.id] != null ? p.stockByStore[s.id] : (s.isDefault ? (p.stock||0) : 0)}">
              </div>`).join('')}
          </div>
        </div>
      </div>`,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: product ? '💾 Salvar' : '➕ Cadastrar', cls: 'btn btn-primary', action: `Products._save('${productId||''}')` },
      ]
    });
    // Pré-selecionar valores
    if (p.brand)      document.getElementById('f-brand').value      = p.brand;
    if (p.technology) document.getElementById('f-tech').value       = p.technology;
    if (p.density)    document.getElementById('f-density').value    = p.density;
    Cloudinary.bindPicker({ fileInputId: 'f-photo-file', previewId: 'f-photo-preview', urlInputId: 'f-photo-url', progressId: 'f-photo-progress' });
  }

  function _calcPrice() {
    const cost   = parseFloat(document.getElementById('f-cost')?.value) || 0;
    const margin = parseFloat(document.getElementById('f-margin')?.value) || 0;
    if (cost > 0 && margin > 0) {
      const price = Math.round(cost * (1 + margin / 100));
      document.getElementById('f-price').value = price;
    }
  }

  async function _save(productId) {
    const model = document.getElementById('f-model')?.value?.trim();
    const price = parseFloat(document.getElementById('f-price')?.value);
    if (!model || !price) { UI.toast('Preencha modelo e preço.', 'warn'); return; }

    const stores = await Stock.getStores();
    const old = productId ? allProducts.find(x => x.id === productId) : null;
    const stockByStore = {};
    stores.forEach(s => {
      stockByStore[s.id] = parseInt(document.getElementById(`f-stock-${s.id}`)?.value) || 0;
    });
    const totalStock = Object.values(stockByStore).reduce((a, b) => a + b, 0);

    const data = {
      barcode:     document.getElementById('f-barcode')?.value?.trim() || '',
      brand:       document.getElementById('f-brand')?.value || '',
      model,
      technology:  document.getElementById('f-tech')?.value || '',
      density:     document.getElementById('f-density')?.value || '',
      measures:    document.getElementById('f-measures')?.value || '',
      height:      document.getElementById('f-height')?.value || '',
      warranty:    document.getElementById('f-warranty')?.value || '',
      cost:        parseFloat(document.getElementById('f-cost')?.value) || 0,
      margin:      parseFloat(document.getElementById('f-margin')?.value) || 0,
      price,
      maxDiscount: parseInt(document.getElementById('f-maxdisc')?.value) || 10,
      stockByStore,
      stock:       totalStock,
      active:      document.getElementById('f-active')?.value === '1',
      description: document.getElementById('f-desc')?.value || '',
      photoUrl:    document.getElementById('f-photo-url')?.value?.trim() || '',
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy:   Auth.getProfileId(),
    };

    UI.loading(true, 'Salvando produto...');
    try {
      const companyId = Auth.getCompanyId();
      const col = db.collection('companies').doc(companyId).collection('products');
      const movementsCol = db.collection('companies').doc(companyId).collection('stock_movements');

      // Salva o produto primeiro (para termos o ID real em caso de produto novo),
      // e só então registramos as entradas no histórico com o ID correto.
      let resolvedId = productId;
      if (productId) {
        await col.doc(productId).update(data);
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        data.createdBy = Auth.getProfileId();
        const ref = await col.add(data);
        resolvedId = ref.id;
      }

      // Registra uma "entrada" no histórico para cada loja cuja quantidade aumentou
      for (const s of stores) {
        const before = old ? (old.stockByStore && old.stockByStore[s.id] != null ? old.stockByStore[s.id] : (s.isDefault ? (old.stock||0) : 0)) : 0;
        const after = stockByStore[s.id];
        if (after > before) {
          await movementsCol.add({
            type: 'entrada',
            productId: resolvedId, productName: `${data.brand} ${data.model}`,
            storeId: s.id, storeName: s.name,
            qty: after - before,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: Auth.getProfileId(), createdByName: Auth.getProfile().name
          });
        }
      }

      UI.loading(false);
      UI.closeModal();
      UI.toast('Produto salvo com sucesso!', 'success');
      await _load();
    } catch(err) {
      UI.loading(false);
      UI.toast('Erro ao salvar: ' + err.message, 'error');
    }
  }

  async function _delete(id, name) {
    UI.confirm(`Excluir "${name}"?`, async () => {
      UI.loading(true);
      try {
        await db.collection('companies').doc(Auth.getCompanyId()).collection('products').doc(id).delete();
        UI.loading(false);
        UI.toast('Produto excluído.', 'success');
        await _load();
      } catch(err) {
        UI.loading(false);
        UI.toast('Erro: ' + err.message, 'error');
      }
    }, 'Excluir', true);
  }

  return { render, _filter, _search, _goPage, _openForm, _calcPrice, _save, _delete };
})();
