# Guia de publicação do Hookbop (parte A)

Passo a passo para colocar o Hookbop no ar na fase 1 (só convidados, até 50 pessoas). Quem executa é você, o dono. Vale para as migrações 0001 a 0005: se entrar uma migração nova, releia a seção 2.

Cada passo tem uma caixa para marcar. Onde o painel de um serviço pode ter mudado de nome, está escrito "(o nome pode variar no painel)".

**Regras de ouro**

- Nenhuma chave, senha ou e-mail real entra neste arquivo, no Git ou em prints. Guarde tudo num gerenciador de senhas.
- Este guia usa `<seu-domínio>`, `<ref>` e `<e-mail do dono>` no lugar dos valores reais. Troque só na hora de digitar.
- Uma variável com `NEXT_PUBLIC_` no nome vai para o navegador de todo mundo. Nunca dê esse prefixo a uma chave secreta.

## Ordem de execução

1. Seção 1: decisões e contas.
2. Seções 2, 3 e 5, em qualquer ordem entre si.
3. Seção 6: testes e confirmação do dono.
4. Seção 4: Vercel. É ela que publica de verdade, porque a Vercel faz o primeiro deploy assim que o projeto é importado. Por isso vem depois da 6, mesmo tendo número menor.
5. Seções 7 e 8: conferir no ar e no celular.
6. Seção 9 só se algo der errado.

## 1. Pré-requisitos

Decisões e contas que só você pode tomar. Marque quando estiver pronto.

- [ ] **Projeto no Supabase.** Guarda o login, o banco e as regras de acesso. O plano grátis permite 2 projetos ativos: se você já tem 2, pause um (Project Settings → General → Pause project, o nome pode variar no painel) ou assine o plano Pro.
- [ ] **Cliente OAuth no Google Cloud.** É o que faz o botão "Entrar com Google" funcionar. A seção 3.6 mostra como criar.
- [ ] **Chave de API da Anthropic.** "Não entendi" e a tradução (da música inteira, pedida quando a música abre, e de um verso) chamam a IA pelo servidor. Sem a chave o jogo abre, mas a ajuda de IA falha.
- [ ] **Domínio registrado.** É o endereço do app. Escolha agora e não troque depois: trocar de domínio quebra os links já enviados e obriga todo mundo a reinstalar o app.
- [ ] **Conta na Vercel.** Hospeda o app. O plano grátis serve para a fase 1; confira os termos dele antes de ligar anúncios ou cobrança.
- [ ] **Provedor de SMTP para e-mail** (por exemplo Resend ou Brevo). O e-mail com o link e o código de entrada precisa chegar na caixa de qualquer amigo; a seção 3.5 explica por que o envio padrão do Supabase não serve.
- [ ] **Repositório na nuvem** (por exemplo GitHub), porque a Vercel importa o código de lá. Se o código só existe no seu computador: crie o repositório vazio no GitHub, depois `git remote add origin <url-do-repositório>` e `git push -u origin <branch>`.

## 2. Supabase hospedado

### 2.1 Ligar a CLI ao projeto

```
npx supabase login
npx supabase link --project-ref <ref>
```

- [ ] `<ref>` é o "Reference ID" do projeto: Project Settings → General (o nome pode variar no painel). Ele também aparece na URL do painel.
- [ ] A CLI pede a senha do banco, a que você definiu ao criar o projeto. Digite só no terminal. Se perdeu: Project Settings → Database → Reset database password (o nome pode variar no painel).

### 2.2 Aplicar as migrações

```
npx supabase db push --dry-run
npx supabase db push
```

- [ ] O `--dry-run` só lista o que seria aplicado. Confira que aparecem de 0001 a 0005.
- [ ] `npx supabase db push` aplica as cinco migrações no projeto hospedado.
- [ ] `npx supabase migration list` deve mostrar 0001 a 0005 nas colunas Local e Remote.

**Isto precisa acontecer antes de o código novo entrar no ar.** Sem a 0002 (`reserve_help_request`, o limite por hora da ajuda de IA), toda ajuda de IA que não estiver guardada no cache falha.

Não rode `npx supabase config push`: ele mandaria para o projeto hospedado o `site_url` local e os limites de teste do `config.toml`. As configurações de login deste guia são feitas no painel (seção 3).

### 2.3 Definir o e-mail do dono

O `db push` aplica só as migrações e, por padrão, não roda o `seed.sql`. Não use `--include-seed`: o arquivo traz um e-mail de mentira (`owner@example.com`) e **não deve ser editado com o seu e-mail real**, porque ele vai para o Git.

- [ ] No painel do Supabase abra SQL Editor → New query, cole e rode (troque o e-mail só na tela, nunca no arquivo):

```sql
insert into public.app_config (key, value)
values ('owner_email', '<e-mail do dono>')
on conflict (key) do update set value = excluded.value;
```

- O e-mail precisa ser o mesmo com que você vai entrar (a conta Google ou o endereço que você digita no login por e-mail). Maiúsculas e minúsculas não importam.
- O primeiro login com esse e-mail já confirmado vira o perfil de dono. Se você entrar antes de rodar o SQL, rode agora e entre de novo.

### 2.4 Limite de membros (opcional)

Sem esta linha o limite é 50. Rode só se quiser outro número (precisa ser inteiro, escrito entre aspas):

```sql
insert into public.app_config (key, value)
values ('member_cap', '50')
on conflict (key) do update set value = excluded.value;
```

### 2.5 Conferir

- [ ] No SQL Editor, `select key, value from public.app_config;` mostra `owner_email` e, se você rodou o passo 2.4, `member_cap`.

## 3. Login (Auth) no painel do Supabase

O `db push` não leva as configurações de login do `config.toml`. Tudo abaixo é feito no painel, em Authentication.

### 3.1 "Confirm email" ligado

- [ ] Authentication → Sign In / Providers → Email → **Confirm email** ligado (o nome pode variar no painel).

Por quê: o app trata o e-mail de quem entrou como prova de que é o dono. Com a confirmação desligada, qualquer pessoa poderia se cadastrar com o e-mail do dono e virar dona do app. A checagem extra do banco (migração 0004) olha se o e-mail foi confirmado, mas só protege de verdade com esta opção ligada.

### 3.2 Site URL e URLs de retorno

- [ ] Authentication → URL Configuration → **Site URL**: `https://<seu-domínio>`
- [ ] Na lista **Redirect URLs**, adicione as duas:
  - `https://<seu-domínio>/auth/callback`
  - `http://localhost:3000/auth/callback` (para testar o app local contra este projeto)

Se o Site URL ficar com o endereço local, os links dos e-mails levam para o localhost.

### 3.3 Modelos de e-mail

- [ ] Authentication → Emails → Templates (o nome pode variar no painel).
- [ ] Abra `supabase/templates/magic_link.html` no repositório, copie todo o conteúdo e cole nos **dois** modelos: **Magic Link** e **Confirm signup**.
- [ ] Em Subject (assunto) dos dois, escreva `Seu acesso ao Hookbop`, o mesmo do `config.toml`.

Por quê os dois: o primeiro acesso de um e-mail novo usa o modelo "Confirm signup"; os seguintes usam "Magic Link". O código de 6 dígitos precisa estar nos dois.

### 3.4 Tamanho e validade do código

- [ ] Authentication → Sign In / Providers → Email → **Email OTP Length: 6** (o nome pode variar no painel).
- [ ] **Email OTP Expiration: 3600** segundos, como diz o texto do e-mail ("1 hora").

Por quê o 6: o app instalado na tela inicial do iPhone não consegue usar o link do e-mail (o link abre no Safari, que não enxerga a sessão do app). Ele entra digitando o código, e a tela só aceita 6 dígitos.

### 3.5 SMTP personalizado

- [ ] No provedor de e-mail (Resend, Brevo ou outro), crie a conta, **verifique o domínio** (ele mostra registros DNS para criar no seu registrador) e gere as credenciais de SMTP.
- [ ] Authentication → Emails → SMTP Settings → ligue **Enable custom SMTP** (o nome pode variar no painel) e preencha remetente (por exemplo `no-reply@<seu-domínio>`), nome do remetente (`Hookbop`), servidor, porta, usuário e senha. Servidor, porta e usuário estão na página do provedor.
- [ ] Confira o limite de e-mails por hora em Authentication → Rate Limits (o nome pode variar no painel), pensando no dia em que vários amigos entrarem juntos.
- [ ] Teste: peça um código para um e-mail que **não** seja o seu nem o da equipe do projeto, de preferência o de um amigo, e veja se chega (olhe o spam).

Por quê: o envio embutido do Supabase é só para teste, tem um limite por hora muito baixo e pode entregar apenas para endereços da equipe do projeto. Sem SMTP próprio, os amigos nunca receberiam o código.

### 3.6 Entrar com Google

No Google Cloud (os nomes dos menus podem variar no painel):

- [ ] Crie ou escolha um projeto. Em APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth, tipo **Aplicativo da Web**.
- [ ] Em **URIs de redirecionamento autorizados**, cole o endereço de retorno que o próprio Supabase mostra no painel do Google (Authentication → Sign In / Providers → Google, campo "Callback URL"). Tem a forma `https://<ref>.supabase.co/auth/v1/callback`.
- [ ] Copie o **ID do cliente** e o **segredo do cliente**.

No Supabase:

- [ ] Authentication → Sign In / Providers → Google: ligue, cole o ID e o segredo e salve.

De volta ao Google Cloud, **publique a tela de consentimento OAuth**:

- [ ] Tela de consentimento OAuth, ou Google Auth Platform → Público (o nome pode variar no painel): tipo de usuário **Externo**, nome do app `Hookbop`, e-mail de suporte `<e-mail do dono>`, escopos básicos (e-mail, perfil, openid).
- [ ] Clique em **Publicar app**, até o status passar de "Testando" para "Em produção".

Por quê: no modo "Testando", só entram os e-mails cadastrados como usuários de teste. Todos os outros amigos veriam "acesso bloqueado". Com apenas os escopos básicos, o Google não costuma pedir verificação do app.

## 4. Vercel

> **Pare aqui até a seção 6 estar concluída.** Importar o projeto na Vercel já faz o primeiro deploy, e esse deploy é a publicação. Só continue depois da confirmação do dono (6.3) e com as migrações já aplicadas (2.2).

### 4.1 Importar o repositório

- [ ] Vercel → Add New → Project → escolha o repositório do Hookbop. O framework (Next.js) é detectado sozinho.
- [ ] Confira a branch de produção em Settings → Git → Production Branch (o nome pode variar no painel). Só ela vai para o domínio; as outras viram deploys de teste.

### 4.2 Variáveis de ambiente

Preencha na própria tela de importação, em Environment Variables, **antes** de clicar em Deploy, marcando Production. Se esquecer alguma, ajuste em Settings → Environment Variables e faça um novo deploy.

| Variável | Valor | Visibilidade |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto (Project Settings → API) | público |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave pública do projeto, a "anon" ou "publishable" (Project Settings → API; o nome pode variar no painel) | público |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secreta do projeto, a "service_role" ou "secret" (mesma tela) | **só no servidor** |
| `ANTHROPIC_API_KEY` | chave da Anthropic | **só no servidor** |
| `NEXT_PUBLIC_APP_URL` | `https://<seu-domínio>`, sem barra no final | público |
| `NEXT_PUBLIC_APP_PHASE` | `closed_beta` | público |

- [ ] As seis variáveis estão preenchidas.
- [ ] As duas "só no servidor" estão marcadas como Sensitive, se o painel oferecer essa opção.

Avisos:

- **Nunca** coloque `NEXT_PUBLIC_` na frente de `SUPABASE_SERVICE_ROLE_KEY` nem de `ANTHROPIC_API_KEY`. A chave de serviço ignora todas as regras de acesso do banco.
- Toda variável `NEXT_PUBLIC_` é gravada no app na hora do build. Mudar o valor depois só vale com um novo deploy (Deployments → menu do deploy → Redeploy).
- `NEXT_PUBLIC_APP_PHASE` só liga os extras com anúncio se for exatamente `public`. Na fase 1 fica `closed_beta`.

### 4.3 Publicar

- [ ] Clique em **Deploy** e espere terminar. Se o build falhar, abra o deploy e leia o Build Logs.

### 4.4 Domínio e HTTPS

- [ ] Settings → Domains → Add: `<seu-domínio>`.
- [ ] A Vercel mostra os registros DNS (um A para o domínio raiz e/ou um CNAME para o `www`). Crie no site onde você registrou o domínio.
- [ ] Espere a Vercel marcar o domínio como válido. O certificado HTTPS é emitido sozinho.
- [ ] Confira que o endereço que você pôs no Supabase (3.2), no Google (3.6) e em `NEXT_PUBLIC_APP_URL` é exatamente este (com ou sem `www`, sempre `https://`).

O app precisa de HTTPS: o service worker e a instalação na tela inicial só funcionam nele, o cookie do convite é marcado como Secure em produção, e o Google e o Supabase devolvem o login para endereços `https://`.

## 5. Anthropic Console

- [ ] Se ainda não criou a chave: Settings → API Keys (o nome pode variar no painel). Ela só vai para a Vercel, na variável `ANTHROPIC_API_KEY`.
- [ ] Defina um **limite de gasto mensal**: Settings → Limits (o nome pode variar no painel). Escolha um valor que você aceita gastar no pior caso. A estimativa do projeto para a fase 1 é menos de US$ 10 por mês, contando a IA.

Por quê: o app já limita cada pessoa por hora (veja `HELP_BUDGET_PER_HOUR` em `src/lib/help/helpService.ts`), mas o limite do Console é a rede de segurança caso algo escape.

## 6. Antes de publicar

### 6.1 Testes

Precisa do Docker Desktop aberto e do Google Chrome instalado (o Playwright usa o Chrome do computador).

- [ ] Se o Supabase local não estiver rodando: `npx supabase start`.
- [ ] `npx vitest run`
- [ ] `npx supabase test db`
- [ ] `npx playwright test`

Esperado: tudo passa. O Playwright pula 1 teste de propósito (o do modo offline, que precisa do build de produção; as instruções estão no topo de `e2e/offline.spec.ts`).

Atenção: os testes criam usuários de teste com a chave de serviço do `.env.local`. Esse arquivo tem de apontar para o Supabase **local** (`npx supabase status`), nunca para o projeto hospedado.

### 6.2 Conferência final

- [ ] Migrações 0001 a 0005 aplicadas no projeto hospedado (2.2).
- [ ] E-mail do dono definido (2.3).
- [ ] Seção 3 inteira feita, com um código de teste recebido por SMTP próprio.
- [ ] Limite de gasto da Anthropic definido (5).

### 6.3 Portão de publicação

**Peça a confirmação do dono antes de publicar.** Publicar tem efeito fora do computador: o app fica acessível, e-mails reais saem e a API da Anthropic passa a cobrar. Quem estiver ajudando você (pessoa ou assistente) para aqui e espera o "pode publicar".

- [ ] O dono confirmou: pode publicar.

Depois da confirmação, faça a seção 4.

## 7. Depois de publicar: teste rápido

Faça no endereço real, `https://<seu-domínio>`.

- [ ] Abrir o endereço sem sessão leva à tela de entrada, com cadeado de HTTPS.
- [ ] **Entrar pelo Google** com o e-mail do dono: cai na página inicial e aparece o botão "Admin" (prova de que o `owner_email` está certo).
- [ ] **Entrar pelo código do e-mail**, numa janela anônima ou noutro aparelho, com um e-mail que não é o seu: o e-mail chega com o código, e o código de 6 dígitos é aceito. Sem convite, a pessoa cai na mensagem "Pede um convite pra quem te mandou", e isso está certo.
- [ ] Cole um link do YouTube **de uma música que ninguém abriu ainda**, abra a música e, num modo de jogo, ligue **"Tradução"** nas ferramentas e depois toque em **"Não entendi"** num verso. O objetivo é confirmar que a API real aceita os parâmetros que o app manda (modelo, saída estruturada e streaming na tradução da música inteira). A tradução deve aparecer embaixo dos versos e o texto do DJ Bop na explicação.
- [ ] **Instalação:** termine a primeira música e volte à página inicial. No Android aparece "Quer o Hookbop na tela inicial?" com o botão "Instalar". No iPhone aparece a dica "Toque em Compartilhar e depois em Adicionar à Tela de Início".

Se a ajuda de IA falhar, veja a seção 9: os logs do servidor dizem o motivo (por exemplo `The model service answered 400`).

## 8. Roteiro no celular (Android e iPhone)

Faça o roteiro em um Android e em um iPhone, no endereço real. Escreva OK, falhou ou n/a em cada célula, e o que viu em Observações.

No iPhone, instale pelo **Safari** (Compartilhar → Adicionar à Tela de Início) e entre no app instalado pelo **código do e-mail**, não pelo link.

| Aparelho | Modelo e versão do sistema | Data | Quem testou |
|---|---|---|---|
| Android |  |  |  |
| iPhone |  |  |  |

| # | Passo | Android | iPhone | Observações |
|---|---|---|---|---|
| 1 | O dono entra pelo Google. |  |  |  |
| 2 | Cola um link e a letra aparece. |  |  |  |
| 3 | Calibra um clipe que tem introdução. |  |  |  |
| 4 | Joga os 4 modos. |  |  |  |
| 5 | Usa "Não entendi" e liga "Tradução". |  |  |  |
| 6 | Chega na tela de fim. |  |  |  |
| 7 | Instala na tela inicial. |  |  |  |
| 8 | No Android, compartilha um vídeo a partir do app do YouTube (o Hookbop só aparece no menu de compartilhar depois de instalado). |  |  |  |
| 9 | Cria um convite e um amigo entra. |  |  |  |
| 10 | Um segundo aparelho tenta usar o mesmo link e vê "Pede um convite pra quem te mandou". |  |  |  |
| 11 | No iPhone, depois de "Jogar", o clipe começa sozinho ou precisa tocar no player? Anote qual dos dois. |  |  |  |

## 9. Se algo der errado

### 9.1 Voltar o código (rollback)

- [ ] Vercel → Deployments → ache o último deploy de produção que funcionava → menu do deploy → **Promote to Production** (ou "Instant Rollback"; o nome pode variar no painel).
- Antes de voltar, confira que o código antigo ainda funciona com o banco como ele está agora, principalmente se uma migração nova mudou uma função que o código usa.
- Cada deploy carrega as variáveis `NEXT_PUBLIC_` que tinha no seu build. Para mudar uma variável, corrija em Settings → Environment Variables e faça Redeploy.

### 9.2 Banco: só para frente

As migrações são só para frente: não existe "desfazer" nem `down`. Para corrigir o banco:

- Escreva uma migração nova (a próxima é a `0006`) e rode `npx supabase db push`.
- Não edite uma migração que já foi aplicada: o Supabase não a roda de novo.
- Nunca rode `npx supabase db reset --linked`: apaga o banco hospedado.

### 9.3 Onde olhar os logs

- **Vercel:** projeto → Logs mostra o que o servidor imprimiu; filtre por Error ou Warning e busque o texto. Build que falhou: Deployments → o deploy → Build Logs.
- **Supabase:** Logs (o nome pode variar no painel), com as abas de Auth (login e e-mail), API e Postgres.
- **Provedor de SMTP:** o painel mostra envios, bloqueios e e-mails devolvidos.
- **Anthropic Console:** o uso e o gasto por dia.

Mensagens do servidor que valem buscar: `The help request failed.`, `Could not save the help for this line.`, `The song request failed.`, `Could not tell whether this member is the owner.`

### 9.4 Sintomas comuns

| Sintoma | Onde olhar |
|---|---|
| O e-mail de entrada não chega | SMTP (3.5); log de envio do provedor; spam |
| O e-mail traz o link mas não o código | Modelos de e-mail colados nos dois lugares (3.3) |
| O código é recusado | Tamanho do código em 6 e validade (3.4); o código vale uma vez só |
| O link do e-mail abre o localhost | Site URL (3.2) |
| Google mostra "acesso bloqueado" ou "app não verificado" | Tela de consentimento ainda em "Testando" (3.6) |
| Google mostra `redirect_uri_mismatch` | A URI de redirecionamento autorizada no Google Cloud não é a que o Supabase mostra (3.6) |
| O dono entra e cai em "Pede um convite" | `owner_email` diferente do e-mail usado no login (2.3) |
| "Não entendi" ou a tradução falham (na tradução da música inteira o log é `The song translation stopped short.` ou `The song translation request failed.`) | Log `The help request failed.` e a linha `The model service answered NNN`: 401 costuma ser chave errada, 429 é limite de uso ou de gasto, 400 é pedido recusado. Se nenhuma ajuda funciona, confira se a 0002 foi aplicada (`npx supabase migration list`) |
| Tudo falha de repente depois de dias sem uso | O projeto do Supabase pode ter sido pausado no plano grátis; restaure no painel |
