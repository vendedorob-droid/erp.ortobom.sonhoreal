# 🛏️ Colchoeiro ERP — Sistema de Gestão para Colchoarias

Sistema de gestão completo em HTML puro + Firebase + GitHub Pages/Vercel.
**100% gratuito** usando o plano Spark do Firebase (sem Firebase Storage).

O acesso ao sistema é feito por **PIN de 4 dígitos** (sem e-mail/senha), pensado para
lojas onde vários funcionários usam o mesmo tablet/computador e só trocam de perfil
rapidamente digitando o PIN.

---

## ⚠️ Passo mais importante (é aqui que o login trava se você pular)

Este app usa **Autenticação Anônima** do Firebase para poder conversar com o Firestore
antes mesmo de você digitar o PIN. Se esse provedor não estiver ativado, a tela de PIN
nunca vai funcionar — vai travar ou dar erro de permissão.

1. Acesse **console.firebase.google.com** → seu projeto
2. **Authentication → Sign-in method**
3. Ative o provedor **"Anônimo" (Anonymous)**
4. Pronto — sem isso, nada mais neste guia funciona.

---

## 💰 Por que é gratuito?

| Serviço | Plano Spark (Gratuito) | Utilizado |
|---------|------------------------|-----------|
| Firebase Authentication (Anônimo) | Ilimitado | ✅ Sim |
| Cloud Firestore | 1 GB de dados, 50k leituras/dia | ✅ Sim |
| Firebase Storage | **Cobrado** | ❌ Removido |
| GitHub Pages / Vercel | Ilimitado | ✅ Sim |

Fotos de produto e logo da empresa são referenciadas por **URL externa** (Google Drive,
Imgur, ImgBB), não por upload — assim o Firebase Storage nunca precisa ser ativado.

---

## 📁 Estrutura de arquivos

```
colchoeiro/
├── index.html              ← Tela de acesso por PIN
├── dashboard.html          ← App principal (carrega todos os módulos)
├── firestore.rules         ← Regras de segurança do banco de dados
├── css/
│   └── main.css
├── js/
│   ├── firebase-config.js  ← Configuração do Firebase (sem Storage)
│   ├── auth.js             ← Login anônimo + seleção de perfil por PIN
│   └── ui.js                ← Utilitários de interface
└── modules/
    ├── dashboard.js
    ├── scanner.js           ← Leitor de código de barras + vendas
    ├── products.js
    ├── brands.js
    ├── customers.js
    ├── quotes.js
    ├── sales.js              ← Vendas + Financeiro + Configurações (mesmo arquivo)
    ├── deliveries.js
    ├── users_admin.js        ← Gestão de equipe (criar/editar PINs)
    ├── commissions.js
    └── profile.js
```

> `Financial` e `Settings` estão definidos **dentro** de `modules/sales.js` — não são
> arquivos separados. Não crie `financial.js` nem `settings.js`, eles não são usados.

---

## 🚀 Como publicar (GitHub Pages ou Vercel)

Suba a pasta inteira como está. Não há build, é HTML/JS puro. No Vercel, basta conectar
o repositório sem nenhuma configuração especial (framework: "Other").

---

## 🔥 Configurar o Firebase (nesta ordem)

### 1. Ativar Autenticação Anônima
Ver seção "Passo mais importante" no topo deste arquivo.

### 2. Aplicar as regras de segurança do Firestore
1. **Firestore Database → Regras**
2. Cole o conteúdo de `firestore.rules`
3. **Publicar**

> ⚠️ Essas regras liberam leitura/escrita para qualquer sessão autenticada
> (inclusive anônima). Isso é aceitável **desde que você use um projeto Firebase
> separado para cada cliente/loja que comprar o sistema** — veja a seção
> "Segurança e revenda" mais abaixo, é importante.

### 3. Criar o primeiro acesso (Admin)
Não é preciso criar nada manualmente no Firebase! Basta abrir o site e, na tela de PIN,
digitar **1234**. Como ainda não existe nenhum perfil cadastrado, o sistema cria
automaticamente o perfil de Administrador com esse PIN.

**Troque esse PIN padrão assim que possível** em Meu Perfil → Alterar meu PIN.

### 4. Criar o documento da empresa
1. No Firestore, **Iniciar coleção** → `companies`
2. ID do documento: `empresa-001`
3. Dentro dele, crie a subcoleção `settings` → documento `general` com o campo
   `fantasyName` (string) = nome da loja.

### 5. Atualizar as chaves do Firebase no projeto
Abra `js/firebase-config.js` e troque os valores de `firebaseConfig` pelos do **seu**
projeto (Firebase Console → Configurações do projeto → Seus apps → SDK).

---

## 👥 Adicionando vendedores, gerentes e entregadores

Não é mais preciso mexer no Firebase Console para isso. Logado como admin:

**Configurações → Usuários (Gestão de Equipe) → + Novo Perfil**

Preencha nome, cargo e um PIN de 4 dígitos exclusivo para a pessoa. Pronto — ela já
pode entrar na tela inicial digitando esse PIN.

---

## 👥 Perfis de acesso

| Perfil | Acesso |
|--------|--------|
| **admin** | Tudo, incluindo configurações, equipe e exclusão |
| **gerente** | Dashboard geral, produtos, clientes, orçamentos, vendas, comissões |
| **vendedor** | Seu dashboard, scanner, clientes, seus orçamentos |
| **financeiro** | Dashboard, vendas, financeiro |
| **entregador** | Suas entregas pendentes |

---

## 🔐 Segurança e revenda — leia antes de vender para clientes

As regras atuais do Firestore liberam leitura/escrita para **qualquer sessão anônima**,
não apenas para quem digitou o PIN certo. Isso é uma limitação inerente ao modelo de PIN
sem backend: o Firestore não tem como validar sozinho "esse visitante realmente digitou
o PIN de admin", porque o PIN é conferido no navegador, não no servidor.

**Na prática, isso significa:** qualquer pessoa que abra o site (mesmo sem PIN) e use o
console do navegador consegue ler/gravar dados no mesmo projeto Firebase.

Recomendação para vender com segurança básica:
- **Crie um projeto Firebase novo e separado para cada cliente/loja.** Nunca reaproveite
  o mesmo projeto para duas lojas diferentes — assim, mesmo no pior caso, os dados de um
  cliente ficam isolados dos de outro.
- Isso é suficiente para uma venda "básica" (uma loja, um projeto). Se algum cliente
  pedir controle de acesso mais forte (ex: múltiplas filiais no mesmo banco, com
  isolamento real entre elas), isso exige autenticação de verdade (custom claims via
  Cloud Function validando o PIN no servidor) — uma etapa mais avançada, não incluída
  nesta versão básica.

---

## 🖼️ Fotos de produtos (sem Storage)

1. Hospede a imagem em um serviço gratuito (Google Drive com link público, Imgur, ImgBB)
2. Cole a URL direta no campo "URL da foto do produto"

---

## 📊 Módulos implementados

- ✅ Login por PIN com criação automática do primeiro admin
- ✅ Dashboard Admin / Vendedor / Entregador (números grandes e proporcionais em qualquer tela)
- ✅ Venda com busca manual de produto por nome/marca/código (sem leitor de câmera)
- ✅ Produtos, Marcas, Clientes (CRM)
- ✅ Estoque multi-loja: cadastro de lojas, vendedor responsável por loja, estoque por loja, transferência entre lojas, histórico de entradas/transferências/estornos, aba de estoque crítico e relatório de estoque imprimível/PDF
- ✅ Orçamentos com conversão em venda
- ✅ Vendas, cancelamento com devolução automática de estoque (exige PIN de admin) e edição financeira protegidos por PIN de admin
- ✅ Recibo de compra impresso/PDF ao fechar a venda, com reimpressão a qualquer momento
- ✅ Relatório de vendas por período/produto/cliente, imprimível/PDF
- ✅ Comissões com ranking por vendedor
- ✅ Gestão de Equipe (criar/editar/desativar PINs pelo próprio sistema)
- ✅ Configurações da empresa + "zerar sistema" antes de entregar a um novo cliente
- ✅ Controle de acesso por cargo (admin/gerente/vendedor/financeiro/entregador)
- ✅ Responsivo (desktop como uso principal, além de tablet e celular)
- ✅ 100% gratuito no plano Spark do Firebase (dentro de 1 projeto por cliente)
