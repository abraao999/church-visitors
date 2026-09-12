# Church Visitors

Sistema web para registro de visitantes (famílias) e pedidos de oração em igrejas.

## Funcionalidades

- **Autenticação**: conta com usuário/e-mail e senha
- **Portaria**: cadastro de visitantes (nome, parentesco e cidade)
- **Pedidos de oração**: registro privado pela equipe da igreja
- **Avisos de veículos**: formulário público por QR Code e painel administrativo
- **Calendário de cultos**: agenda mensal com louvores por culto
- **Painéis**: visualização em tela cheia de louvores, visitantes e pedidos de oração
- **Identidade visual**: logotipo e cores por igreja, em Igreja → Identidade visual
- **Auditoria**: nome do usuário fica nos registros que ele adiciona

> As rotas de dados atuais exigem login e são isoladas pela igreja da sessão. O endereço legado
> `/live/oracao` exibe apenas um aviso e não aceita mais envios globais.

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
# - JWT_SECRET (obrigatório; não use o valor de exemplo)
# - GUEST_ACCESS_SECRET (chave diferente do JWT_SECRET; não use o valor de exemplo)
# - CRON_SECRET (protege a rotina diária; não use o valor de exemplo)
# - EMAIL_TOKEN_SECRET (chave diferente das outras três; não use o valor de exemplo)
# - PLATFORM_ADMIN_JWT_SECRET (chave do painel /admin; diferente das outras)
# - APP_ORIGIN=https://app.eclesiafy.com.br
# - RESEND_API_KEY (envio de confirmação, cadastro concluído e redefinição de senha)
# - BLOB_READ_WRITE_TOKEN (Vercel Blob, necessário para o logotipo da igreja)
```

## Isolamento por igreja

Os modelos privados exigem `churchId`. A sessão da equipe define a igreja; o cliente nunca
autoriza o identificador. `npm run tenancy:check` só diagnostica documentos antigos sem igreja
— não altere dados em produção sem backup.

Antes de qualquer migração:

1. Faça um backup completo do banco.
2. Execute apenas o diagnóstico e revise as quantidades apresentadas:

```bash
npm run tenancy:check
```

3. Simule a migração. A simulação não altera documentos:

```bash
npm run tenancy:migrate -- --dry-run --church-name "Igreja Esperança"
```

O script só permite associação automática quando existe exatamente um proprietário e, no máximo,
uma igreja identificável. Em cenários ambíguos ele interrompe sem alterar dados. Para aplicar após
backup e revisão manual, substitua `--dry-run` por `--apply`. Também é possível informar uma igreja
existente com `--church-id`, mas o identificador nunca é usado como autorização em requisições do
aplicativo.

Não execute a migração automaticamente durante deploys. Em caso de rollback, restaure o backup
feito imediatamente antes da aplicação e volte à versão anterior do código.

## Núcleo dos acessos convidados

O backend autoriza uma lista de permissões no mesmo token (`types`): `visitors:create`,
`prayers:create`, `vehicle_notices:create` e/ou `panels:read`. Não é permitido misturar
escopo de painel de TV com formulário no mesmo acesso.
O token público contém somente um `publicId` aleatório e uma assinatura HMAC; o identificador da
igreja permanece no banco. A assinatura também considera a versão do acesso, permitindo invalidar
um link antigo sem armazenar o token completo.

Endpoints públicos disponíveis para a interface por QR Code:

- `GET /api/public-access/:token`: retorna somente nome da igreja, nome e permissões do acesso.
- `POST /api/public-access/:token/visitors`: cadastra até 10 visitantes quando autorizado.
- `POST /api/public-access/:token/prayer-requests`: envia oração quando autorizado.
- `POST /api/public-access/:token/vehicle-notices`: registra aviso de veículo quando autorizado.

Esses endpoints não listam registros, rejeitam a identidade da igreja enviada pelo navegador e
possuem limite persistido de requisições por IP e por acesso. A criação e administração dos links
ficam na tela autenticada `/acessos`. O painel `/avisos-veiculos` lista e atualiza status somente
dos avisos da igreja da sessão.

### Gerenciamento pelo proprietário

A rota autenticada `/acessos` permite criar, copiar, baixar o QR Code, alterar validade, desativar,
reativar e renovar acessos. A renovação incrementa a versão e invalida o endereço anterior. Todos
os comandos administrativos pesquisam simultaneamente o identificador do acesso e a igreja da
sessão.

Os QR Codes são gerados no navegador com a origem atual do aplicativo, sem domínio ou `localhost`
fixado no código. Nenhum acesso é criado automaticamente: o proprietário precisa usar uma ação
explícita na página inicial ou na página de gerenciamento.

### Formulários públicos

O endereço `/acesso/:token` valida o token antes de mostrar qualquer formulário. Um acesso pode
reunir visitantes, oração e avisos no mesmo QR; as opções que o token não autoriza ficam ocultas.
Essas páginas não possuem menu administrativo, login, indicadores ou listagens.

Depois do envio, a página confirma o recebimento sem devolver os registros privados. A URL antiga
`/live/oracao` permanece apenas como uma orientação amigável para solicitar um novo QR Code.

## MongoDB local com Docker

No desenvolvimento o banco sobe no seu computador, sem usar o Atlas.

```bash
# Sobe o Mongo na porta 27017 (os dados ficam num volume do Docker)
npm run db:up
```

Em `server/.env`, use:

```
MONGODB_URI=mongodb://127.0.0.1:27017/church-visitors
```

Comandos úteis:

```bash
npm run db:up      # inicia o container
npm run db:logs    # acompanha o log
npm run db:down    # para o container (os dados permanecem)
docker compose down -v   # apaga o container e o volume local
```

O Docker Desktop precisa estar aberto. A imagem é `mongo:8.0.4` de propósito: as tags `mongo:8` mais novas recusam o kernel do Docker Desktop atual.

## Executar

```bash
# Desenvolvimento (API + frontend)
npm run db:up
npm run dev
```

- Frontend: http://localhost:5173
- Login: http://localhost:5173/login
- API: http://localhost:3002
- Aviso do link público legado: http://localhost:5173/live/oracao

## Deploy na Vercel

O frontend (Vite) e a API (Express serverless) sobem no mesmo projeto.

### 1. Preparar MongoDB Atlas

Em **Network Access**, libere `0.0.0.0/0` (a Vercel usa IPs dinâmicos).

### 2. Importar o repositório

1. Acesse [vercel.com](https://vercel.com) → **Add New Project**
2. Importe `church-visitors`
3. Deixe o Root Directory como `.` (raiz)
4. A Vercel usa o `vercel.json` do repositório

### 3. Variáveis de ambiente (Project → Settings → Environment Variables)

| Nome | Onde | Exemplo |
|------|------|---------|
| `MONGODB_URI` | Server | connection string do Atlas |
| `JWT_SECRET` | Server | chave longa e aleatória (`openssl rand -hex 32`; não copie o exemplo) |
| `GUEST_ACCESS_SECRET` | Server | outra chave longa e aleatória, diferente do JWT |
| `CRON_SECRET` | Server | chave aleatória para proteger a limpeza automática diária |
| `EMAIL_TOKEN_SECRET` | Server | outra chave longa e aleatória, diferente de JWT, GUEST e CRON |
| `PLATFORM_ADMIN_JWT_SECRET` | Server | chave do painel `/admin`, diferente de JWT, GUEST e EMAIL |
| `APP_ORIGIN` | Server | `https://app.eclesiafy.com.br` — origem usada nos links de e-mail |
| `RESEND_API_KEY` | Server | chave do Resend (nunca use prefixo `VITE_`) |
| `EMAIL_FROM` | Server | `Eclesiafy <acesso@notificacoes.eclesiafy.com.br>` |
| `EMAIL_REPLY_TO` | Server | opcional |
| `EMAIL_VERIFICATION_TTL_MINUTES` | Server | `30` |
| `PASSWORD_RESET_TTL_MINUTES` | Server | `30` |
| `EMAIL_RESEND_INTERVAL_SECONDS` | Server | `60` |
| `EMAIL_CODE_MAX_ATTEMPTS` | Server | `5` |
| `BLOB_READ_WRITE_TOKEN` | Server | token do Vercel Blob para o logotipo da igreja |

O cadastro de proprietário só cria a igreja depois da confirmação do e-mail. Depois da confirmação, o sistema envia um e-mail de cadastro concluído. A redefinição de senha usa o mesmo remetente. Em produção, `APP_ORIGIN` precisa ser `https://app.eclesiafy.com.br` — nunca localhost nem `*.vercel.app`. Mantenha o rastreamento de abertura e de cliques desligado no domínio do Resend.

### 4. Deploy

Clique em **Deploy**. Depois:

- App: `https://SEU-PROJETO.vercel.app`
- Login: `https://SEU-PROJETO.vercel.app/login`
- Link público legado (somente aviso): `https://SEU-PROJETO.vercel.app/live/oracao`
- Health: `https://SEU-PROJETO.vercel.app/api/health`

## Retenção automática de dados

A política é configurada pelo proprietário em **Igreja → Retenção e exclusão de dados** e nasce desativada para cada igreja. A tela mostra uma prévia antes da ativação e permite definir prazos separados para visitantes, pedidos de oração, avisos de veículos, acessos sem login, convites e dispositivos da portaria.

- Visitantes antigos são anonimizados, preservando apenas os totais históricos por culto.
- As demais categorias vencidas são excluídas conforme o prazo configurado.
- Todas as consultas são isoladas por `churchId`; uma igreja nunca processa dados de outra.
- A execução automática ocorre diariamente pelo cron definido em `vercel.json` e exige `CRON_SECRET`.
- O histórico guarda somente datas, resultado e contagens, sem copiar dados pessoais.

Backups do MongoDB Atlas ou da plataforma de hospedagem seguem a retenção configurada nesses próprios serviços e não são apagados por esta rotina.

## Integração com Holyrics

No início do culto, o operador pode enviar os louvores cadastrados para a playlist do Holyrics.

### Configurar no Holyrics (PC da igreja)

1. Abra o Holyrics → **Arquivo → Configurações → API Server**
2. Ative o servidor da API e anote **IP** e **porta**
3. Em **Gerenciar permissões**, crie um token com acesso a busca de músicas e playlist
4. As músicas precisam **já existir** na biblioteca do Holyrics (o app só busca e adiciona à playlist)

### Configurar neste app

1. Faça login → link **Holyrics** no canto superior (ou `/configuracoes`)
2. Modo **Local**: IP (`127.0.0.1` no mesmo PC), porta e token
3. Clique em **Testar conexão** e salve
4. Em **Cultos**, abra o culto do dia → **Enviar ao Holyrics**

### Observações

- No modo local, o Holyrics precisa estar aberto no PC da igreja
- Se o app estiver na Vercel, o sync pelo servidor não alcança a rede local; o app tenta enviar **pelo navegador** do PC que tem o Holyrics
- Modo **Internet** usa a API pública do Holyrics (`api.holyrics.com.br`) com API Key + token

## Identidade visual por igreja

Cada igreja configura logotipo e cores em **Igreja → Identidade visual**. A personalização vale só para as páginas daquela igreja. Login, cadastro e ícones do PWA permanecem com a marca geral do sistema.

O logotipo é gravado no [Vercel Blob](https://vercel.com/docs/storage/vercel-blob), não no MongoDB nem no disco do servidor. Em produção:

1. No projeto da Vercel, abra **Storage → Create Database → Blob**
2. Conecte o store ao projeto (isso cria `BLOB_READ_WRITE_TOKEN`)
3. Faça um novo deploy depois de conectar o store

Formatos aceitos: PNG, JPEG e WebP, até 2 MB. SVG é recusado.

## Painel administrativo da plataforma

A área `/admin` é independente do painel de cada igreja. A sessão usa o cookie
`eclesiafy_admin_session` e o segredo `PLATFORM_ADMIN_JWT_SECRET`. Não existe
cadastro público de administrador.

Para criar o primeiro `platform_owner` no computador (nunca no build nem no deploy):

```bash
# em server/.env, configure PLATFORM_ADMIN_JWT_SECRET (openssl rand -hex 32)
npm run db:up
npm run platform-admin:create
```

O comando pede nome, e-mail e senha (a senha não aparece no terminal) e recusa
e-mails duplicados.

## Estrutura

```
church-visitors/
├── api/      # Entry point serverless (Vercel)
├── client/   # React + Vite + TypeScript
├── server/   # Express + MongoDB
└── vercel.json
```
