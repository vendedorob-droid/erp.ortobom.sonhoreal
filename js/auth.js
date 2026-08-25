// ============================================================
// COLCHOEIRO ERP — Módulo de Acesso por PIN e Perfis Internos
// ============================================================

const Auth = (() => {

  let _currentProfile = null;
  let _isInitialized = false;

  // ── Inicialização Anônima ──────────────────────────────────
  async function init(onReady) {
    if (_isInitialized) return;
    
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        // Se não houver usuário, faz login anônimo (precisa estar ativo no Firebase)
        try {
          await auth.signInAnonymously();
        } catch (err) {
          console.error("Erro no acesso anônimo:", err);
          alert("Erro ao conectar ao banco de dados. Ative 'Login Anônimo' no Firebase.");
        }
      }
      
      // Tenta recuperar perfil salvo na sessão
      const saved = sessionStorage.getItem('colchoeiro_profile');
      if (saved) {
        _currentProfile = JSON.parse(saved);
        onReady(_currentProfile);
      } else {
        onReady(null); // Vai para seleção de perfil
      }
      _isInitialized = true;
    });
  }

  // ── Seleção de Perfil ──────────────────────────────────────
  async function selectProfile(pin) {
    try {
      // Busca o perfil pelo PIN na coleção 'profiles'
      const snap = await db.collection('profiles').where('pin', '==', pin).get();
      
      if (snap.empty) {
        // Se for o primeiro acesso e não houver perfis, cria o Admin padrão
        const allProfiles = await db.collection('profiles').limit(1).get();
        if (allProfiles.empty && pin === '1234') {
          const admin = {
            name: 'Administrador',
            role: 'admin',
            pin: '1234',
            companyId: 'empresa-001',
            active: true
          };
          const doc = await db.collection('profiles').add(admin);
          _currentProfile = { ...admin, id: doc.id };
          sessionStorage.setItem('colchoeiro_profile', JSON.stringify(_currentProfile));
          return { ok: true, profile: _currentProfile };
        }
        return { ok: false, message: 'PIN incorreto.' };
      }

      const data = snap.docs[0].data();
      if (!data.active) return { ok: false, message: 'Perfil desativado.' };

      _currentProfile = { ...data, id: snap.docs[0].id };
      sessionStorage.setItem('colchoeiro_profile', JSON.stringify(_currentProfile));
      return { ok: true, profile: _currentProfile };
    } catch (err) {
      return { ok: false, message: 'Erro ao acessar: ' + err.message };
    }
  }

  // ── Troca de Perfil ────────────────────────────────────────
  function switchProfile() {
    sessionStorage.removeItem('colchoeiro_profile');
    window.location.href = 'index.html';
  }

  // ── Getters ────────────────────────────────────────────────
  function getProfile()   { return _currentProfile; }
  function getProfileId() { return _currentProfile?.id || null; }
  function getCompanyId() { return _currentProfile?.companyId || 'empresa-001'; }
  function getRole()      { return _currentProfile?.role || 'vendedor'; }

  // NOTA: este sistema usa autenticação anônima do Firebase apenas para
  // liberar o acesso ao Firestore — quem realmente identifica "quem é
  // quem" é o PERFIL (PIN), não o usuário do Firebase Auth. Por isso,
  // toda referência de "autor da ação" (vendedor, criado por, etc.)
  // deve usar getProfileId()/getProfile(), nunca um uid do Firebase.
  function getUser() {
    return { uid: getProfileId() || 'sem-perfil' };
  }

  // ── Verificações de permissão ──────────────────────────────
  const ROLE_LEVEL = { admin: 4, gerente: 3, financeiro: 2, vendedor: 1, entregador: 1 };

  function hasRole(...roles) {
    return roles.includes(getRole());
  }

  function hasMinRole(minRole) {
    return (ROLE_LEVEL[getRole()] || 0) >= (ROLE_LEVEL[minRole] || 0);
  }

  function requireAuth() {
    if (!_currentProfile) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  // ── Confirmação de ações sensíveis (cancelar venda, zerar dados, etc.) ──
  // Como não existe "senha de Firebase" nesse modelo (só PIN), a forma real
  // de confirmar uma ação sensível é o próprio admin redigitar o PIN dele.
  function verifyAdminPin(pin) {
    return hasRole('admin') && !!_currentProfile?.pin && pin === _currentProfile.pin;
  }

  return {
    init, selectProfile, switchProfile,
    getProfile, getProfileId, getCompanyId, getRole, getUser,
    hasRole, hasMinRole, requireAuth, verifyAdminPin
  };

})();
