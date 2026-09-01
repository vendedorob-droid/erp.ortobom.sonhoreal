// ============================================================
// COLCHOEIRO ERP — Módulo Marcas
// ============================================================
const Brands = (() => {
  let brands = [];

  async function render(container) {
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Marcas</div><div class="page-sub">Gerencie marcas, margens e limites de desconto</div></div>
        ${Auth.hasMinRole('gerente') ? '<button class="btn btn-primary" onclick="Brands._openForm(null)">+ Nova Marca</button>' : ''}
      </div>
      <div id="brands-grid">${UI.skeleton(3,['50%','30%','20%'])}</div>
    </div>`;
    await _load();
  }

  async function _load() {
    const snap = await db.collection('companies').doc(Auth.getCompanyId()).collection('brands').orderBy('name').get();
    brands = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('brands-grid').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px">
      ${brands.map(b => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div style="width:44px;height:44px;border-radius:12px;background:rgba(99,102,241,.12);display:flex;align-items:center;justify-content:center;font-size:20px">🏷️</div>
          ${UI.badge(b.active ? 'ativo' : 'inativo')}
        </div>
        <div style="font-size:20px;font-weight:800;letter-spacing:-.03em;margin-bottom:2px">${b.name}</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:14px">${b.productsCount||0} produtos</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
          <div style="background:var(--surface3);border-radius:8px;padding:10px 12px">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:700;margin-bottom:2px">Margem</div>
            <div style="font-size:18px;font-weight:800;color:#10b981">${b.margin||0}%</div>
          </div>
          <div style="background:var(--surface3);border-radius:8px;padding:10px 12px">
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;font-weight:700;margin-bottom:2px">Desc. Máx.</div>
            <div style="font-size:18px;font-weight:800;color:#f59e0b">${b.maxDiscount||0}%</div>
          </div>
        </div>
        ${Auth.hasMinRole('gerente') ? `
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" style="flex:1" onclick="Brands._openForm('${b.id}')">Editar</button>
          <button class="btn btn-primary btn-sm" style="flex:1" onclick="loadModule('products')">Ver produtos</button>
        </div>` : ''}
      </div>`).join('') || '<div style="color:#64748b;padding:20px;text-align:center">Nenhuma marca cadastrada.</div>'}
    </div>`;
  }

  function _openForm(id) {
    const b = id ? brands.find(x => x.id === id) : {};
    UI.modal({
      title: id ? 'Editar Marca' : 'Nova Marca',
      size: 'sm',
      body: `
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Nome da marca</label><input class="form-input" id="b-name" value="${b.name||''}" placeholder="Ex: Castor"></div>
        <div class="form-group"><label class="form-label">Margem padrão (%)</label><input class="form-input" type="number" id="b-margin" value="${b.margin||42}" min="0" max="100"></div>
        <div class="form-group"><label class="form-label">Desconto máximo (%)</label><input class="form-input" type="number" id="b-maxdisc" value="${b.maxDiscount||10}" min="0" max="50"></div>
        <div class="form-group"><label class="form-label">Status</label><select class="form-input" id="b-active"><option value="1" ${b.active!==false?'selected':''}>Ativa</option><option value="0" ${b.active===false?'selected':''}>Inativa</option></select></div>
      </div>`,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: id ? '💾 Salvar' : '➕ Criar', cls: 'btn btn-primary', action: `Brands._save('${id||''}')` },
      ]
    });
  }

  async function _save(id) {
    const name = document.getElementById('b-name')?.value?.trim();
    if (!name) { UI.toast('Digite o nome da marca.', 'warn'); return; }
    const data = {
      name,
      margin:      parseInt(document.getElementById('b-margin')?.value) || 42,
      maxDiscount: parseInt(document.getElementById('b-maxdisc')?.value) || 10,
      active:      document.getElementById('b-active')?.value === '1',
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    };
    UI.loading(true);
    try {
      const col = db.collection('companies').doc(Auth.getCompanyId()).collection('brands');
      if (id) { await col.doc(id).update(data); }
      else { data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await col.add(data); }
      UI.loading(false); UI.closeModal();
      UI.toast('Marca salva!', 'success');
      await _load();
    } catch(err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  return { render, _openForm, _save };
})();
