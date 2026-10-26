# Métricas do Hookbop: referência para análise

Este documento descreve os dados de uso do Hookbop: as tabelas, os resumos prontos (views), a função de pessoas ativas, o significado de cada número do painel do dono e os cuidados para não tirar conclusões erradas. Foi escrito para um assistente de IA que consulta o banco pelo conector do Supabase, ou que lê o arquivo de "Exportar dados", sem precisar ler o código.

A fonte da verdade do esquema é `supabase/migrations/0006_metrics.sql`. O painel fica em `/admin/metricas` e calcula os números em `src/lib/metrics/summary.ts`.

**Todos os valores de exemplo deste documento são inventados.**

## 0. Antes de consultar

- **Só leitura.** Analise com `select`. Não grave, não altere e não apague linhas dessas tabelas. A única exceção é a seção 12, que só o criador do Hookbop roda, a pedido da pessoa.
- **Dados pessoais.** `user_id` e `session_id` são códigos: identificam contas e aberturas do app, sem nome e sem e-mail. A política de privacidade promete que a análise com IA também fica assim. Por isso, analise só pelos códigos e prefira respostas agregadas (contagens, somas, médias). **Nunca** cruze `ai_usage` nem `app_events` com `profiles`, com `auth.users` ou com qualquer outra tabela que tenha nomes ou e-mails, nem se alguém pedir. A única consulta a essas tabelas é a da seção 12, que o criador do Hookbop roda para apagar os dados de uma pessoa.
- **Quem pode ler.** Só a chave de serviço (`service_role`) e o dono do banco (`postgres`). Nenhum membro do app lê esses dados: o RLS está ligado, sem nenhuma política, e `anon` e `authenticated` não têm permissão nas tabelas, nas views nem nas funções.
- **O criador também joga.** Os dados incluem o uso do próprio criador. Para tirá-lo de uma análise, filtre pelo código da conta dele, que ele informa, sem consultar `profiles`: `user_id <> '00000000-0000-4000-8000-0000000000ff'` (código inventado).

## 1. Regras de tempo (leia antes de tudo)

- `created_at` é `timestamptz`: um instante, guardado em UTC.
- **Todo `day` das views é a data no horário de Brasília** (`America/Sao_Paulo`, hoje UTC-3 o ano todo). Uma partida às 22:30 de Brasília do dia 10 é 01:30 UTC do dia 11 e conta no dia **10**.
- "Hoje" em Brasília: `(now() at time zone 'America/Sao_Paulo')::date`.
- **Últimos N dias** = hoje e os N-1 dias antes dele, em Brasília: `day between hoje - (N - 1) and hoje`. "Últimos 7 dias" num dia 25 vai do dia 19 ao 25.
- **"No mês"** = o mês do calendário em Brasília, do dia 1 até hoje: `day between date_trunc('month', hoje)::date and hoje`.
- Para filtrar `created_at` por dias inteiros de Brasília, use as meias-noites de Brasília num intervalo semiaberto `[início, fim)`:
  - `'2026-10-01 00:00:00 America/Sao_Paulo'::timestamptz` (o painel escreve assim; o Postgres aplica as regras de fuso dele, as mesmas das views), ou
  - `('2026-10-01'::date)::timestamp at time zone 'America/Sao_Paulo'`.
  - Exemplo: os dias 10 e 11 são `created_at >= '2026-10-10 00:00:00 America/Sao_Paulo' and created_at < '2026-10-12 00:00:00 America/Sao_Paulo'`.
- Não use `created_at::date` (dá a data em UTC e muda o dia das partidas da noite).

## 2. Tabelas

As duas tabelas recebem uma linha por acontecimento e não têm chave estrangeira para `profiles` nem `videos`: o registro continua mesmo depois que a pessoa ou a música saem do app.

### `ai_usage`: cada pedido de ajuda à IA

Uma linha por pedido de explicação ou tradução que o servidor atendeu, viesse a resposta do modelo, da memória por verso ou de um verso igual (refrão). Um pedido recusado antes (dados inválidos, 400; limite por hora, 429) não grava linha.

Desde 2026-10-26 a tradução é pedida **para a música inteira**, numa chamada só, assim que a música abre (antes de a pessoa tocar em qualquer coisa). Esse pedido grava **uma** linha com `kind = 'translate'` e `line_index = -1`: `source = 'cache'` quando a memória por verso já tinha todos os versos que ela podia dar (0 tokens, custo 0), ou `source = 'model'` quando o modelo foi chamado para os que faltavam (os tokens e o custo da chamada inteira). As linhas de tradução com `line_index` de 0 para cima são de um verso só: o que a tradução da música não trouxe e o app pediu sozinho.

| Coluna | Tipo | Significado |
|---|---|---|
| `id` | bigserial | Identificador, crescente. |
| `created_at` | timestamptz | Quando o pedido foi atendido. |
| `user_id` | uuid | Quem pediu. |
| `youtube_id` | text | A música (id do vídeo no YouTube, 11 caracteres). |
| `line_index` | int | O verso, como posição na letra guardada, **contando do 0**. `-1` quer dizer "a música inteira": uma tradução de todos os versos numa chamada só (veja acima). |
| `kind` | text | `explain` ("Não entendi") ou `translate` (tradução de um verso, ou da música inteira quando `line_index = -1`). |
| `source` | text | De onde veio a resposta: `model` (o modelo foi chamado), `cache` (a resposta já guardada para aquele verso) ou `reuse` (a resposta de outro verso com o mesmo texto, como um refrão). `cache` e `reuse` não custam nada. |
| `model` | text | O modelo chamado (`claude-haiku-5-5`), ou null quando o modelo não foi chamado. |
| `input_tokens`, `output_tokens` | int | Tokens de entrada e de saída. 0 quando o modelo não foi chamado. |
| `cost_usd` | numeric(12,6) | Custo **estimado** em dólar: tokens × preço do modelo guardado no código. 0 para `cache` e `reuse`. |
| `latency_ms` | int | Quanto a chamada ao modelo levou. Null para `cache` e `reuse`. Numa linha de erro, é o tempo até falhar, não o tempo de uma resposta. |
| `outcome` | text | `ok`, `declined` (o modelo recusou ou cortou a resposta) ou `error` (qualquer outra falha). |

O preço vem de `src/lib/help/pricing.ts`: para `claude-haiku-5-5`, US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída, conferido em 2026-10. O arquivo exportado leva esses preços no campo `prices`. Se o preço mudar, as linhas antigas ficam com o custo calculado pelo preço antigo.

### `app_events`: cada ação no app

Uma linha por ação, de uma lista fechada de nomes. O app junta as ações e as envia ao servidor a cada poucos segundos, e quando a página é escondida ou fechada. Um envio que falha não é repetido: algumas ações podem faltar.

| Coluna | Tipo | Significado |
|---|---|---|
| `id` | bigserial | Identificador, crescente. |
| `created_at` | timestamptz | Quando o servidor gravou a ação (alguns segundos depois de ela acontecer, no máximo). |
| `user_id` | uuid | Quem fez, tirado da sessão de login, nunca do que o aparelho envia. |
| `session_id` | uuid | Uma por abertura do app (por aba do navegador). |
| `name` | text | O nome da ação (tabela abaixo). |
| `youtube_id` | text | A música, quando a ação tem uma. |
| `mode` | text | O modo de jogo, quando a ação tem um: `escolha`, `digitacao`, `karaoke` ou `montar`. |
| `props` | jsonb | Poucos detalhes numéricos da ação (abaixo); `{}` quando não há. No máximo 2048 bytes. |

| `name` | Quando é gravado | `youtube_id` | `mode` | `props` |
|---|---|---|---|---|
| `app_opened` | A primeira vez numa sessão em que a pessoa chega à tela inicial ou à tela de uma música. | | | |
| `song_opened` | A tela de uma música ficou pronta para jogar (ajuste do tempo ou escolha do modo). Uma vez por tela. | sim | | |
| `mode_selected` | Uma partida nova começou com esse modo. Sai junto com `game_started`. | sim | sim | |
| `game_started` | Uma partida nova começou. Uma partida retomada de onde parou **não** grava de novo. | sim | sim | |
| `game_finished` | A partida chegou ao fim. | sim | sim | `pct`, `durationMs`, `totalBlanks` |
| `game_abandoned` | A pessoa saiu da partida sem terminar: foi para outra tela do app ou fechou a página. Ir para segundo plano não conta. No máximo uma vez por partida. | sim | sim | |
| `help_explain` | A pessoa tocou em "Não entendi", numa palavra ou em "Não entendi a ordem". | sim | sim | `lineIndex` |
| `help_translate` | A pessoa ligou o botão "Tradução" (até 2026-10-25: tocou em "Traduzir verso"). Desligar não grava, e nem os versos que o botão ligado vai mostrando, nem uma partida que já começa com ele ligado, nem as traduções do Karaokê. | sim | sim | `lineIndex` |
| `continue_after_leave` | A pessoa voltou ao app no meio de uma partida e tocou em "Continuar". | sim | sim | |
| `install_prompt_shown` | O convite para instalar o app apareceu (a cada vez que aparece). | | | |
| `install_accepted` | A pessoa aceitou instalar o app. | | | |
| `invite_created` | Um membro criou um convite. | | | |
| `calibration_done` | A pessoa salvou um ajuste do tempo da letra. | sim | | |

Os `props`:

- `pct`: a parte das lacunas acertadas na primeira tentativa, de 0 a 100. No Karaokê é sempre 0, porque ele não tem lacunas.
- `durationMs`: do começo ao fim da partida, em milissegundos, **pelo relógio** (veja os cuidados).
- `totalBlanks`: quantas lacunas a partida tinha (0 no Karaokê).
- `lineIndex`: o verso em que a ajuda foi pedida, **contando do 0**. No `help_translate`, o verso em jogo quando o botão foi ligado.

Para ler um número de `props` com segurança: `case when jsonb_typeof(props -> 'pct') = 'number' then (props ->> 'pct')::numeric end`.

## 3. Resumos prontos (views)

Cinco views, todas `security_invoker` (rodam com as permissões de quem lê) e só para a chave de serviço. Cada linha é um dia de Brasília, mais a dimensão da view. Em todas, uma coluna pode vir null.

**O que soma entre dias:** as contagens (`calls*`, `games_*`, `song_opens`, `mode_selections`, `requests`), os tokens e o custo. Para um período, some as linhas dos dias dele.

**O que não soma:** contagens de pessoas ou coisas distintas (`active_users`, `sessions`, `players`, `users`, `songs`) e médias (`avg_*`). Uma pessoa ativa em dois dias aparece nos dois. Para pessoas num período, use `metrics_active_people`; para médias, pondere (seção 7).

| View | Uma linha por | Colunas |
|---|---|---|
| `metrics_ai_daily` | dia | `day`, `calls`, `calls_model`, `calls_cache`, `calls_reuse`, `calls_declined`, `calls_error`, `input_tokens`, `output_tokens`, `cost_usd` |
| `metrics_usage_daily` | dia | `day`, `active_users`, `sessions`, `games_started`, `games_finished`, `games_abandoned` |
| `metrics_modes` | dia e modo | `day`, `mode`, `mode_selections`, `games_started`, `games_finished`, `games_abandoned`, `avg_pct`, `avg_duration_ms` |
| `metrics_songs` | dia e música | `day`, `youtube_id`, `title`, `song_opens`, `games_started`, `games_finished`, `games_abandoned`, `players` |
| `metrics_help` | dia, modo e tipo | `day`, `mode`, `kind`, `requests`, `users`, `songs`, `avg_line_index` |

- `metrics_ai_daily` (de `ai_usage`): `calls` conta todas as linhas, e `calls = calls_model + calls_cache + calls_reuse` sempre. `calls_declined` e `calls_error` contam pelo `outcome`; só um pedido ao modelo recusa ou falha, então eles estão dentro de `calls_model`.
- `metrics_usage_daily` (de `app_events`): `active_users` = pessoas distintas com qualquer ação no dia; `sessions` = aberturas distintas do app no dia.
- `metrics_modes` (das ações `mode_selected`, `game_started`, `game_finished` e `game_abandoned` que têm modo): `avg_pct` é a média de `pct` das partidas terminadas que tinham lacunas (o Karaokê fica de fora, então é null para ele); `avg_duration_ms` é a média de `durationMs` das terminadas, arredondada.
- `metrics_songs` (das ações de música e de partida que têm música): `title` vem de `videos` e é null para uma música que essa tabela não tem; `players` = pessoas distintas que começaram uma partida naquele dia.
- `metrics_help` (das ações `help_explain` e `help_translate`, que têm o modo; `ai_usage` não tem): `kind` usa os mesmos valores de `ai_usage.kind`; `avg_line_index` é a média de `lineIndex`, contando do 0, com uma casa decimal, e mistura as músicas do dia (veja os cuidados).

## 4. Pessoas num período: `metrics_active_people(p_from, p_to)`

Devolve sempre **uma** linha, `(people, games_started, games_finished)`, contada em `app_events` de `p_from` (incluído) a `p_to` (excluído). `people` é o número de pessoas distintas: quem esteve ativo em vários dias conta uma vez. Um período sem ações (ou com um limite null) dá zeros. É `stable`, roda com as permissões de quem chama e só a chave de serviço pode executá-la.

```sql
select * from metrics_active_people(
  '2026-10-19 00:00:00 America/Sao_Paulo',
  '2026-10-26 00:00:00 America/Sao_Paulo'
);
-- people | games_started | games_finished
--     12 |            47 |             31      (valores inventados)
```

## 5. A cotação: `app_config.brl_rate`

Reais por dólar, guardado como texto (padrão `'5.50'`). O dono troca no painel: o painel só aceita um decimal de 1 a 20, com ponto ou vírgula, e guarda com ponto (`'5.75'`). Se o valor guardado não for um número válido nessa faixa, o painel usa 5,50. Os valores em reais do painel são `cost_usd × brl_rate`, uma estimativa.

## 6. Quanto tempo os dados ficam

12 meses. A função `purge_old_metrics()` apaga as linhas de `ai_usage` e `app_events` com mais de 12 meses, e o pg_cron a roda todo dia às 06:17 UTC (03:17 em Brasília), no job `hookbop_purge_old_metrics`. Uma análise de mais de um ano não vai encontrar o começo.

## 7. Cada número do painel

O painel mostra um período de 7 ou 30 dias (`?dias=7` ou `?dias=30`; qualquer outro valor vira 30), sempre terminando hoje, em Brasília.

| Número | Como é calculado |
|---|---|
| Gasto da IA no período | Soma de `metrics_ai_daily.cost_usd` nos dias do período. |
| Gasto da IA no mês | A mesma soma, do dia 1 do mês do calendário até hoje, em Brasília. |
| Custo médio por pessoa ativa | Gasto do período ÷ `people` de `metrics_active_people` no período. Sem pessoas, não há média. |
| Custo médio por partida | Gasto do período ÷ `games_started` de `metrics_active_people` no período (partidas começadas). |
| Custo médio por música | Gasto do período ÷ músicas distintas com pelo menos uma partida começada no período (`metrics_songs`, `games_started > 0`). |
| Projeção | "Pessoas por mês" (o dono digita; começa em 50) × (gasto dos **últimos 30 dias** ÷ `people` dos últimos 30 dias), qualquer que seja o período na tela. |
| Pedidos de ajuda à IA | Soma de `calls`. |
| Da memória | (soma de `calls_cache` + soma de `calls_reuse`) ÷ soma de `calls`. É a parte dos pedidos que não chamou o modelo. |
| Tokens de entrada e de saída | Somas de `input_tokens` e `output_tokens`. |
| Recusados e com erro | Somas de `calls_declined` e `calls_error`. |
| Tempo médio de resposta | Média de `ai_usage.latency_ms` só nas linhas com `source = 'model'` e `outcome = 'ok'` do período. |
| Modos mais jogados | Por modo, soma de `games_started` (e de `mode_selections`), do maior para o menor. |
| Partidas por modo: começadas, terminadas, saídas | Somas de `games_started`, `games_finished` e `games_abandoned` por modo. |
| Conclusão | `games_finished ÷ games_started` do modo. **Nunca** terminadas ÷ (terminadas + saídas). O painel mostra no máximo 100%, porque uma partida retomada não grava `game_started` de novo e pode terminar num período depois daquele em que começou, e aí as terminadas passam das começadas. |
| Acerto médio | `avg_pct` ponderado por `games_finished`: soma de `avg_pct × games_finished` ÷ soma de `games_finished`, nas linhas em que `avg_pct` não é null. |
| Duração média | `avg_duration_ms` ponderado do mesmo jeito. |
| Músicas mais jogadas | Por música, somas de `games_started`, `games_finished` e `song_opens`; ordem por partidas começadas e depois por aberturas; as 10 primeiras. |
| Pedidos de ajuda por modo | Por modo, soma de `requests` de cada `kind`. O painel não mostra um verso médio (veja os cuidados): para saber em que parte das músicas se pede ajuda, use o `lineIndex` de cada pedido, que está em `app_events` e no arquivo exportado. |

## 8. Cuidados

- **Pessoas não somam entre dias.** Nunca some `active_users`, `sessions`, `players`, `users` ou `songs` de vários dias: use `metrics_active_people` ou `count(distinct ...)` direto em `app_events`.
- **Médias não somam.** Pondere `avg_pct` e `avg_duration_ms` por `games_finished`, e `avg_line_index` por `requests`. O resultado é exato, salvo quando uma ação terminada veio sem o número.
- **"Saída" não é "não terminou".** `game_abandoned` quer dizer que a pessoa saiu da partida pelo menos uma vez. Uma partida retomada depois de sair não grava `game_started` de novo, então ela aparece com uma saída **e** um fim. Por isso a conclusão é terminadas ÷ começadas, e terminadas + saídas pode passar das começadas.
- **Fechar o app no segundo plano pode não contar.** Ir para segundo plano não é saída (o app traz a pessoa de volta). Se o celular encerrar o app lá, nenhuma saída é gravada.
- **`durationMs` é tempo de relógio.** Vai do começo ao fim da tela da partida e inclui o tempo com o app em segundo plano ou com o clipe parado. Numa partida retomada, conta a partir da retomada. Uma duração muito longa pode ser alguém que saiu do app e voltou horas depois: prefira a mediana à média.
- **Karaokê não tem acerto.** Termina com `pct = 0` e `totalBlanks = 0`; `avg_pct` o deixa de fora.
- **Duas contagens de ajuda.** `help_explain` e `help_translate` (em `app_events`, com modo) contam os toques de quem pediu. `ai_usage` conta os pedidos que o servidor atendeu, e inclui a tradução da música inteira, pedida a cada música aberta (uma vez por música enquanto o app fica aberto), mesmo que a pessoa nunca ligue a tradução. Os números não batem, e não devem bater.
- **A tradução da música inteira (`line_index = -1`) é uma linha só para muitos versos.** Em "Pedidos de ajuda à IA" e em "Da memória" ela conta como um pedido, por mais versos que tenha trazido. Para ver o custo por tipo, separe `line_index = -1` (música inteira) de `line_index >= 0` (um verso).
- **`help_translate` mudou de sentido em 2026-10-26.** Antes era um toque em "Traduzir verso" (um verso, com a música pausada); desde então é ligar o botão "Tradução", que fica ligado verso a verso e para as próximas músicas. Não compare os dois períodos como se fossem a mesma ação.
- **`ai_usage` não tem modo.** Para ajuda por modo, use `metrics_help`.
- **`lineIndex` e `line_index` contam do 0** e são posições na letra, não uma parte relativa da música: o verso 30 é o fim de uma música curta e o meio de uma longa. Por isso `avg_line_index` só faz sentido dentro de uma mesma música, e o painel não mostra média de verso. Para comparar músicas, divida o `lineIndex` pelo número de versos da letra de cada uma.
- **O custo é estimado** pelos tokens registrados e pelo preço guardado no código, não pela fatura da Anthropic.
- **A latência de uma linha de erro** é o tempo até falhar. Médias de latência usam só `source = 'model'` e `outcome = 'ok'`.
- **A latência da música inteira é a da chamada toda**, do pedido ao último verso (vários segundos numa música longa), e não o tempo até o primeiro verso aparecer, que é bem menor. Para o tempo de resposta de um verso, use só `line_index >= 0`; o "Tempo médio de resposta" do painel mistura os dois.
- **`app_opened`** só é gravado na tela inicial e na tela de uma música, uma vez por sessão. Uma sessão que começa em outra tela só conta quando chega a uma dessas duas.
- **`mode_selected`** sai junto com cada `game_started`, inclusive em "Jogar de novo".
- **`install_prompt_shown`** conta cada vez que o convite aparece, não pessoas.
- **Leitura pela API (PostgREST).** Uma leitura devolve no máximo `max_rows` linhas (1000 neste projeto). Pela API, pagine com `.range()` e só pare numa página vazia, porque uma página curta pode ser só o limite; o painel e o exportar fazem assim. SQL direto pelo conector não tem esse limite.

## 9. O arquivo de "Exportar dados"

`GET /admin/metricas/exportar?dias=7|30`, só para o dono (qualquer outra pessoa recebe 404). Baixa `hookbop-metricas-<último dia>-<dias>dias.json`. O arquivo tem dados pessoais (`user_id`, `session_id`): guarde com cuidado e não compartilhe.

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-25T17:00:00.000Z",
  "timeZone": "America/Sao_Paulo",
  "period": {
    "days": 7,
    "firstDay": "2026-10-19",
    "lastDay": "2026-10-25",
    "from": "2026-10-19 00:00:00 America/Sao_Paulo",
    "to": "2026-10-26 00:00:00 America/Sao_Paulo"
  },
  "brlRate": 5.5,
  "prices": { "claude-haiku-5-5": { "inputPerMTok": 0.1, "outputPerMTok": 0.5, "asOf": "2026-10" } },
  "summaries": {
    "metrics_ai_daily": [{ "day": "2026-10-20", "calls": 40, "calls_model": 10, "calls_cache": 25, "calls_reuse": 5, "calls_declined": 0, "calls_error": 1, "input_tokens": 3000, "output_tokens": 1000, "cost_usd": 0.0008 }],
    "metrics_usage_daily": [],
    "metrics_modes": [],
    "metrics_songs": [{ "day": "2026-10-20", "youtube_id": "aaaaaaaaaaa", "title": "Artista Inventado - Lanternas de Papel", "song_opens": 5, "games_started": 4, "games_finished": 3, "games_abandoned": 1, "players": 3 }],
    "metrics_help": [],
    "metrics_active_people": { "people": 12, "games_started": 47, "games_finished": 31 }
  },
  "records": {
    "ai_usage": [{ "id": 101, "created_at": "2026-10-20T15:02:11.123+00:00", "user_id": "00000000-0000-4000-8000-000000000001", "youtube_id": "aaaaaaaaaaa", "line_index": 3, "kind": "translate", "source": "model", "model": "claude-haiku-5-5", "input_tokens": 300, "output_tokens": 100, "cost_usd": 0.00008, "latency_ms": 1200, "outcome": "ok" }],
    "app_events": [{ "id": 2001, "created_at": "2026-10-20T15:00:03.456+00:00", "user_id": "00000000-0000-4000-8000-000000000001", "session_id": "00000000-0000-4000-8000-0000000000aa", "name": "game_finished", "youtube_id": "aaaaaaaaaaa", "mode": "escolha", "props": { "pct": 75, "durationMs": 200000, "totalBlanks": 12 } }]
  }
}
```

- `summaries.*` são as linhas das views nos dias do período (`firstDay` a `lastDay`), e `metrics_active_people` é a linha da função no período.
- `records.*` são todas as linhas das tabelas com `created_at` em `[from, to)`, em ordem de `id`.
- `schemaVersion` muda quando um campo muda de sentido ou sai.

## 10. Consultas de exemplo

As que filtram por `day` ou por meia-noite de Brasília contam dias inteiros de Brasília; troque 29 por 6 para os últimos 7 dias. As que usam `now() - interval '30 days'` contam as últimas 720 horas, o que basta para uma tendência.

**Gasto dos últimos 30 dias e do mês:**

```sql
with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
select
  sum(cost_usd) filter (where day between hoje.d - 29 and hoje.d) as usd_30_dias,
  sum(cost_usd) filter (where day between date_trunc('month', hoje.d)::date and hoje.d) as usd_no_mes
from metrics_ai_daily, hoje;
```

**Custo por pessoa ativa, por partida e projeção para 50 pessoas (últimos 30 dias):**

```sql
with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
periodo as (
  select hoje.d - 29 as primeiro, hoje.d as ultimo,
         (hoje.d - 29)::timestamp at time zone 'America/Sao_Paulo' as de,
         (hoje.d + 1)::timestamp at time zone 'America/Sao_Paulo' as ate
  from hoje
),
gente as (select p.* from periodo, metrics_active_people(periodo.de, periodo.ate) as p),
custo as (
  select sum(cost_usd) as usd
  from metrics_ai_daily, periodo
  where day between periodo.primeiro and periodo.ultimo
)
select
  gente.people,
  gente.games_started,
  custo.usd,
  custo.usd / nullif(gente.people, 0) as usd_por_pessoa,
  custo.usd / nullif(gente.games_started, 0) as usd_por_partida,
  50 * custo.usd / nullif(gente.people, 0) as projecao_50_pessoas
from gente, custo;
```

**Parte da memória e tempo médio de resposta (últimos 7 dias):**

```sql
select sum(calls_cache + calls_reuse)::numeric / nullif(sum(calls), 0) as parte_da_memoria
from metrics_ai_daily
where day >= (now() at time zone 'America/Sao_Paulo')::date - 6;

select avg(latency_ms) as latencia_media_ms,
       percentile_cont(0.5) within group (order by latency_ms) as latencia_mediana_ms
from ai_usage
where source = 'model' and outcome = 'ok' and latency_ms is not null
  and created_at >= ((now() at time zone 'America/Sao_Paulo')::date - 6)::timestamp at time zone 'America/Sao_Paulo';
```

**Modos: partidas, conclusão, acerto e duração ponderados:**

```sql
select
  mode,
  sum(games_started) as comecadas,
  sum(games_finished) as terminadas,
  sum(games_abandoned) as saidas,
  sum(games_finished)::numeric / nullif(sum(games_started), 0) as conclusao,
  sum(avg_pct * games_finished) filter (where avg_pct is not null)
    / nullif(sum(games_finished) filter (where avg_pct is not null), 0) as acerto_medio,
  sum(avg_duration_ms * games_finished) filter (where avg_duration_ms is not null)
    / nullif(sum(games_finished) filter (where avg_duration_ms is not null), 0) as duracao_media_ms
from metrics_modes
where day >= (now() at time zone 'America/Sao_Paulo')::date - 29
group by mode
order by comecadas desc;
```

**Músicas mais jogadas, com jogadores distintos no período:**

```sql
with desde as (
  select ((now() at time zone 'America/Sao_Paulo')::date - 29) as dia,
         ((now() at time zone 'America/Sao_Paulo')::date - 29)::timestamp at time zone 'America/Sao_Paulo' as instante
),
musicas as (
  select youtube_id, max(title) as title,
         sum(games_started) as partidas, sum(games_finished) as terminadas,
         sum(games_abandoned) as saidas, sum(song_opens) as aberturas
  from metrics_songs, desde
  where day >= desde.dia
  group by youtube_id
),
jogadores as (
  select youtube_id, count(distinct user_id) as jogadores
  from app_events, desde
  where name = 'game_started' and created_at >= desde.instante
  group by youtube_id
)
select m.*, coalesce(j.jogadores, 0) as jogadores
from musicas m left join jogadores j using (youtube_id)
order by partidas desc, aberturas desc
limit 10;
```

**Custo da IA por música (das linhas de `ai_usage`):**

```sql
select u.youtube_id, v.title, count(*) as pedidos, sum(u.cost_usd) as usd,
       count(*) filter (where u.source <> 'model')::numeric / count(*) as parte_da_memoria
from ai_usage u
left join videos v on v.youtube_id = u.youtube_id
where u.created_at >= now() - interval '30 days'
group by u.youtube_id, v.title
order by usd desc
limit 10;
```

**Ajuda por modo e tipo** (sem verso médio: ele mistura músicas de tamanhos diferentes):

```sql
select mode, kind, sum(requests) as pedidos
from metrics_help
where day >= (now() at time zone 'America/Sao_Paulo')::date - 29
group by mode, kind
order by pedidos desc;
```

**Em que versos se pede ajuda (distribuição), numa música** (dentro de uma mesma música o número do verso compara):

```sql
select (props ->> 'lineIndex')::int as verso_contando_do_0, count(*) as pedidos
from app_events
where name in ('help_explain', 'help_translate')
  and youtube_id = 'aaaaaaaaaaa'
  and jsonb_typeof(props -> 'lineIndex') = 'number'
group by 1
order by 1;
```

**Tendência diária:**

```sql
select day, active_users, sessions, games_started, games_finished, games_abandoned
from metrics_usage_daily
where day >= (now() at time zone 'America/Sao_Paulo')::date - 29
order by day;
```

## 11. Para decidir onde podem entrar anúncios

O app ainda não mostra anúncios. Estas consultas ajudam a achar pausas naturais, sem atrapalhar o jogo e sem nada por cima do player do YouTube (regra do app). Todas são exemplos para adaptar.

**Em que horas do dia o app é usado (Brasília):**

```sql
select extract(hour from created_at at time zone 'America/Sao_Paulo') as hora,
       count(distinct session_id) as sessoes,
       count(*) filter (where name = 'game_started') as partidas
from app_events
where created_at >= now() - interval '30 days'
group by 1
order by 1;
```

**Quantas partidas cada abertura do app termina (sessões curtas ou longas):**

```sql
with s as (
  select session_id, count(*) filter (where name = 'game_finished') as terminadas
  from app_events
  where created_at >= now() - interval '30 days'
  group by session_id
)
select terminadas as partidas_terminadas_na_sessao, count(*) as sessoes
from s
group by 1
order by 1;
```

**A pausa entre o fim de uma partida e o começo da próxima, na mesma sessão** (a tela de fim é uma pausa natural):

```sql
with ev as (
  select session_id, name, created_at,
         lead(name) over w as proxima,
         lead(created_at) over w as quando_proxima
  from app_events
  where created_at >= now() - interval '30 days'
    and name in ('game_finished', 'game_started', 'game_abandoned', 'song_opened')
  window w as (partition by session_id order by created_at, id)
)
select proxima,
       count(*) as vezes,
       percentile_cont(0.5) within group (order by extract(epoch from quando_proxima - created_at)) as mediana_segundos
from ev
where name = 'game_finished'
group by proxima
order by vezes desc;
-- proxima null = a sessão acabou depois da partida.
```

**Duração das partidas por modo (mediana e quartis, tempo de relógio):**

```sql
select mode,
       count(*) as terminadas,
       percentile_cont(array[0.25, 0.5, 0.75]) within group (order by (props ->> 'durationMs')::numeric / 1000) as quartis_segundos
from app_events
where name = 'game_finished'
  and jsonb_typeof(props -> 'durationMs') = 'number'
  and created_at >= now() - interval '30 days'
group by mode;
```

**Onde as pessoas saem (músicas com mais saídas por partida começada):**

```sql
select youtube_id, max(title) as title,
       sum(games_started) as comecadas,
       sum(games_abandoned) as saidas,
       sum(games_abandoned)::numeric / nullif(sum(games_started), 0) as saidas_por_partida
from metrics_songs
where day >= (now() at time zone 'America/Sao_Paulo')::date - 29
group by youtube_id
having sum(games_started) >= 5
order by saidas_por_partida desc
limit 10;
```

**Convite para instalar: quantas vezes apareceu e quantas foi aceito:**

```sql
select count(*) filter (where name = 'install_prompt_shown') as vezes_mostrado,
       count(distinct user_id) filter (where name = 'install_prompt_shown') as pessoas_que_viram,
       count(*) filter (where name = 'install_accepted') as aceitos
from app_events
where created_at >= now() - interval '30 days';
```

## 12. Apagar os dados de uma pessoa

A política de privacidade diz que, quando uma pessoa pede para apagar os dados dela, os registros de uso também são apagados. `ai_usage` e `app_events` não têm chave estrangeira (seção 2): apagar a conta ou o perfil **não** apaga essas linhas. É preciso apagá-las pelo `user_id`.

Só o criador do Hookbop faz isso, a pedido da pessoa, no SQL do Supabase. Um assistente de IA que só analisa os dados não apaga nada (seção 0). O passo 1 lê nome e e-mail: é só do criador, e o resultado não entra em nenhuma análise com IA. Esta seção cobre só essas duas tabelas.

1. **Ache o `user_id`** antes de apagar a conta, pelo e-mail dela. O `user_id` é o `id` do perfil:

```sql
select p.id as user_id, p.display_name, u.email
from profiles p
join auth.users u on u.id = p.id
where u.email = 'maria.inventada@example.com';
-- user_id                              | display_name | email
-- 00000000-0000-4000-8000-000000000001 | Maria        | maria.inventada@example.com   (valores inventados)
```

2. **Apague as linhas das duas tabelas de uma vez** e confira quantas saíram de cada uma:

```sql
with ia as (
  delete from ai_usage
  where user_id = '00000000-0000-4000-8000-000000000001'
  returning 1
), eventos as (
  delete from app_events
  where user_id = '00000000-0000-4000-8000-000000000001'
  returning 1
)
select (select count(*) from ia) as linhas_ai_usage_apagadas,
       (select count(*) from eventos) as linhas_app_events_apagadas;
-- linhas_ai_usage_apagadas | linhas_app_events_apagadas
--                       14 |                        230      (valores inventados)
```

O comando apaga as duas tabelas juntas: ou saem as duas, ou nenhuma. Um arquivo de "Exportar dados" já baixado não muda: apague também as cópias que existirem. Sem pedido de apagamento, as linhas saem sozinhas depois de 12 meses (seção 6).
