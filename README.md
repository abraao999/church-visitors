# Church Visitors

Sistema web para registro de visitantes (famílias) e pedidos de oração em igrejas.

## Funcionalidades

- **Portaria**: cadastro de famílias visitantes (nomes e origem)
- **Pedidos de oração**: registro pelo porteiro ou pelo link público da live
- **Painel**: visualização em tempo real dos visitantes e pedidos do dia

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

# Configurar banco
cp server/.env.example server/.env
# Edite MONGODB_URI em server/.env com a connection string do Atlas
```

## Executar

```bash
# Desenvolvimento (API + frontend)
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001
- Link público da live: http://localhost:5173/live/oracao

## Estrutura

```
church-visitors/
├── client/   # React + Vite + TypeScript
└── server/   # Node + Express + MongoDB
```
