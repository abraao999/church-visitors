# Church Visitors

Sistema web para registro de visitantes (famílias) e pedidos de oração em igrejas.

## Funcionalidades

- **Autenticação**: conta com usuário/senha ou Google (Gmail)
- **Portaria**: cadastro de visitantes (nome, parentesco e cidade)
- **Pedidos de oração**: registro pelo porteiro (autenticado) ou pelo link público da live
- **Calendário de cultos**: agenda mensal com louvores por culto
- **Painéis**: visualização em tela cheia de louvores, visitantes e pedidos de oração
- **Auditoria**: nome do usuário fica nos registros que ele adiciona

> Apenas `/live/oracao` é público. O restante do app exige login.

## Requisitos

- Node.js 18+
- Conta no [MongoDB Atlas](https://www.mongodb.com/atlas) (plano gratuito)

## Configuração

### 1. MongoDB Atlas

1. Acesse [cloud.mongodb.com](https://cloud.mongodb.com) e crie um cluster (M0 Free).
2. **Database Access** → crie um usuário com senha (anote usuário e senha).
3. **Network Access** → **Add IP Address** → use seu IP ou `0.0.0.0/0` só para desenvolvimento.
4. No cluster, clique em **Connect** → **Drivers** → copie a connection string.
5. Substitua `<password>` pela senha do usuário e `<dbname>` por `church-visitors`.

Exemplo:

```
mongodb+srv://meuusuario:minhasenha@cluster0.xxxxx.mongodb.net/church-visitors?retryWrites=true&w=majority&appName=church-visitors
```

> Se a senha tiver caracteres especiais (`@`, `#`, `%`, etc.), use a versão codificada na URL (ex.: `@` → `%40`).

**Erro `querySrv ECONNREFUSED`?** Seu DNS local pode bloquear conexões SRV. Soluções:
- No Atlas, use **Standard connection string** (não SRV) em `MONGODB_URI`
- Ou altere o DNS do Windows para `8.8.8.8` e `1.1.1.1`

### 2. Projeto

```bash
# Instalar dependências
npm install
npm install --prefix server
npm install --prefix client

# Configurar banco e autenticação
cp server/.env.example server/.env
# Edite em server/.env:
# - MONGODB_URI
# - JWT_SECRET
# - GOOGLE_CLIENT_ID (opcional, para login com Google)

# Frontend (Google Sign-In)
echo 'VITE_GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com' > client/.env
```

### 3. Google Sign-In (opcional)

1. Em [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um **OAuth Client ID** do tipo **Aplicativo da Web**.
2. Em **Origens JavaScript autorizadas**, adicione `http://localhost:5173`.
3. Use o mesmo Client ID em `GOOGLE_CLIENT_ID` (server) e `VITE_GOOGLE_CLIENT_ID` (client).

Sem Google configurado, ainda é possível criar conta com usuário e senha.

## Executar

```bash
# Desenvolvimento (API + frontend)
npm run dev
```

- Frontend: http://localhost:5173
- Login: http://localhost:5173/login
- API: http://localhost:3001
- Link público da live: http://localhost:5173/live/oracao

## Estrutura

```
church-visitors/
├── client/   # React + Vite + TypeScript
└── server/   # Node + Express + MongoDB
```
