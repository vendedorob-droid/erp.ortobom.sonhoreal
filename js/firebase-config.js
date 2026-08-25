// ============================================================
// COLCHOEIRO ERP — Configuração Firebase
// ============================================================
// ✅ PLANO GRATUITO (Spark):
//    - Firebase Authentication  → gratuito
//    - Cloud Firestore          → gratuito (1 GB de dados)
//    - Firebase Storage         → REMOVIDO (evita cobrança)
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDbB66cIkRXb04Fs4vS4dF1qexzhws4qy4",
  authDomain: "meucolchoeiro.firebaseapp.com",
  projectId: "meucolchoeiro",
  storageBucket: "meucolchoeiro.firebasestorage.app",
  messagingSenderId: "647580491363",
  appId: "1:647580491363:web:20c34ad9b982faf0472256"
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
