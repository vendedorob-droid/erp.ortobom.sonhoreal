// ============================================================
// COLCHOEIRO ERP — Módulo Gestão de Equipe (Perfis / PINs)
// ============================================================
// Neste sistema cada funcionário tem um PERFIL com PIN de 4 dígitos
// (coleção 'profiles'), não uma conta de e-mail/senha do Firebase.
// Esta tela permite ao admin criar, editar e desativar esses perfis
// sem precisar entrar no console do Firebase.

const UsersAdmin = (() => {
  let all = [];

  async function render(container) {
    if (!Auth.hasRole('admin')) {
      container.innerHTML = '<div class="p-20">Acesso negado.</div>';
      return;
    }
    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Gestão de Equipe</div><div class="page-sub">Crie e gerencie os PINs de acesso da sua equipe</div></div>
        <button class="btn btn-primary" onclick="UsersAdmin._openForm(null)">+ Novo Perfil</button>
      </div>
      <div class="card">
        <div id="u-list">${UI.skeleton(5,['30%','30%','20%','20%'])}</div>
      </div>
    </div>`;
    await _load();
  }

  async function _load() {
    const snap = await db.collection('profiles')
      .where('companyId', '==', Auth.getCompanyId())
      .get();
    all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _renderList();
  }

  const ROLE_LABEL = { admin: 'Administrador', gerente: 'Gerente', vendedor: 'Vendedor', financeiro: 'Financeiro', entregador: 'Entregador' };

  function _renderList() {
    const list = document.getElementById('u-list');
    list.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Cargo</th>
            <th>PIN</th>
            <th>Status</th>
            <th style="text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${all.map(u => `
            <tr>
              <td style="font-weight:700">${u.name}</td>
              <td>${ROLE_LABEL[u.role] || u.role}</td>
              <td style="font-family:monospace;letter-spacing:2px">••••</td>
              <td>${UI.badge(u.active !== false ? 'ativo' : 'inativo')}</td>
              <td style="text-align:right">
                <button class="btn btn-ghost btn-sm" onclick="UsersAdmin._openForm('${u.id}')">✏️ Editar</button>
                ${u.id !== Auth.getProfileId() ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="UsersAdmin._toggleActive('${u.id}', ${u.active !== false})">${u.active !== false ? 'Desativar' : 'Ativar'}</button>` : '<span style="font-size:11px;color:var(--muted)">(você)</span>'}
              </td>
            </tr>
          `).join('') || '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">Nenhum perfil cadastrado.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  async function _openForm(id) {
    const u = id ? all.find(x => x.id === id) : {};
    const stores = await Stock.getStores();
    UI.modal({
      title: id ? 'Editar Perfil' : 'Novo Perfil',
      size: 'sm',
      body: `
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Nome Completo</label><input class="form-input" id="u-name" value="${u.name||''}" placeholder="Ex: Maria Silva"></div>
          <div class="form-group">
            <label class="form-label">Cargo</label>
            <select class="form-input" id="u-role">
              <option value="vendedor" ${u.role==='vendedor'?'selected':''}>Vendedor</option>
              <option value="gerente" ${u.role==='gerente'?'selected':''}>Gerente</option>
              <option value="financeiro" ${u.role==='financeiro'?'selected':''}>Financeiro</option>
              <option value="entregador" ${u.role==='entregador'?'selected':''}>Entregador</option>
              <option value="admin" ${u.role==='admin'?'selected':''}>Administrador (acesso total)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Loja</label>
            <select class="form-input" id="u-store">
              <option value="">— Não atribuída —</option>
              ${stores.map(s => `<option value="${s.id}" ${u.storeId===s.id?'selected':''}>${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">PIN de acesso (4 dígitos)</label>
            <input class="form-input" type="text" inputmode="numeric" maxlength="4" id="u-pin" value="${id ? '' : ''}" placeholder="${id ? 'Deixe em branco para não alterar' : 'Ex: 5678'}">
          </div>
          <div class="form-group"><label class="form-label">Status</label><select class="form-input" id="u-active"><option value="1" ${u.active!==false?'selected':''}>Ativo</option><option value="0" ${u.active===false?'selected':''}>Inativo</option></select></div>
        </div>`,
      actions: [
        { label: 'Cancelar', cls: 'btn btn-secondary', action: 'UI.closeModal()' },
        { label: id ? '💾 Salvar' : '➕ Criar Perfil', cls: 'btn btn-primary', action: `UsersAdmin._save('${id||''}')` }
      ]
    });
  }

  async function _save(id) {
    const name = document.getElementById('u-name').value.trim();
    const role = document.getElementById('u-role').value;
    const pin  = document.getElementById('u-pin').value.trim();
    const active = document.getElementById('u-active').value === '1';

    if (!name) { UI.toast('Informe o nome.', 'warn'); return; }
    if (!id && !/^\d{4}$/.test(pin)) { UI.toast('Informe um PIN de 4 dígitos.', 'warn'); return; }
    if (pin && !/^\d{4}$/.test(pin)) { UI.toast('O PIN deve ter exatamente 4 dígitos.', 'warn'); return; }

    UI.loading(true);
    try {
      if (pin) {
        const dup = await db.collection('profiles').where('pin', '==', pin).get();
        const conflict = dup.docs.find(d => d.id !== id);
        if (conflict) { UI.loading(false); UI.toast('Esse PIN já está em uso por outro perfil.', 'warn'); return; }
      }

      const data = { name, role, active, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (pin) data.pin = pin;
      const storeId = document.getElementById('u-store').value || null;
      data.storeId = storeId;
      data.storeName = storeId ? document.getElementById('u-store').selectedOptions[0].textContent : null;

      if (id) {
        await db.collection('profiles').doc(id).update(data);
      } else {
        data.pin = pin;
        data.companyId = Auth.getCompanyId();
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('profiles').add(data);
      }
      UI.loading(false); UI.closeModal(); UI.toast('Perfil salvo com sucesso!');
      await _load();
    } catch (err) { UI.loading(false); UI.toast(err.message, 'error'); }
  }

  async function _toggleActive(id, current) {
    UI.confirm(current ? 'Desativar este perfil? A pessoa não conseguirá mais entrar com o PIN dela.' : 'Reativar este perfil?', async () => {
      UI.loading(true);
      try {
        await db.collection('profiles').doc(id).update({ active: !current });
        await _load();
        UI.toast(current ? 'Perfil desativado.' : 'Perfil reativado.');
      } catch (err) { UI.toast(err.message, 'error'); }
      UI.loading(false);
    }, current ? 'Desativar' : 'Reativar', current);
  }

  return { render, _openForm, _save, _toggleActive };
})();
