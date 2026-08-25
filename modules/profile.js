// ============================================================
// COLCHOEIRO ERP — Módulo Meu Perfil
// ============================================================
// Neste sistema o acesso é por PIN (não por e-mail/senha do Firebase),
// então "Meu Perfil" edita o nome e permite trocar o próprio PIN.

const Profile = (() => {
  async function render(container) {
    const profile = Auth.getProfile();

    container.innerHTML = `<div class="fade-in">
      <div class="page-header">
        <div><div class="page-title">Meu Perfil</div><div class="page-sub">Gerencie seus dados de acesso</div></div>
      </div>
      
      <div class="card" style="max-width:600px; margin:0 auto">
        <div style="text-align:center; padding:20px">
          <div class="avatar avatar-lg" style="width:80px; height:80px; font-size:32px; margin:0 auto 15px; background:linear-gradient(135deg,#6366f1,#8b5cf6)">
            ${profile.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()}
          </div>
          <div style="font-size:20px; font-weight:800">${profile.name}</div>
          <div style="color:var(--muted)">${profile.role.toUpperCase()}</div>
        </div>

        <div style="border-top:1px solid var(--border); padding-top:20px; margin-top:10px">
          <div class="form-group">
            <label class="form-label">Nome Completo</label>
            <input class="form-input" id="p-name" value="${profile.name}">
          </div>
          <button class="btn btn-primary" style="width:100%; margin-top:10px" onclick="Profile._save()">Salvar Alterações</button>
        </div>

        <div style="border-top:1px solid var(--border); padding-top:20px; margin-top:20px">
          <div class="card-title" style="font-size:16px; margin-bottom:15px">Alterar meu PIN</div>
          <div class="form-group">
            <label class="form-label">PIN Atual</label>
            <input class="form-input" type="password" inputmode="numeric" maxlength="4" id="p-old-pin" placeholder="••••">
          </div>
          <div class="form-group">
            <label class="form-label">Novo PIN (4 dígitos)</label>
            <input class="form-input" type="password" inputmode="numeric" maxlength="4" id="p-new-pin" placeholder="••••">
          </div>
          <button class="btn btn-secondary" style="width:100%" onclick="Profile._changePin()">Atualizar PIN</button>
        </div>
      </div>
    </div>`;
  }

  async function _save() {
    const name = document.getElementById('p-name').value.trim();
    if (!name) return;
    const profile = Auth.getProfile();
    UI.loading(true);
    try {
      await db.collection('profiles').doc(profile.id).update({ name });
      profile.name = name;
      sessionStorage.setItem('colchoeiro_profile', JSON.stringify(profile));
      document.getElementById('profile-name').textContent = name;
      UI.toast('Perfil atualizado!');
      UI.loading(false);
    } catch (err) { UI.loading(false); UI.toast(err.message, 'error'); }
  }

  async function _changePin() {
    const oldPin = document.getElementById('p-old-pin').value;
    const newPin = document.getElementById('p-new-pin').value;
    const profile = Auth.getProfile();

    if (oldPin !== profile.pin) { UI.toast('PIN atual incorreto.', 'error'); return; }
    if (!/^\d{4}$/.test(newPin)) { UI.toast('O novo PIN deve ter 4 dígitos.', 'warn'); return; }

    UI.loading(true);
    try {
      const existing = await db.collection('profiles').where('pin', '==', newPin).get();
      if (!existing.empty && existing.docs[0].id !== profile.id) {
        UI.loading(false);
        UI.toast('Esse PIN já está em uso por outro perfil.', 'warn');
        return;
      }
      await db.collection('profiles').doc(profile.id).update({ pin: newPin });
      profile.pin = newPin;
      sessionStorage.setItem('colchoeiro_profile', JSON.stringify(profile));
      UI.toast('PIN alterado com sucesso!');
      UI.loading(false);
      document.getElementById('p-old-pin').value = '';
      document.getElementById('p-new-pin').value = '';
    } catch (err) { UI.loading(false); UI.toast(err.message, 'error'); }
  }

  return { render, _save, _changePin };
})();
