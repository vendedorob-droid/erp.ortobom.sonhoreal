// ============================================================
// COLCHOEIRO ERP — Módulo Clientes (CRM)
// ============================================================

const Customers = (() => {
  let all = [], page = 1;

  async function render(container) {
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Clientes (CRM)</div><div class="page-sub" id="c-sub">Carregando...</div></div>
        <button class="btn btn-primary" onclick="Customers._openForm()">+ Novo Cliente</button>
      </div>
      <div class="table-toolbar">
        <input class="form-input" style="max-width:300px" placeholder="Buscar por nome ou celular..." oninput="Customers._search(this.value)">
      </div>
      <div id="c-list">${UI.skeleton(5,['30%','20%','20%','15%','15%'])}</div>
    </div>`;
    await _load();
  }

  async function _load() {
    const companyId = Auth.getCompanyId();
    const snap = await db.collection('companies').doc(companyId).collection('customers').orderBy('name').get();
    
    // Busca últimas compras de todos os clientes em paralelo
    const customersWithSales = await Promise.all(snap.docs.map(async d => {
      const data = d.data();
      const salesSnap = await db.collection('companies').doc(companyId).collection('sales')
        .where('customerName', '==', data.name).orderBy('createdAt', 'desc').limit(1).get();
      const lastSale = salesSnap.empty ? null : salesSnap.docs[0].data();
      return { id: d.id, ...data, lastSale };
    }));

    all = customersWithSales;
    _renderList(all);
  }

  function _search(q) {
    const term = q.toLowerCase();
    const filtered = all.filter(c => `${c.name} ${c.phone}`.toLowerCase().includes(term));
    _renderList(filtered);
  }

  function _renderList(list) {
    document.getElementById('c-sub').textContent = `${list.length} clientes cadastrados`;
    const now = new Date();
    const currentMonth = now.getMonth();

    document.getElementById('c-list').innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Cliente</th><th>Contato</th><th>Aniversário</th><th>Última Compra</th><th></th></tr></thead>
      <tbody>
        ${list.map(c => {
          let bdayColor = 'inherit';
          let bdayLabel = '—';
          if (c.birthDate) {
            const bDate = new Date(c.birthDate + 'T00:00:00');
            const bMonth = bDate.getMonth();
            const diff = bMonth - currentMonth;
            
            if (bMonth === currentMonth) bdayColor = '#10b981'; // Verde (mês atual)
            else if (diff === 1 || diff === -11) bdayColor = '#8b5cf6'; // Lilás (mês que vem)
            
            bdayLabel = `${bDate.getDate().toString().padStart(2,'0')}/${(bMonth+1).toString().padStart(2,'0')}`;
          }

          return `<tr>
            <td>
              <div style="font-weight:700">${c.name}</div>
              <div style="font-size:11px;color:var(--muted)">Desde ${UI.date(c.createdAt)}</div>
              ${Auth.hasRole('admin') ? `<div style="font-size:10px;color:var(--primary);margin-top:2px">👤 Resp: ${c.createdByName||'Sistema'}</div>` : ''}
            </td>
            <td>
              ${c.phone||'—'}
              ${c.phone ? `<a href="https://wa.me/55${c.phone.replace(/\D/g,'')}" target="_blank" style="margin-left:5px;text-decoration:none" title="WhatsApp">🟢</a>` : ''}
            </td>
            <td><span style="font-weight:800;color:${bdayColor}">${bdayLabel}</span></td>
            <td>
              ${c.lastSale ? `
                <div style="font-weight:700;color:var(--green)">${UI.money(c.lastSale.total)}</div>
                <div style="font-size:11px;color:var(--muted)">${UI.date(c.lastSale.createdAt)}</div>
              ` : '<span style="color:var(--muted)">Sem compras</span>'}
            </td>
            <td><button class="btn btn-ghost btn-sm" onclick="Customers._openForm('${c.id}')">Editar</button></td>
          </tr>`;
        }).join('') || '<tr><td colspan="5" style="text-align:center;padding:24px">Nenhum cliente encontrado.</td></tr>'}
      </tbody>
    </table></div>`;
  }

  function _openForm(id = null) {
    const c = id ? all.find(x => x.id === id) : {};
    UI.modal({
      title: id ? 'Editar Cliente' : 'Novo Cliente',
      body: `
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Nome Completo</label><input class="form-input" id="c-name" value="${c.name||''}" placeholder="Ex: João Silva"></div>
        <div class="form-group"><label class="form-label">Celular / WhatsApp</label><input class="form-input" id="c-phone" value="${c.phone||''}" placeholder="(11) 99999-9999"></div>
        <div class="form-group"><label class="form-label">Data de Nascimento</label><input class="form-input" type="date" id="c-bday" value="${c.birthDate||''}"></div>
        <div class="form-group"><label class="form-label">CPF / CNPJ</label><input class="form-input" id="c-doc" value="${c.document||''}"></div>
        <div class="form-group"><label class="form-label">CEP</label><input class="form-input" id="c-cep" value="${c.cep||''}"></div>
        <div class="form-group form-full"><label class="form-label">Endereço</label><input class="form-input" id="c-address" value="${c.address||''}" placeholder="Rua, número..."></div>
        <div class="form-group"><label class="form-label">Bairro</label><input class="form-input" id="c-hood" value="${c.neighborhood||''}"></div>
        <div class="form-group"><label class="form-label">Cidade / UF</label><input class="form-input" id="c-city" value="${c.city||''}" placeholder="Manaus / AM"></div>
      </div>`,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: 'Salvar', cls: 'btn btn-primary', action: `Customers._save('${id||''}')` }
      ]
    });
  }

  async function _save(id = '') {
    const name = document.getElementById('c-name').value.trim();
    if (!name) { UI.toast('Nome é obrigatório.', 'warn'); return; }
    
    const data = {
      name,
      phone: document.getElementById('c-phone').value.trim(),
      birthDate: document.getElementById('c-bday').value,
      address: document.getElementById('c-address').value.trim(),
      document: document.getElementById('c-doc').value.trim(),
      cep: document.getElementById('c-cep').value.trim(),
      neighborhood: document.getElementById('c-hood').value.trim(),
      city: document.getElementById('c-city').value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    UI.loading(true);
    try {
      const col = db.collection('companies').doc(Auth.getCompanyId()).collection('customers');
      if (id) await col.doc(id).update(data);
      else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        data.createdBy = Auth.getProfileId();
        data.createdByName = Auth.getProfile().name;
        await col.add(data);
      }
      UI.loading(false); UI.closeModal(); UI.toast('Cliente salvo!');
      await _load();
    } catch (err) { UI.loading(false); UI.toast('Erro: ' + err.message, 'error'); }
  }

  return { render, _search, _openForm, _save };
})();
