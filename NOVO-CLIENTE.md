# 🚀 Checklist — Implantar o sistema para um novo cliente

Tempo estimado: 15–20 minutos. **Um projeto Firebase por cliente** (nunca compartilhe).

1. **Firebase**: console.firebase.google.com → Adicionar projeto (plano Spark, sem Analytics).
2. **Firestore**: Criar banco de dados (modo produção) → aba Regras → cole `firestore.rules` → Publicar.
3. **Authentication → Sign-in method → Anônimo → Ativar** (obrigatório).
4. **Chaves**: Configurações do projeto → Seus apps → app Web (`</>`) → copie o `firebaseConfig` e cole em `js/firebase-config.js`.
5. **Hospedagem**: suba a pasta para um repositório novo no GitHub (ativar Pages) ou Vercel (framework "Other"). Em Authentication → Configurações → Domínios autorizados, adicione o domínio publicado.
6. **Primeiro acesso**: abra o site e digite o PIN **1234** (cria o admin automaticamente). Vá em *Meu Perfil* e troque o PIN imediatamente.
7. **Configurações** (como admin): nome da loja, logo, meta mensal, formas de pagamento, observações sugeridas.
8. **Cloudinary (opcional, fotos)**: crie uma conta do cliente → Settings → Upload → Add upload preset (Signing mode: **Unsigned**) → informe Cloud Name e Preset em Configurações.
9. **Equipe e lojas**: Configurações → Usuários (criar vendedores/entregadores com PINs únicos); Estoque → criar lojas e atribuir vendedores.
10. **Teste rápido**: cadastrar produto, fazer venda, imprimir resumo, testar login de vendedor e entregador.

> O ID da empresa é fixo (`empresa-001`) por projeto — não precisa alterar, pois cada cliente tem seu próprio Firebase.
