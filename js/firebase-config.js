// ============================================================
// COLCHOEIRO ERP — Configuração Firebase
// ============================================================
// ✅ PLANO GRATUITO (Spark):
//    - Firebase Authentication  → gratuito
//    - Cloud Firestore          → gratuito (1 GB de dados)
//    - Firebase Storage         → REMOVIDO (evita cobrança)
// ============================================================

const firebaseConfig = {
  apiKey: "COLE_AQUI_SUA_API_KEY",
  authDomain: "SEU-PROJETO.firebaseapp.com",
  projectId: "SEU-PROJETO",
  storageBucket: "SEU-PROJETO.firebasestorage.app",
  messagingSenderId: "COLE_AQUI",
  appId: "COLE_AQUI"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);

// Instâncias globais
const db   = firebase.firestore();
const auth = firebase.auth();

// Configurações de cache offline
db.enablePersistence({ synchronizeTabs: true })
  .catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn('Persistência: múltiplas abas abertas.');
    } else if (err.code === 'unimplemented') {
      console.warn('Persistência não suportada neste browser.');
    }
  });
