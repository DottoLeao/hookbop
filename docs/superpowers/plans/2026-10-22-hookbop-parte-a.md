# Hookbop, parte A (jogo principal): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar aos amigos convidados um PWA em que se cola qualquer link do YouTube e se joga a música em quatro modos (Escolha, Digitação, Karaokê, Monte o verso), com a letra sincronizada, explicação e tradução sob demanda e a tela de fim da música.

**Architecture:**
- **App:** Next.js (App Router, TypeScript) hospedado na Vercel, com o Supabase para login, banco de dados e regras de acesso.
- **Lógica do jogo:** fica em funções puras dentro de `src/lib/` (letra, lacunas, pontuação e o motor da partida, um reducer). Tudo isso é testado com Vitest, sem precisar de navegador.
- **Player:** o YouTube fica atrás de uma interface `PlayerAdapter`. Os testes usam um player falso (`FakePlayerAdapter`).
- **IA:** só uma rota de servidor (`/api/help`), chamada quando o jogador toca em "Não entendi" ou "Traduzir verso". A resposta fica guardada por linha.

**Tech Stack:**
- Next.js (create-next-app@latest), React, TypeScript, Tailwind CSS (v4, tokens via `@theme`) e `next/font/google`
- Supabase: `@supabase/supabase-js`, `@supabase/ssr` e Supabase CLI (Postgres, RLS, pgTAP)
- Testes: Vitest, Testing Library e Playwright
- IA: `@anthropic-ai/sdk` com o modelo `claude-haiku-5-5`
- Bibliotecas: `double-metaphone`, `wordlist-english` e `qrcode`

**Spec:** `docs/superpowers/specs/2026-10-22-hookbop-design.md`. As seções citadas como "spec §N" referem-se a esse documento. Os wireframes e a marca estão no canvas https://claude.ai/artifact/UJtXzHGE6zR2TKZ2FJvsq1.

## Pré-requisitos do dono do produto

Estes passos ficam com o dono, porque envolvem contas e chaves dele. O executor não cria contas nem digita chaves.

1. **Supabase.** Decidir qual projeto ativo pausar (job-search-pipeline ou radar-de-vagas), ou assinar o plano pago, e criar o projeto "hookbop". Isso é necessário antes da Task 7, ou dá para usar o Supabase local até a Task 26.
2. **Docker Desktop instalado,** para rodar o Supabase localmente e os testes do banco a partir da Task 7.
3. **Login do Google.** Criar um cliente OAuth no Google Cloud e colar o ID e o segredo em Supabase → Auth → Providers → Google. Necessário antes da Task 26.
4. **Chave da Anthropic.** Gerar uma chave de API, que só entra como variável de ambiente `ANTHROPIC_API_KEY`. Necessário antes da Task 23 rodar de verdade, porque os testes usam um cliente falso.
5. **Domínio.** Registrar o hookbop.app, ou outro domínio, antes do primeiro convite (Task 26).

## Global Constraints

Todas as tasks seguem estas regras.

**Regras do YouTube (spec §4)**
- O player é o oficial do YouTube, carregado de `https://www.youtube-nocookie.com`.
- O player ocupa a largura toda em 16:9, com pelo menos 200 px de altura, e nada fica por cima dele.
- `autoplay: 0` e `playsinline: 1`.
- O app não lê o áudio do vídeo e não toca em segundo plano.
- XP e progresso vêm só de respostas certas. O Karaokê dá 0 XP (spec §7).
- Os metadados do YouTube guardados no banco são atualizados quando passam de 30 dias.

**IA (spec §6)**
- A IA só roda quando o jogador toca em "Não entendi" ou "Traduzir verso". O Karaokê também traduz a linha atual e a próxima, porque nesse modo a tradução aparece por padrão.
- A chamada é feita só pelo servidor, com o modelo `claude-haiku-5-5`, e o resultado fica guardado por linha.
- Acerto e erro nunca usam IA.

**Feedback**
- Acerto: o elemento fica `#C8FF2E` com o ícone ✓.
- Erro: o elemento fica `#FF5C5C` com o ícone ✕.
- Nenhum texto de "acertou" ou "errou" aparece na tela.
- Botões com ícone têm `aria-label` com o resultado, por exemplo "let, acertou" e "late, errou".

**Pontuação (spec §8)**
- Só a primeira tentativa de cada lacuna conta para a porcentagem, o combo e o XP.
- Tentativa repetida (`retry`) e resposta com dica (`helped`) não dão pontos.
- O app guarda o tipo de cada tentativa (`AttemptKind`).

**Fase 1**
- Só entra quem tem convite, com no máximo 50 membros (spec §9).
- `APP_PHASE=closed_beta`.
- Todos os lugares de anúncio aparecem com borda tracejada `#C8FF2E` e liberam grátis por meio de `getEntitlements` (spec §10).

**Marca (spec §11)**
- Base:

  | Token | Cor |
  |---|---|
  | `bg` | `#0E0E10` |
  | `card` | `#1C1C21` |
  | `elevated` | `#26262C` |
  | `border` | `#3A3A42` |

- Texto:

  | Token | Cor |
  |---|---|
  | `text` | `#FFFFFF` |
  | `muted` | `#A9A9B2` |
  | `faint` | `#6E6E78` |

- Destaque e momentos do jogo:

  | Token | Cor |
  |---|---|
  | `lime` | `#C8FF2E` |
  | `lime-light` | `#E2FF8A` |
  | `lime-dark` | `#A6D91A` |
  | `error` | `#FF5C5C` |
  | `warn` | `#FFB020` |
  | `rare` | `#B794FF` |

- Em cima do limão, o texto é sempre `#0E0E10`.
- Fontes: Space Grotesk em títulos e no verso em jogo, e Inter no resto.
- Tamanhos de fonte: 28, 22, 16, 15, 14 e 12.
- Cantos: 8 (lacuna), 12 (botão), 14 (resposta), 20 (cartão) e pílula.
- Toque mínimo de 44 px.

**Textos**
- Todos os textos de tela ficam em `src/i18n/pt-BR.ts`, lidos pela função `t()`.
- As falas do DJ Bop seguem as regras de voz: nunca zoa, no máximo 8 palavras, gíria leve e convidar sem cobrar.

**Commits**
- Mensagem no formato `tipo: descrição` em inglês.
- Nenhuma marca de autoria de IA em commits, código ou documentos: sem `Co-Authored-By`, sem "Generated with" e sem emoji de robô.

**Comandos**
- Shell PowerShell no Windows.
- Testes unitários com `npx vitest run <arquivo>`.
- Testes de ponta a ponta com `npx playwright test <arquivo>`.
- Testes do banco com `npx supabase test db`.

## Review Focus

Estes casos podem atrapalhar um jogador de verdade. Cada um tem um teste na task indicada.

1. **O LRCLIB está lento ou fora do ar.** Depois de 6 s, o app mostra "O banco de letras tá lento. Tenta de novo?" com um botão para tentar de novo. Ele nunca fica carregando para sempre e não salva o vídeo como "sem letra". Testes nas Tasks 5, 11 e 18.
2. **O clipe não toca fora do YouTube** (erro 101 ou 150) **ou é privado** (erro 100 ou oEmbed 401/404). O app mostra "Esse clipe não toca fora do YouTube." e oferece colar outro link. Testes nas Tasks 10 e 18.
3. **O jogador mexe no player.** Ele arrasta a barra do player, pausa pelo próprio player ou sai do app no meio. Nada é marcado como errado. As lacunas puladas contam como não acertadas no total, mas ainda podem ser respondidas de primeira se ele voltar. Teste na Task 17.
4. **O teclado do celular muda o que foi digitado:** maiúscula automática, corretor, apóstrofo curvo (’) ou espaço no fim. Nada disso vira erro. Testes nas Tasks 14 e 20.
5. **Duas pessoas abrem o mesmo link de convite, ou o grupo já tem 50 pessoas.** Só a primeira entra. A outra vê "Pede um convite pra quem te mandou" ou "A galera tá cheia por enquanto". Testes nas Tasks 7 e 9.

---

## Mapa de arquivos

```
src/
  app/                      páginas e rotas (Next.js App Router)
    layout.tsx, globals.css, manifest.ts, page.tsx (início)
    entrar/page.tsx, auth/callback/route.ts
    convite/[code]/page.tsx, convidar/page.tsx, admin/page.tsx
    jogar/[youtubeId]/page.tsx, compartilhar/route.ts
    api/yt/meta/route.ts, api/help/route.ts
  components/
    brand/      Logo.tsx, DjBop.tsx, DiscIcon.tsx
    game/       SongScreen.tsx, CalibrationSheet.tsx, ModePicker.tsx, GameScreen.tsx,
                LyricPanel.tsx, ToolsBar.tsx, SettingsSheet.tsx, HelpSheet.tsx,
                EscolhaArea.tsx, DigitacaoArea.tsx, MontarArea.tsx, KaraokeView.tsx, EndScreen.tsx
    home/       PasteLink.tsx, SongCard.tsx
    pwa/        InstallPrompt.tsx, RegisterSW.tsx
  i18n/         pt-BR.ts, t.ts
  lib/
    types.ts
    youtube/    parseUrl.ts
    lyrics/     lrc.ts, cleanTitle.ts, similarity.ts, pick.ts, lrclib.ts, source.ts, offset.ts, resolveSong.ts
    player/     adapter.ts, youtubeAdapter.ts, fakeAdapter.ts, usePlayerTime.ts
    game/       blanks.ts, distractors.ts, editDistance.ts, words.ts, typo.ts, tiles.ts,
                scoring.ts, reducer.ts, sfx.ts, rng.ts, data/*.json
    entitlements.ts, settings.ts
    supabase/   client.ts, server.ts, middleware.ts, songStore.ts, plays.ts, invites.ts
    auth/       paths.ts
    help/       prompts.ts, helpService.ts
  middleware.ts
public/  sw.js, icons/*
supabase/ migrations/*.sql, tests/database/*.sql, seed.sql
e2e/     *.spec.ts
```

Os testes unitários ficam ao lado de cada arquivo, com o nome `*.test.ts(x)`.

## Tipos compartilhados (criados na Task 1, em `src/lib/types.ts`)

```ts
export type Mode = 'escolha' | 'digitacao' | 'karaoke' | 'montar';
export type Difficulty = 'facil' | 'medio' | 'dificil';
export interface LyricLine { index: number; startMs: number; endMs: number; text: string }
// tokenIndex = -1 quando a "lacuna" é a linha inteira (Monte o verso)
export interface Blank { id: string; lineIndex: number; tokenIndex: number; answer: string }
export type AttemptKind = 'first' | 'retry' | 'helped';
export interface AnswerRecord { blankId: string; kind: AttemptKind; correct: boolean; beforeLineEnd: boolean }
export interface PlaySummary { totalBlanks: number; firstTryCorrect: number; pct: number; maxCombo: number; xp: number }
export type Command = { type: 'pause' } | { type: 'play' } | { type: 'seek'; ms: number } | { type: 'rate'; rate: 0.75 | 1 };
```

---

### Task 1: Fundação do projeto e da marca

**Files:**
- Create: projeto Next.js na raiz. A raiz já tem `docs/`, `reports/` e `research_notes/`. Gere o projeto com create-next-app numa pasta temporária e mova o conteúdo para a raiz.
- Create: `src/lib/types.ts` (com o conteúdo do bloco acima), `src/i18n/pt-BR.ts`, `src/i18n/t.ts`
- Create: `src/components/brand/Logo.tsx`, `DjBop.tsx`, `DiscIcon.tsx`
- Modify: `src/app/globals.css` (tokens em `@theme`), `src/app/layout.tsx` (fontes, `lang="pt-BR"`, fundo `bg`)
- Create: `vitest.config.ts`, `playwright.config.ts`, `e2e/smoke.spec.ts`, `.gitignore`
- Test: `src/i18n/t.test.ts`, `src/components/brand/DjBop.test.tsx`

**Interfaces:**
- Produces:
  - `t(key: MessageKey, vars?: Record<string, string | number>): string`, com `MessageKey = keyof typeof ptBR`
  - `<DjBop expression="idle" | "acertou" | "errou" | "combo" | "desafio" size={number} />`, que renderiza um `svg` com `role="img"` e `aria-label` "DJ Bop"
  - `<Logo size={number} />`, o wordmark "h + 2 discos + kbop", com `role="img"` e `aria-label="hookbop"`
  - `<DiscIcon size={number} />`, o disco preto em fundo limão
  - Tokens do Tailwind: `bg-bg`, `bg-card`, `text-muted`, `bg-lime` e assim por diante, com os nomes listados em Global Constraints

- [ ] **Step 1:** Rode `git init`, gere o Next.js (TypeScript, App Router, Tailwind, ESLint, `src/`) e instale as dependências de teste: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@playwright/test`.
- [ ] **Step 2: Escreva os testes que falham**

```ts
// src/i18n/t.test.ts
expect(t('home.pastePlaceholder')).toBe('Cole o link do YouTube');
expect(t('dj.combo', { n: 5 })).toBe('Tá on fire, x5!');
// src/components/brand/DjBop.test.tsx
render(<DjBop expression="combo" size={64} />);
expect(screen.getByRole('img', { name: 'DJ Bop' })).toBeInTheDocument();
expect(document.querySelector('[data-expression="combo"]')).not.toBeNull();
```

- [ ] **Step 3:** Rode `npx vitest run src/i18n src/components/brand`. Esperado: FAIL, porque os módulos ainda não existem.
- [ ] **Step 4:** Implemente.
  - `pt-BR.ts` recebe as chaves usadas no plano, com as falas do DJ Bop copiadas do canvas:

    | Chave | Texto |
    |---|---|
    | `dj.hello` | "E aí! Bora aprender no beat?" |
    | `dj.hit` | "Isso aí, no beat!" |
    | `dj.miss` | "Quase! Solta o replay que você pega." |
    | `dj.combo` | "Tá on fire, x{n}!" |
    | `dj.record` | "Novo recorde! Você mandou muito." |
    | `dj.endGreat` | "Mandou bem!" |
    | `dj.endOk` | "Boa! Bora de novo?" |
    | `dj.endLow` | "Quase! Solta o replay que você pega." |

  - Os SVGs saem do canvas: as pranchas "DJ Bop refinado", "Logo" (opção 2) e "Ícone" (opção 2).
  - Os tokens ficam em `@theme`.
  - As fontes vêm de `next/font/google`: `Space_Grotesk` 500/700 e `Inter` 400/600/700.
  - `e2e/smoke.spec.ts` abre `/` e espera o logo com `aria-label` "hookbop". Até a Task 8, a página inicial é pública.
- [ ] **Step 5:** Rode `npx vitest run src/i18n src/components/brand` e `npx playwright test e2e/smoke.spec.ts`. Esperado: PASS.
- [ ] **Step 6:** Faça o commit com `git add -A`, incluindo `docs/` e `reports/`, e a mensagem `git commit -m "chore: scaffold hookbop app with brand tokens and i18n"`.

### Task 2: Links do YouTube

**Files:**
- Create: `src/lib/youtube/parseUrl.ts`
- Test: `src/lib/youtube/parseUrl.test.ts`

**Interfaces:**
- Produces:
  - `parseYouTubeId(input: string): string | null`, que devolve o id de 11 caracteres `[A-Za-z0-9_-]`
  - `extractYouTubeIdFromShare(p: { url?: string | null; text?: string | null; title?: string | null }): string | null`

- [ ] **Step 1: Teste que falha**

```ts
const id = 'dQw4w9WgXcQ';
for (const u of [
  `https://www.youtube.com/watch?v=${id}&t=42s`, `https://youtu.be/${id}?si=abc`,
  `https://m.youtube.com/watch?v=${id}`, `https://music.youtube.com/watch?v=${id}&list=RD1`,
  `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/embed/${id}`, `  ${id}  `,
]) expect(parseYouTubeId(u)).toBe(id);
expect(parseYouTubeId('https://www.youtube.com/playlist?list=PL123')).toBeNull();
expect(parseYouTubeId(`https://example.com/watch?v=${id}`)).toBeNull();
expect(parseYouTubeId('olha essa música')).toBeNull();
expect(extractYouTubeIdFromShare({ text: `Olha isso https://youtu.be/${id}` })).toBe(id);
```

- [ ] **Step 2:** Rode `npx vitest run src/lib/youtube`. Esperado: FAIL.
- [ ] **Step 3:** Implemente com `URL`. Os hosts aceitos são youtube.com, www, m, music, youtu.be e youtube-nocookie.com. Em `extractYouTubeIdFromShare`, procure a primeira URL em `url`, depois em `text` e por último em `title`.
- [ ] **Step 4:** Rode `npx vitest run src/lib/youtube`. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: parse youtube links"`

### Task 3: Letra LRC e relógio das linhas

**Files:**
- Create: `src/lib/lyrics/lrc.ts`
- Test: `src/lib/lyrics/lrc.test.ts`

**Interfaces:**
- Produces:
  - `parseLrc(lrc: string, totalDurationMs?: number): LyricLine[]`
  - `applyOffset(lines: LyricLine[], offsetMs: number): LyricLine[]`
  - `activeLineIndex(lines: LyricLine[], timeMs: number): number`, que devolve -1 fora de qualquer linha

- [ ] **Step 1: Teste que falha**

```ts
const a = parseLrc('[ar:X]\n[00:12.34]Hello\n[00:15.00]World', 20000);
expect(a).toEqual([
  { index: 0, startMs: 12340, endMs: 15000, text: 'Hello' },
  { index: 1, startMs: 15000, endMs: 20000, text: 'World' }]);
expect(parseLrc('[01:02.345]X')[0].startMs).toBe(62345);
expect(parseLrc('[01:02.345]X')[0].endMs).toBe(67345);            // sem duração: +5000
expect(parseLrc('[00:40.00][00:10.00]Chorus').map(l => l.startMs)).toEqual([10000, 40000]);
const gap = parseLrc('[00:10.00]A\n[00:12.00]\n[00:30.00]B');
expect(gap.map(l => [l.text, l.endMs])).toEqual([['A', 12000], ['B', 35000]]);
expect(gap[1].index).toBe(1);
expect(applyOffset(a, 2000)[0]).toMatchObject({ startMs: 14340, endMs: 17000 });
expect(applyOffset(a, -20000)[0].startMs).toBe(0);
expect(activeLineIndex(a, 11000)).toBe(-1);
expect(activeLineIndex(a, 15000)).toBe(1);
expect(activeLineIndex(gap, 20000)).toBe(-1);
```

- [ ] **Step 2:** Rode `npx vitest run src/lib/lyrics/lrc.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implemente as regras:
  - Linhas vazias encerram a linha anterior e não aparecem no resultado.
  - Os índices são renumerados.
  - `activeLineIndex` usa busca binária.
- [ ] **Step 4:** Rode `npx vitest run src/lib/lyrics/lrc.test.ts`. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: parse synced lrc lyrics"`

### Task 4: Limpeza do título do vídeo

**Files:**
- Create: `src/lib/lyrics/cleanTitle.ts`
- Test: `src/lib/lyrics/cleanTitle.test.ts`

**Interfaces:**
- Produces: `cleanTitle(title: string, channel: string): { artist: string; track: string }`

- [ ] **Step 1: Teste que falha**

```ts
expect(cleanTitle('Artist Name - Song Title (Official Music Video)', 'ArtistNameVEVO')).toEqual({ artist: 'Artist Name', track: 'Song Title' });
expect(cleanTitle('Song Title', 'Artist Name - Topic')).toEqual({ artist: 'Artist Name', track: 'Song Title' });
expect(cleanTitle('Artist ft. Other - Song [Lyric Video]', 'Whatever')).toEqual({ artist: 'Artist', track: 'Song' });
expect(cleanTitle('Artist – Song (Official Audio) | 4K', 'X')).toEqual({ artist: 'Artist', track: 'Song' });
expect(cleanTitle('Song Title (feat. Other)', 'Artist')).toEqual({ artist: 'Artist', track: 'Song Title' });
expect(cleanTitle('Artista - Música (Clipe Oficial)', 'Y')).toEqual({ artist: 'Artista', track: 'Música' });
```

- [ ] **Step 2:** Rode `npx vitest run src/lib/lyrics/cleanTitle.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implemente as regras:
  - Remova os trechos entre `()` e `[]` que contenham official, video, audio, lyric(s), visualizer, hd, 4k, remaster, clipe, oficial, mv ou ao vivo, sem diferenciar maiúsculas.
  - Corte o que vier depois de ` | `.
  - Divida no primeiro ` - `, ` – ` ou ` — `.
  - Sem separador, o artista é o canal, sem " - Topic", "VEVO" e "Official".
  - Remova `ft.`, `feat.` e `featuring` e tudo o que vem depois, tanto no artista quanto na música.
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: clean youtube titles into artist and track"`

### Task 5: Fonte de letras (LRCLIB) atrás de uma interface

**Files:**
- Create: `src/lib/lyrics/source.ts`, `similarity.ts`, `pick.ts`, `lrclib.ts`
- Test: `src/lib/lyrics/pick.test.ts`, `src/lib/lyrics/lrclib.test.ts`

**Interfaces:**
- Produces, em `source.ts`:

```ts
export interface LyricsQuery { artist: string; track: string; durationS: number }
export interface LyricsResult { source: 'lrclib'; ref: string; syncedLrc: string; durationS: number; artist: string; track: string }
export type LyricsLookup = { status: 'found'; result: LyricsResult } | { status: 'not_found' } | { status: 'unavailable' };
export interface LyricsSource { find(q: LyricsQuery): Promise<LyricsLookup> }
```

- Produces também:
  - `diceSimilarity(a: string, b: string): number`, de 0 a 1, com texto normalizado: minúsculas, sem acentos e sem pontuação
  - `pickBestCandidate(cands: LrclibCandidate[], q: LyricsQuery): LrclibCandidate | null`
  - `createLrclibSource(opts: { fetch: typeof fetch; client: string; timeoutMs?: number }): LyricsSource`, com `timeoutMs` padrão de 6000
  - `LrclibCandidate = { id: number; trackName: string; artistName: string; duration: number; syncedLyrics: string | null }`

- [ ] **Step 1: Teste que falha (pick)**

```ts
const base = { trackName: 'Song', artistName: 'Artist', syncedLyrics: '[00:01.00]x' };
const q = { artist: 'Artist', track: 'Song', durationS: 200 };
expect(pickBestCandidate([{ ...base, id: 1, duration: 175 }, { ...base, id: 2, duration: 201 }], q)?.id).toBe(2);
expect(pickBestCandidate([{ ...base, id: 3, duration: 200, syncedLyrics: null }], q)).toBeNull();
expect(pickBestCandidate([{ ...base, id: 4, trackName: 'Completely Other', duration: 200 }], q)).toBeNull();
```

- [ ] **Step 2: Teste que falha (lrclib, com fetch falso e `vi.useFakeTimers`)**
  - Quando `/api/get` devolve 404 e `/api/search` devolve candidatos, o resultado tem `status: 'found'` e `ref: '2'`.
  - Quando os dois devolvem `[]` ou 404, o resultado é `{ status: 'not_found' }`.
  - Quando as duas chamadas nunca respondem, depois de `vi.advanceTimersByTime(6000)` o resultado é `{ status: 'unavailable' }` (Review Focus 1).
  - Quando a busca devolve 503, o resultado é `{ status: 'unavailable' }`.
  - Toda chamada leva o cabeçalho `Lrclib-Client` igual a `opts.client`.
- [ ] **Step 3:** Rode `npx vitest run src/lib/lyrics/pick.test.ts src/lib/lyrics/lrclib.test.ts`. Esperado: FAIL.
- [ ] **Step 4:** Implemente.
  - Pontuação de cada candidato: 0,5 × semelhança da música + 0,3 × semelhança do artista + 0,2 × `max(0, 1 - |duração - alvo| / 30)`.
  - O candidato só é aceito se a semelhança da música for ≥ 0,6. Em caso de empate, ganha a menor diferença de duração.
  - O LRCLIB recebe duas chamadas em paralelo: `https://lrclib.net/api/get?artist_name=&track_name=&duration=` e `https://lrclib.net/api/search?track_name=&artist_name=`.
  - Use `AbortController` para o tempo limite.
- [ ] **Step 5:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 6:** `git commit -m "feat: lrclib lyrics source with candidate scoring and timeout"`

### Task 6: Ajuste de tempo (offset)

**Files:**
- Create: `src/lib/lyrics/offset.ts`
- Test: `src/lib/lyrics/offset.test.ts`

**Interfaces:**
- Produces:
  - `needsCalibration(videoDurationS: number, lyricsDurationS: number): boolean`, verdadeiro quando o vídeo é mais de 10 s mais longo
  - `medianOffset(votesMs: number[]): number`

- [ ] **Step 1: Teste que falha**

```ts
expect(needsCalibration(201, 175)).toBe(true);
expect(needsCalibration(185, 175)).toBe(false);
expect(medianOffset([])).toBe(0);
expect(medianOffset([26000, 25500, 40000])).toBe(26000);
expect(medianOffset([1000, 2000])).toBe(1500);
```

- [ ] **Step 2:** Rode `npx vitest run src/lib/lyrics/offset.test.ts`. Esperado: FAIL. Depois implemente e rode de novo. Esperado: PASS.
- [ ] **Step 3:** `git commit -m "feat: offset calibration helpers"`

### Task 7: Banco de dados, regras de acesso e convites no banco

**Files:**
- Create: `supabase/` (`npx supabase init`), `supabase/migrations/0001_core.sql`, `supabase/tests/database/core.test.sql`, `supabase/seed.sql`
- Create: `src/lib/supabase/database.types.ts`, gerado com `npx supabase gen types typescript --local`

**Interfaces:**
- Produces, no Postgres, schema `public`:
  - `app_config(key text pk, value text)`. O seed recebe `('owner_email', '<e-mail do dono>')`, que o dono preenche, e `('member_cap', '50')`.
  - `profiles(id uuid pk → auth.users, display_name text not null, is_owner bool default false, created_at timestamptz default now(), removed_at timestamptz null)`
  - `invites(code text pk, created_by uuid → profiles, created_at, used_by uuid null → profiles, used_at timestamptz null)`
  - `videos(youtube_id text pk, title text, channel text, duration_s int, yt_fetched_at timestamptz, status text check in ('ok','no_lyrics'), lyrics_source text, lyrics_ref text, lyrics_lrc text, lyrics_duration_s int, offset_ms int default 0, updated_at timestamptz default now())`
  - `video_offset_votes(youtube_id text → videos, user_id uuid → profiles, offset_ms int, created_at, pk(youtube_id, user_id))`
  - `plays(id uuid pk default gen_random_uuid(), user_id uuid → profiles, youtube_id text → videos, mode text, difficulty text, total_blanks int, first_try_correct int, pct int, max_combo int, xp int, double_xp_used bool default false, time_to_ready_ms int, created_at timestamptz default now())`
  - `answers(play_id uuid → plays on delete cascade, blank_id text, kind text check in ('first','retry','helped'), correct bool, before_line_end bool)`
  - `line_help(youtube_id text, lyrics_ref text, line_index int, kind text check in ('explain','translate'), target text default '', content text, created_at, pk(youtube_id, lyrics_ref, line_index, kind, target))`
  - `help_requests(id bigserial pk, user_id uuid, created_at timestamptz default now())`
  - Funções `security definer`:
    - `is_member() returns bool`: verdadeiro quando existe perfil do `auth.uid()` com `removed_at` nulo
    - `ensure_owner() returns bool`: cria o perfil `is_owner = true` se o e-mail de `auth.jwt()` for igual a `owner_email`
    - `redeem_invite(p_code text, p_display_name text) returns text`: devolve `'ok' | 'already_member' | 'used' | 'full' | 'not_found' | 'removed'`. Usa `pg_advisory_xact_lock` para que duas pessoas não usem o mesmo código ao mesmo tempo e para respeitar `member_cap`.
    - `set_offset_vote(p_youtube_id text, p_offset_ms int) returns int`: grava o voto, recalcula a mediana em `videos.offset_ms` e devolve a mediana
    - `remove_member(p_user uuid) returns void`: só o dono pode chamar
  - Regras de acesso (RLS):
    - Membros leem `profiles`, `videos`, `plays` e `line_help`.
    - Cada um insere e lê os próprios `plays` e `answers`.
    - Membros inserem e atualizam `videos`.
    - Ninguém escreve direto em `invites`, a não ser o próprio membro, que pode criar um convite com `created_by = auth.uid()`.
    - `line_help` e `help_requests` só são escritos pela chave de serviço.

- [ ] **Step 1: Escreva os testes do banco em pgTAP** (`core.test.sql`):
  - `redeem_invite` devolve `'ok'` para um código novo.
  - Um segundo usuário com o mesmo código recebe `'used'` (Review Focus 5).
  - Com 50 perfis ativos, o resultado é `'full'`.
  - Para quem já é membro, o resultado é `'already_member'`.
  - Para um perfil removido, o resultado é `'removed'`.
  - Para um código inexistente, o resultado é `'not_found'`.
  - Depois dos votos 26000, 25500 e 40000, `set_offset_vote` devolve 26000.
  - Um não membro não consegue fazer `select` em `videos`.
- [ ] **Step 2:** Rode `npx supabase start` e depois `npx supabase test db`. Esperado: FAIL, porque as tabelas ainda não existem.
- [ ] **Step 3:** Escreva `0001_core.sql` e `seed.sql`. Depois rode `npx supabase db reset` e gere os tipos.
- [ ] **Step 4:** Rode `npx supabase test db`. Esperado: todos os testes passam.
- [ ] **Step 5:** `git commit -m "feat: database schema, rls and invite redemption"`

### Task 8: Login e acesso só para membros

**Files:**
- Create: `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts`, `src/middleware.ts`, `src/lib/auth/paths.ts`
- Create: `src/app/entrar/page.tsx`, `src/app/auth/callback/route.ts`
- Modify: `e2e/smoke.spec.ts`. Como agora `/` exige login, o teste passa a abrir `/entrar` e esperar o logo.
- Test: `src/lib/auth/paths.test.ts`, `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: as funções da Task 7 (`ensure_owner`, `redeem_invite`, `is_member`).
- Produces:
  - `createBrowserSupabase()`
  - `createServerSupabase()`
  - `isPublicPath(pathname: string): boolean`
  - O cookie `hb_invite`, httpOnly, com 7 dias, que guarda o código de convite pendente.

- [ ] **Step 1: Teste que falha**

```ts
for (const p of ['/entrar', '/auth/callback', '/convite/ABC123', '/manifest.webmanifest', '/sw.js', '/icons/icon-192.png'])
  expect(isPublicPath(p)).toBe(true);
for (const p of ['/', '/jogar/dQw4w9WgXcQ', '/convidar', '/admin', '/api/help']) expect(isPublicPath(p)).toBe(false);
```

  E em `e2e/auth.spec.ts`: sem sessão, abrir `/` redireciona para `/entrar`.
- [ ] **Step 2:** Rode `npx vitest run src/lib/auth` e `npx playwright test e2e/auth.spec.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
  - **Middleware:** renova a sessão com `@supabase/ssr` e protege as rotas.
    - Rota não pública e sem sessão: manda para `/entrar`.
    - Rota não pública, com sessão, mas `is_member()` falso: manda para `/entrar?estado=sem-convite`.
  - **`/entrar`:** mostra o logo e dois botões:
    - "Entrar com Google", com `signInWithOAuth` e retorno para `/auth/callback`;
    - "Receber link por e-mail", com `signInWithOtp`.
  - **Callback:** troca o código pela sessão e chama `ensure_owner()`.
    - Se o cookie `hb_invite` existir, chama `redeem_invite(code, nome do perfil Google ou parte do e-mail antes do @)`, apaga o cookie e redireciona conforme o resultado.
    - Com `ok`, `already_member` ou dono, vai para `/`.
    - Com outro resultado, vai para `/entrar?estado=<resultado>`.
  - **Mensagens de `/entrar?estado=`:**

    | Estado | Mensagem |
    |---|---|
    | `sem-convite` | "Pede um convite pra quem te mandou." |
    | `used` | "Pede um convite pra quem te mandou." |
    | `full` | "A galera tá cheia por enquanto." |
    | `removed` | "Seu acesso foi pausado." |
    | `not_found` | "Esse convite não existe." |

- [ ] **Step 4:** Rode os dois comandos de novo. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: sign-in with google and email, member-only access"`

### Task 9: Convites, QR code e administração

**Files:**
- Create: `src/lib/supabase/invites.ts`, `src/app/convite/[code]/page.tsx`, `src/app/convite/[code]/route.ts` (o POST que guarda o cookie), `src/app/convidar/page.tsx`, `src/app/admin/page.tsx`
- Test: `src/lib/supabase/invites.test.ts`, `e2e/invite.spec.ts`

**Interfaces:**
- Consumes: a tabela `invites`, `redeem_invite` e `remove_member` (Task 7), e o cookie `hb_invite` (Task 8).
- Produces:
  - `generateInviteCode(): string`, com 10 caracteres do alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789`
  - `inviteUrl(code: string, baseUrl: string): string`, que devolve `${baseUrl}/convite/${code}`
  - `whatsappInviteUrl(code: string, baseUrl: string): string`

- [ ] **Step 1: Teste que falha**

```ts
expect(generateInviteCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
expect(whatsappInviteUrl('ABCDEFGH23', 'https://hookbop.app')).toBe(
  'https://wa.me/?text=' + encodeURIComponent('Bora jogar Hookbop comigo? Aprende inglês com música. Seu convite: https://hookbop.app/convite/ABCDEFGH23'));
```

  E em `e2e/invite.spec.ts`: abrir `/convite/NAOEXISTE1` sem sessão mostra "Esse convite não existe.". Com um código válido criado pelo seed de teste, a tela mostra o DJ Bop, "O {nome} te chamou pro Hookbop" e o botão "Entrar". Com um código já usado, mostra "Pede um convite pra quem te mandou." (Review Focus 5).
- [ ] **Step 2:** Rode `npx vitest run src/lib/supabase/invites.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
  - **`/convite/[code]`:** é uma página de servidor. Ela consulta o código com a chave de serviço e lê só o estado do convite e o nome de quem convidou.
    - Código inexistente: "Esse convite não existe."
    - Código já usado: "Pede um convite pra quem te mandou."
    - Código válido: o DJ Bop com a frase "O {nome} te chamou pro Hookbop" e o botão "Entrar". O botão faz POST para a rota, que grava `hb_invite` e manda para `/entrar`.
  - **`/convidar`:** o botão "Criar convite" insere um código novo. A tela mostra:
    - os botões "Mandar no WhatsApp", que usa `whatsappInviteUrl`, e "Copiar link";
    - o QR code em SVG, feito com `qrcode.toString(url, { type: 'svg' })`;
    - a lista dos meus convites, com "esperando" ou o nome de quem usou.
  - **`/admin`:** só para o dono. Lista os membros e tem o botão "Remover", que chama `remove_member`. O limite de 50 aparece como "N de 50".
  - **URL base:** vem de `NEXT_PUBLIC_APP_URL`.
- [ ] **Step 4:** Rode o mesmo comando e também `npx playwright test e2e/invite.spec.ts`. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: personal invites with whatsapp and qr, owner admin"`

### Task 10: Player do YouTube atrás de uma interface

**Files:**
- Create: `src/lib/player/adapter.ts`, `youtubeAdapter.ts`, `fakeAdapter.ts`, `usePlayerTime.ts`
- Test: `src/lib/player/fakeAdapter.test.ts`, `src/lib/player/youtubeAdapter.test.ts` (só o mapeamento de erros)

**Interfaces:**
- Produces, em `adapter.ts`:

```ts
export type PlayerState = 'unstarted' | 'playing' | 'paused' | 'buffering' | 'ended';
export type PlayerError = 'not_embeddable' | 'not_found' | 'other';
export interface PlayerAdapter {
  getCurrentTimeMs(): number; getDurationMs(): number;
  play(): void; pause(): void; seekTo(ms: number): void; setRate(rate: 0.75 | 1): void;
  onState(cb: (s: PlayerState) => void): () => void; onError(cb: (e: PlayerError) => void): () => void; destroy(): void;
}
```

- Produces também:
  - `mapYouTubeError(code: number): PlayerError`, em `youtubeAdapter.ts`
  - `createYouTubeAdapter(el: HTMLElement, videoId: string): Promise<PlayerAdapter>`
  - `class FakePlayerAdapter implements PlayerAdapter`, com os métodos de teste `advance(ms: number)`, `emitState(s)`, `emitError(e)` e a lista `calls: string[]`, que registra `'play'`, `'pause'` e `'seek:<ms>'`
  - `usePlayerTime(adapter: PlayerAdapter | null, intervalMs = 100): number`

- [ ] **Step 1: Teste que falha**

```ts
expect(mapYouTubeError(101)).toBe('not_embeddable');
expect(mapYouTubeError(150)).toBe('not_embeddable');
expect(mapYouTubeError(100)).toBe('not_found');
expect(mapYouTubeError(2)).toBe('other');
const p = new FakePlayerAdapter(180000); p.play(); p.advance(5000);
expect(p.getCurrentTimeMs()).toBe(5000); p.seekTo(1000);
expect(p.calls).toEqual(['play', 'seek:1000']);
```

- [ ] **Step 2:** Rode `npx vitest run src/lib/player`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
  - Carregue `https://www.youtube.com/iframe_api` uma única vez.
  - Crie o player com `host: 'https://www.youtube-nocookie.com'` e `playerVars: { autoplay: 0, playsinline: 1, rel: 0, controls: 1 }`.
  - `onError` usa `mapYouTubeError`.
  - O falso só avança o tempo quando está no estado `playing`.
- [ ] **Step 4:** Rode `npx vitest run src/lib/player`. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: youtube player adapter and fake player for tests"`

### Task 11: Resolver a música (memória, metadados e letra)

**Files:**
- Create: `src/lib/lyrics/resolveSong.ts`, `src/lib/supabase/songStore.ts`, `src/app/api/yt/meta/route.ts`
- Test: `src/lib/lyrics/resolveSong.test.ts`

**Interfaces:**
- Consumes: `cleanTitle` (Task 4), `LyricsSource` (Task 5), `needsCalibration` (Task 6), `parseLrc` e `applyOffset` (Task 3), e a tabela `videos` (Task 7).
- Produces:

```ts
export interface VideoRecord { youtubeId: string; title: string; channel: string; durationS: number; ytFetchedAt: string;
  status: 'ok' | 'no_lyrics'; lyricsSource?: string; lyricsRef?: string; lyricsLrc?: string; lyricsDurationS?: number; offsetMs: number }
export interface SongStore { getVideo(id: string): Promise<VideoRecord | null>; upsertVideo(v: VideoRecord): Promise<void> }
export type VideoMeta = { title: string; channel: string };
export type SongResolution =
  | { status: 'ready'; video: VideoRecord; lines: LyricLine[]; needsCalibration: boolean }
  | { status: 'no_lyrics'; video: VideoRecord } | { status: 'lyrics_unavailable' } | { status: 'video_unavailable' };
export function resolveSong(youtubeId: string, videoDurationS: number,
  deps: { store: SongStore; meta: (id: string) => Promise<VideoMeta | null>; lyrics: LyricsSource; now: () => Date }): Promise<SongResolution>;
```

- Produces também: `GET /api/yt/meta?id=` → `{ title, channel }` ou 404. A rota consulta, no servidor, `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json` e usa `author_name` como canal. Resposta 401 ou 404 do oEmbed vira 404.

- [ ] **Step 1: Teste que falha, com store, meta e lyrics falsos**
  - Um vídeo `ok` guardado e com metadados de menos de 30 dias devolve `ready`, sem chamar `lyrics.find` nem `meta`.
  - Com metadados de 31 dias, o app chama `meta` e salva o novo `ytFetchedAt`.
  - Um vídeo novo chama `meta` e depois `lyrics.find` com `{artist, track, durationS}`, e salva com `status: 'ok'`.
  - Com `meta` nulo, o resultado é `video_unavailable` (Review Focus 2).
  - Com letra `not_found`, o app salva `status: 'no_lyrics'` e devolve `no_lyrics`.
  - Com letra `unavailable`, o resultado é `lyrics_unavailable` e `upsertVideo` não é chamado (Review Focus 1).
  - Um vídeo de 201 s com letra de 175 s devolve `needsCalibration: true`.
  - O `offsetMs` guardado já vem aplicado nas `lines`.
- [ ] **Step 2:** Rode `npx vitest run src/lib/lyrics/resolveSong.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implemente `resolveSong`, a implementação Supabase de `SongStore` e a rota de metadados.
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: resolve songs from cache, youtube oembed and lyrics source"`

### Task 12: Lacunas por regra

**Files:**
- Create: `src/lib/game/rng.ts`, `src/lib/game/blanks.ts`, `src/lib/game/data/stopwords.json`, `phrasal-verbs.json`, `contractions.json`
- Test: `src/lib/game/blanks.test.ts`

**Interfaces:**
- Produces:
  - `seededRng(seed: string): () => number`, com mulberry32 sobre o hash FNV-1a da semente
  - `tokenize(text: string): string[]`, que separa palavras e mantém o apóstrofo, por exemplo `don't` e `'cause`
  - `selectBlanks(lines: LyricLine[], difficulty: Difficulty, seed: string): Blank[]`, com `id = \`${lineIndex}:${tokenIndex}\``
- Data:
  - `stopwords.json` inclui pelo menos: a, an, the, in, on, at, to, of, for, with, by, from, and, or, but, i, you, he, she, it, we, they, me, him, her, us, them, my, your, is, am, are.
  - `phrasal-verbs.json` é uma lista de pares `[verbo, partícula]` e inclui pelo menos: let/down, figure/out, give/up, get/over, hold/on, turn/up, break/down, move/on, come/back, run/away, wake/up, look/up.
  - `contractions.json` traz: gonna, wanna, gotta, ain't, 'cause, y'all, lemme, gimme, kinda, outta.

- [ ] **Step 1: Teste que falha**
  - Com a mesma entrada, o resultado é igual.
  - A linha "Please don't let me down again" escolhe `answer: 'let'`, porque phrasal verb tem prioridade.
  - "I'm gonna make it tonight" escolhe `'gonna'`.
  - "Oh yeah I love the way you move" nunca escolhe oh, yeah, i, the ou you.
  - Em "Dancing with Maria tonight", "Maria" nunca é escolhida, porque palavra com maiúscula no meio da linha é nome próprio.
  - Linhas com menos de 1200 ms ou mais de 15000 ms nunca recebem lacuna.
  - Com 30 linhas elegíveis, `facil` dá 10 ±1 lacunas, `medio` dá 15 ±1 e `dificil` dá pelo menos 30.
  - Em `dificil`, uma linha com 8 palavras ou mais recebe 2 lacunas.
- [ ] **Step 2:** Rode `npx vitest run src/lib/game/blanks.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
  - **Ad-libs:** a palavra é descartada se casar com `/^(oh+|ooh+|yeah+|ya+|la+|na+|uh+|hey|woah|whoa|ah+|mm+|ha+)$/i`.
  - **Ordem de preferência dentro da linha:**
    1. verbo de um phrasal verb da lista, com a partícula aparecendo depois na mesma linha;
    2. contração da lista;
    3. palavra de conteúdo com 3 letras ou mais.
  - **Quais linhas recebem lacuna:** sorteio com o RNG, numa proporção de 1/3 em `facil`, 1/2 em `medio` e todas em `dificil`.
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: rule-based blank selection by difficulty"`

### Task 13: Opções erradas do modo Escolha

**Files:**
- Create: `src/lib/game/editDistance.ts`, `src/lib/game/words.ts`, `src/lib/game/distractors.ts`
- Test: `src/lib/game/editDistance.test.ts`, `src/lib/game/distractors.test.ts`

**Interfaces:**
- Produces:
  - `damerau(a: string, b: string): number`, a distância de Damerau-Levenshtein com transposição de letras vizinhas
  - `isRealWord(w: string): boolean`, que usa `wordlist-english` (níveis 10 a 50) mais `contractions.json`
  - `distractorPool(): string[]`, com os níveis 10 a 35
  - `makeDistractors(answer: string, lineTokens: string[], seed: string): [string, string]`

- [ ] **Step 1: Teste que falha**

```ts
expect(damerau('get', 'gte')).toBe(1); expect(damerau('get', 'got')).toBe(1); expect(damerau('let', 'late')).toBe(2);
const d = makeDistractors('let', ['please', "don't", 'let', 'me', 'down'], 's1');
expect(new Set(d).size).toBe(2);
for (const w of d) { expect(w).not.toBe('let'); expect(isRealWord(w)).toBe(true);
  expect(['lets', "let's", 'letting', 'me', 'down']).not.toContain(w); }
expect(makeDistractors('let', [], 's1')).toEqual(makeDistractors('let', [], 's1'));
expect(makeDistractors('gonna', [], 's2')).toHaveLength(2);
```

- [ ] **Step 2:** Rode `npx vitest run src/lib/game/editDistance.test.ts src/lib/game/distractors.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
  - **Candidatos:** palavras do pool, diferentes da resposta, fora da linha e sem ser a resposta com s, 's, ed ou ing.
  - **Tamanho:** até 2 letras de diferença para a resposta.
  - **Ordem de preferência:**
    1. mesmo código fonético primário (`double-metaphone`);
    2. depois, menor `damerau` entre 1 e 3.
  - **Desempate e reserva:** desempate com o RNG semeado. Se faltarem candidatos, sorteie palavras do pool com o mesmo tamanho.
  - Confira a licença do `wordlist-english` (SCOWL) ao instalar.
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: sound-alike distractors for choice mode"`

### Task 14: Digitação tolerante

**Files:**
- Create: `src/lib/game/typo.ts`
- Test: `src/lib/game/typo.test.ts`

**Interfaces:**
- Consumes: `damerau` e `isRealWord` (Task 13).
- Produces:
  - `normalizeTyped(s: string): string`
  - `matchTyped(input: string, answer: string): { result: 'exact' | 'corrected' | 'wrong'; correctedIndices: number[] }`, em que `correctedIndices` são as posições das letras da resposta que foram arrumadas

- [ ] **Step 1: Teste que falha (inclui o Review Focus 4)**

```ts
expect(matchTyped('get', 'get').result).toBe('exact');
expect(matchTyped('Get ', 'get').result).toBe('exact');
expect(matchTyped('don’t', "don't").result).toBe('exact');
expect(matchTyped('get.', 'get').result).toBe('exact');
expect(matchTyped('gte', 'get')).toEqual({ result: 'corrected', correctedIndices: [1, 2] });
expect(matchTyped('dont', "don't")).toEqual({ result: 'corrected', correctedIndices: [3] });
expect(matchTyped('got', 'get').result).toBe('wrong');      // palavra real: é erro
expect(matchTyped('a', 'I').result).toBe('wrong');          // respostas de até 2 letras: só exato
expect(matchTyped('', 'get').result).toBe('wrong');
```

- [ ] **Step 2:** Rode `npx vitest run src/lib/game/typo.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implemente a normalização: minúsculas, `trim`, troca de ’ e ‘ por ' e remoção de `.,!?;:` no fim. A correção é aceita quando a resposta tem 3 letras ou mais, `damerau` é igual a 1 e `!isRealWord(input)`.
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: typo-tolerant typing match"`

### Task 15: Peças do Monte o verso

**Files:**
- Create: `src/lib/game/tiles.ts`
- Test: `src/lib/game/tiles.test.ts`

**Interfaces:**
- Consumes: `tokenize` (Task 12) e `seededRng`.
- Produces:
  - `eligibleForTiles(tokens: string[]): boolean`, verdadeiro com 3 a 9 palavras
  - `makeTiles(tokens: string[], seed: string): string[]`
  - `isNextTileCorrect(tokens: string[], placedCount: number, word: string): boolean`
  - `selectTileLines(lines: LyricLine[], difficulty: Difficulty, seed: string): Blank[]`, em que cada linha vira um `Blank` com `tokenIndex = -1` e `answer = tokens.join(' ')`

- [ ] **Step 1: Teste que falha**

```ts
const tk = tokenize('Please, don\'t let me down!');
expect(tk).toEqual(['Please', "don't", 'let', 'me', 'down']);
const t = makeTiles(tk, 's'); expect([...t].sort()).toEqual([...tk].sort()); expect(t).not.toEqual(tk);
expect(isNextTileCorrect(['go', 'go', 'now'], 0, 'go')).toBe(true);
expect(isNextTileCorrect(['go', 'go', 'now'], 1, 'go')).toBe(true);
expect(isNextTileCorrect(['go', 'go', 'now'], 1, 'now')).toBe(false);
expect(eligibleForTiles(['a', 'b'])).toBe(false);
```

  Em `selectTileLines`, use as mesmas proporções por dificuldade da Task 12 e as mesmas regras de duração de linha.
- [ ] **Step 2:** Rode `npx vitest run src/lib/game/tiles.test.ts`. Esperado: FAIL. Depois implemente. Se o embaralhamento sair igual à ordem original, embaralhe de novo, no máximo 5 vezes. Se mesmo assim sair igual, a linha não é elegível. Rode de novo. Esperado: PASS.
- [ ] **Step 3:** `git commit -m "feat: tiles for build-the-line mode"`

### Task 16: Pontuação, direitos de uso e som

**Files:**
- Create: `src/lib/game/scoring.ts`, `src/lib/entitlements.ts`, `src/lib/game/sfx.ts`, `src/lib/settings.ts`
- Test: `src/lib/game/scoring.test.ts`, `src/lib/entitlements.test.ts`, `src/lib/game/sfx.test.ts`, `src/lib/settings.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ScoreState { combo: number; maxCombo: number; xp: number; firstTryCorrect: number; totalBlanks: number; records: AnswerRecord[] }
export function createScore(totalBlanks: number): ScoreState;
export function recordAnswer(s: ScoreState, r: AnswerRecord, mode: Mode): ScoreState;
export function comboMultiplier(combo: number): number;            // 1 + 0.5*floor(combo/5), máx 3
export function summarize(s: ScoreState): PlaySummary;             // pct = round(firstTryCorrect/totalBlanks*100), 0 se total 0
export function repeatMultiplier(playsSameSongLast7Days: number): number; // 0→1, 1→0.5, 2→0.25, ≥3→0.1
export type Perk = 'hint' | 'double_xp' | 'streak_repair';
export function getEntitlements(phase: 'closed_beta' | 'public'): Record<Perk, 'free' | 'ad' | 'off'>;
export function hitFrequency(combo: number): number;               // 440 * 2^(min(combo,12)/12)
export interface Settings { alwaysShowTranslation: boolean; autoRepeatOnMiss: boolean; sounds: boolean }
export function loadSettings(storage: Storage): Settings;          // padrão: false, true, true
export function saveSettings(storage: Storage, s: Settings): void;
```

- [ ] **Step 1: Teste que falha**

```ts
let s = createScore(12);
for (let i = 0; i < 5; i++) s = recordAnswer(s, { blankId: `${i}:0`, kind: 'first', correct: true, beforeLineEnd: false }, 'escolha');
expect(s.xp).toBe(55); expect(s.combo).toBe(5);
s = recordAnswer(s, { blankId: '5:0', kind: 'first', correct: true, beforeLineEnd: true }, 'escolha');
expect(s.xp).toBe(55 + 15 + 2);                                   // bônus de 2 por responder antes da linha acabar
s = recordAnswer(s, { blankId: '6:0', kind: 'first', correct: false, beforeLineEnd: false }, 'escolha');
expect(s.combo).toBe(0);
const xpBefore = s.xp;
s = recordAnswer(s, { blankId: '6:0', kind: 'retry', correct: true, beforeLineEnd: false }, 'escolha');
s = recordAnswer(s, { blankId: '7:0', kind: 'helped', correct: true, beforeLineEnd: false }, 'escolha');
expect(s.xp).toBe(xpBefore); expect(s.combo).toBe(0); expect(s.firstTryCorrect).toBe(6);
expect(summarize({ ...createScore(12), firstTryCorrect: 11 }).pct).toBe(92);
expect(recordAnswer(createScore(3), { blankId: '0:0', kind: 'first', correct: true, beforeLineEnd: true }, 'karaoke').xp).toBe(0);
expect([0, 1, 2, 3, 9].map(repeatMultiplier)).toEqual([1, 0.5, 0.25, 0.1, 0.1]);
expect(getEntitlements('closed_beta')).toEqual({ hint: 'free', double_xp: 'free', streak_repair: 'free' });
expect(hitFrequency(0)).toBe(440); expect(Math.round(hitFrequency(12))).toBe(880); expect(Math.round(hitFrequency(30))).toBe(880);
```

  Para as configurações, um storage vazio devolve `{ alwaysShowTranslation: false, autoRepeatOnMiss: true, sounds: true }`, e o que foi salvo volta igual. Se o storage lançar erro, `loadSettings` devolve o padrão.
- [ ] **Step 2:** Rode `npx vitest run src/lib/game/scoring.test.ts src/lib/entitlements.test.ts src/lib/game/sfx.test.ts src/lib/settings.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implemente. O XP de um acerto de primeira é `round(10 × comboMultiplier(comboDepois)) + (beforeLineEnd ? 2 : 0)`. Resposta `helped` não altera o combo.
  - Em `sfx.ts`, implemente também `playHit(combo: number)`, que toca uma onda senoidal de 120 ms na frequência `hitFrequency(combo)`, e `playMiss()`, que toca 220 Hz por 160 ms. Os dois usam a Web Audio API, não são testados e só tocam quando `settings.sounds` está ligado.
  - Quem chama `getEntitlements` passa `process.env.NEXT_PUBLIC_APP_PHASE` como fase. Essa função é o único lugar que decide o que está liberado.
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: scoring, entitlements, sfx and settings"`

### Task 17: Motor da partida (reducer)

**Files:**
- Create: `src/lib/game/reducer.ts`
- Test: `src/lib/game/reducer.test.ts`

**Interfaces:**
- Consumes: `LyricLine`, `Blank`, `Command` e `AnswerRecord` (tipos), `PlayerState` (Task 10), mais `ScoreState`, `createScore`, `recordAnswer` e `summarize` (Task 16) e `isNextTileCorrect` e `tokenize` (Tasks 15 e 12).
- Produces:

```ts
export type BlankStatus = 'pending' | 'skipped' | 'correct' | 'wrong';
export interface GameState { mode: Mode; lines: LyricLine[]; blanks: Blank[]; status: Record<string, BlankStatus>;
  attempted: Record<string, boolean>; hinted: Record<string, boolean>; tilesPlaced: Record<string, string[]>;
  phase: 'playing' | 'waiting' | 'ended'; waitingBlankId: string | null; lastTickMs: number; playerPlaying: boolean;
  autoRepeat: boolean; score: ScoreState; commands: Command[] }
export type GameEvent =
  | { type: 'TICK'; timeMs: number } | { type: 'PLAYER_STATE'; state: PlayerState }
  | { type: 'ANSWER'; blankId: string; correct: boolean; atMs: number }   // Escolha e Digitação: a tela decide se está certo
  | { type: 'TILE'; blankId: string; word: string; atMs: number }          // Monte o verso
  | { type: 'HINT'; blankId: string } | { type: 'REPEAT_LINE' } | { type: 'SET_RATE'; rate: 0.75 | 1 };
export function initGame(p: { mode: Mode; lines: LyricLine[]; blanks: Blank[]; autoRepeat: boolean }): GameState;
export function gameReducer(s: GameState, e: GameEvent): GameState;   // a cada evento, s.commands traz só os comandos novos
export function summaryOf(s: GameState): PlaySummary;
```

- [ ] **Step 1: Teste que falha.** Use 3 linhas: `[0–4000] "Please don't let me down"`, `[4000–8000]`, `[8000–12000]`, com a lacuna `0:2 'let'`.
  1. `TICK 3850` (falta menos de 150 ms para o fim da linha da lacuna pendente) gera `commands = [{type:'pause'}]` e `phase` passa a `'waiting'`.
  2. `ANSWER correct` com `atMs: 3900` grava `{kind:'first', correct:true, beforeLineEnd:true}`, gera `commands = [{type:'play'}]` e volta `phase` para `'playing'`.
  3. Num jogo novo, `ANSWER wrong` com `autoRepeat` ligado gera `commands = [{type:'seek', ms:0}, {type:'play'}]` e status `'wrong'`. Um novo `ANSWER correct` na mesma lacuna grava `kind: 'retry'`, e o XP não muda.
  4. `HINT` seguido de `ANSWER correct` grava `kind: 'helped'`.
  5. Review Focus 3: depois de `TICK 1000`, um `TICK 9000` (salto à frente de mais de 1500 ms) marca `0:2` como `'skipped'` e não gera pausa. Depois, `TICK 500` (voltou) seguido de `ANSWER correct` grava `kind: 'first'`. No resumo, `totalBlanks` é igual ao número de lacunas, contando as puladas.
  6. `PLAYER_STATE paused` seguido de `TICK 3850` não gera comando de pausa, porque o player já está parado.
  7. `PLAYER_STATE ended` passa `phase` para `'ended'`, e `summaryOf` devolve a porcentagem certa.
  8. No modo `karaoke`, nenhum `TICK` gera pausa.
  9. No modo `montar`, com a lacuna `0:-1`:
     - colocar `TILE` "Please", "don't", "let", "me", "down" na ordem certa deixa a linha `'correct'`, com `kind: 'first'`;
     - num jogo novo, um `TILE` errado deixa a linha `'wrong'` e repete o verso;
     - num jogo novo, `HINT` coloca sozinho a próxima peça certa (`tilesPlaced['0:-1']` passa a ser `['Please']`), e ao completar a linha o registro tem `kind: 'helped'`.
  10. `REPEAT_LINE` com o tempo em 5000 gera `seek` para o início da linha 1, ou seja, 4000.
  11. `SET_RATE` gera `{type:'rate', rate}`.
- [ ] **Step 2:** Rode `npx vitest run src/lib/game/reducer.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implemente o reducer como função pura. Ele não toca no player: só devolve `commands`.
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: game reducer with pause, retry, hint and seek handling"`

### Task 18: Tela da música (carregar, calibrar e escolher o modo)

**Files:**
- Create: `src/app/jogar/[youtubeId]/page.tsx`, `src/components/game/SongScreen.tsx`, `CalibrationSheet.tsx`, `ModePicker.tsx`
- Test: `src/components/game/SongScreen.test.tsx`, `src/components/game/CalibrationSheet.test.tsx`

**Interfaces:**
- Consumes: `resolveSong` (Task 11), `createYouTubeAdapter` e `FakePlayerAdapter` (Task 10), `selectBlanks` (Task 12), `selectTileLines` (Task 15), `set_offset_vote` (Task 7) e `<DjBop>` (Task 1).
- Produces:
  - `<SongScreen youtubeId={string} deps={SongScreenDeps} />`. As dependências são injetáveis: `resolve`, `createAdapter` e `saveOffsetVote`.
  - `<GameScreen>` é chamado com `{ adapter, mode, difficulty, lines, blanks, video }` (Task 19).

- [ ] **Step 1: Teste que falha**
  - Com `resolve` devolvendo `lyrics_unavailable`, a tela mostra "O banco de letras tá lento. Tenta de novo?" e o botão "Tentar de novo" chama `resolve` outra vez (Review Focus 1).
  - Quando o adaptador emite `not_embeddable`, a tela mostra "Esse clipe não toca fora do YouTube." e o botão "Colar outro link" (Review Focus 2).
  - Com `no_lyrics`, a tela mostra "Ainda não temos a letra dessa." e o link "Procurar a versão áudio oficial". O link abre, numa nova aba, `https://www.youtube.com/results?search_query=` mais `encodeURIComponent(\`${artist} ${track} official audio\`)`, para o jogador achar o vídeo e colar ou compartilhar de volta. A busca é no próprio site do YouTube e não usa a cota da API.
  - Na calibração, aparece o mesmo link, como "Trocar para a versão áudio oficial".
  - Com `ready` e `needsCalibration`, a tela mostra a calibração. No `CalibrationSheet`, com o player falso em 26000 ms e a primeira linha em 300 ms:
    - tocar em "Começou!" e depois em "Salvar" chama `saveOffsetVote(id, 25700)`;
    - os botões "−0,5 s" e "+0,5 s" mudam o valor em ±500 antes de salvar.
  - Com `ready` sem calibração, a tela mostra o `ModePicker` com os 4 modos e as dificuldades Fácil, Médio e Difícil. Escolher "Escolha" e "Médio" monta o `GameScreen` com as lacunas de `selectBlanks(lines, 'medio', youtubeId)`.
- [ ] **Step 2:** Rode `npx vitest run src/components/game/SongScreen.test.tsx src/components/game/CalibrationSheet.test.tsx`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
  - O player fica montado durante todos os estados, num contêiner `aspect-ratio: 16/9; min-height: 200px; width: 100%`, sem nada por cima.
  - O carregamento mostra o DJ Bop e o texto "Procurando a letra...".
  - O app mede o tempo desde a abertura da tela até ficar pronta (`timeToReadyMs`) e passa esse valor adiante para o salvamento da partida (Task 24).
  - O visual segue os wireframes "Escolher o modo" e as cores da marca.
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: song screen with loading, calibration and mode picker"`

### Task 19: Tela de jogo, painel da letra, ferramentas e modo Escolha

**Files:**
- Create: `src/components/game/GameScreen.tsx`, `LyricPanel.tsx`, `ToolsBar.tsx`, `SettingsSheet.tsx`, `EscolhaArea.tsx`
- Test: `src/components/game/EscolhaArea.test.tsx`, `src/components/game/GameScreen.test.tsx`

**Interfaces:**
- Consumes: `gameReducer`, `initGame` e `summaryOf` (Task 17), `usePlayerTime` (Task 10), `makeDistractors` (Task 13), `getEntitlements`, `loadSettings`, `playHit` e `playMiss` (Task 16), e `<DjBop>`.
- Produces:
  - `<GameScreen ... onEnd={(summary: PlaySummary, records: AnswerRecord[]) => void} />`
  - `<LyricPanel lines current blanks status showTranslation onTranslate onExplain />`
  - `<ToolsBar onSlow onRepeat onHint hintPerk />`
  - `<EscolhaArea blank options onAnswer />`
  - Ponto de entrada para a Task 23: as props `onExplain(target: string)` e `onTranslate()` do `LyricPanel`.

- [ ] **Step 1: Teste que falha (EscolhaArea e GameScreen, com o player falso)**
  - Aparecem 3 botões de opção, e um deles é a resposta.
  - Clicar na resposta mostra um botão com o nome acessível "let, acertou", a classe `bg-lime` e o ícone ✓. Não pode existir nenhum texto visível contendo "Acertou" ou "Errou".
  - Clicar numa opção errada mostra "late, errou", com `bg-error`, e o player falso registra `seek:0` e `play`.
  - A ToolsBar mostra o botão "Dica" com borda tracejada. Com `hintPerk: 'free'`, ele elimina uma opção errada.
  - O botão "0.75x" faz o player falso registrar a velocidade 0.75.
  - Com `alwaysShowTranslation: false`, a tradução não aparece, e o botão "Traduzir verso" é visível.
  - Depois de `PLAYER_STATE ended`, `onEnd` é chamado com o resumo.
- [ ] **Step 2:** Rode `npx vitest run src/components/game/EscolhaArea.test.tsx src/components/game/GameScreen.test.tsx`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
  - O `GameScreen` repassa `usePlayerTime` como `TICK`, executa `state.commands` no adaptador e repassa `onState` como `PLAYER_STATE`.
  - O cabeçalho tem o botão de voltar, "[Música] · [Artista]", o nome do modo, a etiqueta de combo "xN" em limão e o DJ Bop pequeno. O DJ troca para "acertou" ou "errou" por 1 s e para "combo" quando o combo chega a um múltiplo de 5.
  - As opções do modo Escolha são `[answer, ...makeDistractors(...)]`, embaralhadas com a semente `blank.id + youtubeId`.
  - O `SettingsSheet` tem três chaves: "Mostrar tradução sempre", "Repetir sozinho depois de errar" e "Sons".
  - O layout segue o wireframe "Escolha" com a direção visual Limão.
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: game screen, lyric panel, tools and choice mode"`

### Task 20: Modo Digitação

**Files:**
- Create: `src/components/game/DigitacaoArea.tsx`
- Modify: `GameScreen.tsx` (escolhe a área pelo modo)
- Test: `src/components/game/DigitacaoArea.test.tsx`

**Interfaces:**
- Consumes: `matchTyped` (Task 14).
- Produces: `<DigitacaoArea blank onAnswer={(correct: boolean, correctedIndices: number[]) => void} />`

- [ ] **Step 1: Teste que falha**
  - O campo tem um `<label>` com o texto "Digite a palavra que falta" e os atributos `autocapitalize="none"`, `autocorrect="off"`, `spellcheck="false"`, `autocomplete="off"` e `enterkeyhint="done"` (Review Focus 4).
  - Digitar "Gte" e apertar Enter chama `onAnswer(true, [1, 2])`. A lacuna mostra "get" com o sublinhado ondulado nas letras 1 e 2: as letras corrigidas ficam num `span` com `data-corrected`.
  - Digitar "got" e apertar Enter chama `onAnswer(false, [])`.
  - Com `HINT`, a primeira letra da resposta aparece como texto de exemplo no campo.
- [ ] **Step 2:** Rode `npx vitest run src/components/game/DigitacaoArea.test.tsx`. Esperado: FAIL. Depois implemente e rode de novo. Esperado: PASS.
- [ ] **Step 3:** `git commit -m "feat: typing mode with typo correction"`

### Task 21: Modo Monte o verso

**Files:**
- Create: `src/components/game/MontarArea.tsx`
- Modify: `GameScreen.tsx`
- Test: `src/components/game/MontarArea.test.tsx`

**Interfaces:**
- Consumes: `makeTiles`, `isNextTileCorrect` e `tokenize` (Tasks 12 e 15), e o evento `TILE` do reducer.
- Produces: `<MontarArea blank tokens placed onTile={(word: string) => void} />`

- [ ] **Step 1: Teste que falha**
  - Aparecem as peças embaralhadas da linha, uma por palavra.
  - Tocar "Please" quando ela é a próxima certa coloca a peça na fileira limão, e o botão daquela peça fica `disabled`, com borda tracejada e texto `#6E6E78`.
  - Tocar na peça errada chama `onTile` com essa palavra, e o reducer marca a linha como errada (isso é coberto pelo teste do `GameScreen` com o player falso).
  - Com `HINT`, a próxima peça certa é colocada sozinha, e a linha fica com `kind: 'helped'`.
  - O botão "Não entendi a ordem" chama `onExplain('')`.
- [ ] **Step 2:** Rode `npx vitest run src/components/game/MontarArea.test.tsx`. Esperado: FAIL. Depois implemente e rode de novo. Esperado: PASS.
- [ ] **Step 3:** `git commit -m "feat: build-the-line mode"`

### Task 22: Modo Karaokê

**Files:**
- Create: `src/components/game/KaraokeView.tsx`
- Modify: `GameScreen.tsx`
- Test: `src/components/game/KaraokeView.test.tsx`

**Interfaces:**
- Consumes: `activeLineIndex` (Task 3), o hook `useLineHelp` (Task 23, injetado por prop como `fetchTranslation(lineIndex) => Promise<string>`) e `onExplain(target)`.
- Produces: `<KaraokeView lines timeMs fetchTranslation onExplain />`

- [ ] **Step 1: Teste que falha**
  - A linha atual tem `aria-current="true"` e o fundo limão.
  - Quando a linha 3 fica ativa, `fetchTranslation` é chamado para as linhas 3 e 4, e só uma vez para cada uma.
  - O botão "Esconder tradução" esconde as traduções e passa a se chamar "Mostrar tradução".
  - Tocar numa palavra da linha atual chama `onExplain` com essa palavra.
  - A tela não mostra combo nem pontos.
- [ ] **Step 2:** Rode `npx vitest run src/components/game/KaraokeView.test.tsx`. Esperado: FAIL. Depois implemente e rode de novo. Esperado: PASS.
- [ ] **Step 3:** `git commit -m "feat: karaoke mode with on-demand translations"`

### Task 23: Ajuda com IA ("Não entendi" e "Traduzir verso")

**Files:**
- Create: `src/lib/help/prompts.ts`, `src/lib/help/helpService.ts`, `src/app/api/help/route.ts`, `src/components/game/HelpSheet.tsx`, `src/lib/help/useLineHelp.ts`
- Modify: `GameScreen.tsx` (liga `onExplain`/`onTranslate` ao `HelpSheet`)
- Test: `src/lib/help/helpService.test.ts`, `src/components/game/HelpSheet.test.tsx`

**Interfaces:**
- Consumes: as tabelas `line_help` e `help_requests` e a função `is_member()` (Task 7).
- Produces:

```ts
export type HelpKind = 'explain' | 'translate';
export interface HelpRequest { youtubeId: string; lyricsRef: string; lineIndex: number; lineText: string; kind: HelpKind; target: string }
export interface HelpDeps { getCached(r: HelpRequest): Promise<string | null>; saveCached(r: HelpRequest, content: string): Promise<void>;
  countRecent(userId: string, sinceMs: number): Promise<number>; logRequest(userId: string): Promise<void>;
  callModel(system: string, user: string): Promise<string> }
export function getHelp(userId: string, r: HelpRequest, deps: HelpDeps, nowMs: number): Promise<{ status: 200; content: string } | { status: 429 } | { status: 400 }>;
```

- Produces também: `POST /api/help`, que recebe o corpo `HelpRequest` e responde 200 `{content}`, 403 para quem não é membro, 429 quando passa do limite ou 400. E `useLineHelp()`, que devolve `{ explain(lineIndex, target), translate(lineIndex) }`.
- Copy exata em `prompts.ts`:
  - `EXPLAIN_SYSTEM` = "Você é o DJ Bop, um amigo gente boa que manja de música e de inglês. Explique em português do Brasil, em no máximo 2 frases curtas, o que a palavra ou expressão destacada quer dizer neste verso de música e por quê. Se for gíria, contração ou phrasal verb, diga isso. Não use palavrão. Não repita o verso inteiro."
  - `TRANSLATE_SYSTEM` = "Traduza este verso de música para um português do Brasil natural, do jeito que uma pessoa falaria. Responda só com a tradução, sem aspas e sem explicação."
  - Mensagem do usuário para `explain`: `` `Verso: ${lineText}\nDestaque: ${target || '(o verso inteiro)'}` ``
  - Mensagem do usuário para `translate`: `` `Verso: ${lineText}` ``

- [ ] **Step 1: Teste que falha (helpService, com dependências falsas)**
  - Com cache, o resultado vem do cache e `callModel` não é chamado.
  - Sem cache, `callModel(EXPLAIN_SYSTEM, 'Verso: Please don\'t let me down\nDestaque: let')` é chamado, e depois `saveCached` e `logRequest`.
  - Com `countRecent` igual a 60 na última hora, o resultado é 429.
  - Com `lineText` de mais de 300 caracteres, o resultado é 400.
  - O `HelpSheet` mostra o DJ Bop, o texto devolvido e o botão "Valeu".
- [ ] **Step 2:** Rode `npx vitest run src/lib/help src/components/game/HelpSheet.test.tsx`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
  - A rota usa o Supabase do servidor com a sessão do usuário para checar `is_member()` e a chave de serviço para ler e gravar `line_help` e `help_requests`.
  - `callModel` usa `new Anthropic().messages.create({ model: 'claude-haiku-5-5', max_tokens: 300, system, messages: [{ role: 'user', content: user }] })` e lê `ANTHROPIC_API_KEY` só no servidor.
  - O "Não entendi" aparece no `LyricPanel` depois de cada resposta e também ao tocar numa palavra da linha atual.
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: on-demand explanations and translations with per-line cache"`

### Task 24: Fim da música, salvar a partida e tela inicial

**Files:**
- Create: `src/lib/supabase/plays.ts`, `src/components/game/EndScreen.tsx`, `src/components/home/PasteLink.tsx`, `src/components/home/SongCard.tsx`
- Modify: `src/app/page.tsx` (início), `SongScreen.tsx` (fim → `EndScreen`)
- Test: `src/lib/supabase/plays.test.ts`, `src/components/game/EndScreen.test.tsx`, `src/components/home/PasteLink.test.tsx`

**Interfaces:**
- Consumes: `PlaySummary`, `AnswerRecord`, `repeatMultiplier` (Task 16), `parseYouTubeId` (Task 2) e as tabelas `plays` e `answers` (Task 7).
- Produces:
  - `savePlay(db: PlaysDb, p: { userId: string; youtubeId: string; mode: Mode; difficulty: Difficulty; summary: PlaySummary; records: AnswerRecord[]; timeToReadyMs: number; now: Date }): Promise<{ playId: string; xp: number }>`
  - `applyDoubleXp(db: PlaysDb, playId: string): Promise<{ xp: number }>`, que dobra o XP da partida uma única vez e grava `double_xp_used = true`. Se o XP já foi dobrado, devolve o valor atual sem mudar nada.
  - `PlaysDb`, com `countPlays(userId, youtubeId, sinceIso): Promise<number>`, `insertPlay(row): Promise<string>`, `insertAnswers(rows): Promise<void>`, `getPlay(id): Promise<{ xp: number; double_xp_used: boolean }>` e `updatePlay(id, patch): Promise<void>`
  - `recentSongs(db, limit = 20): Promise<VideoRecord[]>`, com os vídeos `status = 'ok'` jogados por qualquer membro, do mais recente para o mais antigo, sem repetir. Na parte A ainda não existem amizades, então "Músicas da galera" mostra as músicas de todos os membros, no máximo 50 pessoas. A parte B troca isso para você mais os seus amigos.

- [ ] **Step 1: Teste que falha**
  - Com `countPlays` igual a 1, `savePlay` grava `xp = round(summary.xp × 0.5)` e insere uma resposta para cada registro, com o tipo certo.
  - Chamar `applyDoubleXp` duas vezes na mesma partida dobra o XP só uma vez.
  - No modo `karaoke`, `savePlay` grava `xp = 0`.
  - O `EndScreen` com `{ pct: 92, totalBlanks: 12, firstTryCorrect: 11, maxCombo: 8 }` mostra:
    - "11 de 12 lacunas certas", o anel com `aria-label` "92% de acerto" e o DJ Bop dizendo "Mandou bem!";
    - com 70%, a fala "Boa! Bora de novo?"; com 40%, "Quase! Solta o replay que você pega.";
    - o botão tracejado "Dobrar o XP · anúncio", que com o direito `'free'` dobra o XP mostrado uma única vez e grava `double_xp_used`;
    - os botões "Jogar de novo", "Outro modo" e "Outra música".
    - Não aparecem "Desafiar", ofensiva nem figurinhas, porque isso fica para as partes B e C.
  - No `PasteLink`, colar "olha essa" e tocar em "Jogar" mostra "Esse link não parece do YouTube.". Colar um link válido navega para `/jogar/<id>`.
- [ ] **Step 2:** Rode `npx vitest run src/lib/supabase/plays.test.ts src/components/game/EndScreen.test.tsx src/components/home/PasteLink.test.tsx`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
  - A tela inicial tem o logo, `PasteLink` com o texto de exemplo `t('home.pastePlaceholder')`, a seção "Músicas da galera" com `SongCard` e um atalho para `/convidar`.
  - O visual segue os wireframes "Fim da música" e "Cartões".
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: end screen, play saving with repeat decay, home"`

### Task 25: PWA (instalação, ícone, compartilhar e funcionar sem rede)

**Files:**
- Create: `src/app/manifest.ts`, `public/sw.js`, `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `scripts/make-icons.mjs` (gera os PNGs a partir do SVG do ícone aprovado, com `sharp`), `src/app/compartilhar/route.ts`, `src/lib/youtube/shareRedirect.ts`, `src/components/pwa/RegisterSW.tsx`, `src/components/pwa/InstallPrompt.tsx`
- Test: `src/app/manifest.test.ts`, `src/components/pwa/InstallPrompt.test.tsx`, `src/lib/youtube/shareRedirect.test.ts`

**Interfaces:**
- Consumes: `extractYouTubeIdFromShare` (Task 2) e o fim da primeira música, como evento do `EndScreen` (Task 24).
- Produces:
  - `manifest()` com: `name: 'Hookbop'`, `short_name: 'Hookbop'`, `start_url: '/'`, `display: 'standalone'`, `background_color: '#0E0E10'`, `theme_color: '#0E0E10'`, os ícones 192, 512 e 512 maskable, e `share_target: { action: '/compartilhar', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } }`
  - `<InstallPrompt platform="android" | "ios" | "other" standalone={boolean} />`
  - `resolveShareRedirect(params: URLSearchParams): string`, usado pela rota `/compartilhar`

- [ ] **Step 1: Teste que falha**
  - O `manifest()` traz `share_target.action === '/compartilhar'` e `theme_color === '#0E0E10'`, além de um ícone com `purpose: 'maskable'`.
  - O `InstallPrompt` com `platform="ios"` e `standalone={false}` mostra "Toque em Compartilhar e depois em Adicionar à Tela de Início".
  - Com `standalone={true}`, ele não mostra nada.
  - Com `platform="android"` e um evento `beforeinstallprompt` guardado, ele mostra o botão "Instalar".
  - `resolveShareRedirect(new URLSearchParams('text=Olha https://youtu.be/dQw4w9WgXcQ'))` devolve `'/jogar/dQw4w9WgXcQ'`.
  - `resolveShareRedirect(new URLSearchParams('text=oi'))` devolve `'/?erro=link'`.
  - Na tela inicial, `?erro=link` mostra "Esse link não parece do YouTube."
- [ ] **Step 2:** Rode `npx vitest run src/app/manifest.test.ts src/components/pwa src/lib/youtube/shareRedirect.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implemente.
  - O `sw.js` guarda as páginas do app e os arquivos de `/_next/static`. Páginas usam rede primeiro e, sem rede, mostram a página guardada. Pedidos para youtube, lrclib.net e `/api/` nunca são guardados.
  - O `InstallPrompt` aparece só depois da primeira música terminada. O "agora não" fica guardado no `localStorage`, dentro de try/catch.
- [ ] **Step 4:** Rode o mesmo comando. Esperado: PASS.
- [ ] **Step 5:** `git commit -m "feat: pwa manifest, icons, share target, install prompt, service worker"`

### Task 26: Publicar e testar com a galera

**Files:**
- Create: `docs/deploy.md`, com o passo a passo a seguir, para repetir depois
- Modify: `supabase/seed.sql` (o dono confirma o e-mail de dono)

Esta task publica o app, o que tem efeito fora do computador. **Peça confirmação explícita ao dono antes do Step 4.**

- [ ] **Step 1:** Confira os pré-requisitos 1, 3, 4 e 5 com o dono: projeto no Supabase, Google configurado no Supabase, chave da Anthropic e domínio registrado.
- [ ] **Step 2:** Aplique as migrações no projeto hospedado com `npx supabase link --project-ref <ref>` e `npx supabase db push`. Rode o seed com o e-mail do dono. No Supabase Auth, cadastre as URLs de retorno `https://<domínio>/auth/callback` e `http://localhost:3000/auth/callback`. No painel do Supabase, em Auth, confirme que **"Confirm email" está ligado**. Sem isso, qualquer pessoa pode virar dona do app se cadastrando com o e-mail do dono, porque o `db push` não leva essa configuração do `config.toml`.
- [ ] **Step 3:** Ligue o projeto à Vercel e configure as variáveis de ambiente:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (só no servidor)
  - `ANTHROPIC_API_KEY` (só no servidor)
  - `NEXT_PUBLIC_APP_URL=https://<domínio>`
  - `NEXT_PUBLIC_APP_PHASE=closed_beta`

  Depois aponte o domínio para a Vercel.
- [ ] **Step 4:** Rode `npx vitest run`, `npx playwright test` e `npx supabase test db`. Esperado: tudo passa. Com a confirmação do dono, publique.
- [ ] **Step 5:** Faça o roteiro no celular, num Android e num iPhone, e anote em `docs/deploy.md` o que passou:
  1. O dono entra pelo Google.
  2. Cola um link e a letra aparece.
  3. Calibra um clipe que tem introdução.
  4. Joga os 4 modos.
  5. Usa "Não entendi" e "Traduzir verso".
  6. Chega na tela de fim.
  7. Instala na tela inicial.
  8. No Android, compartilha um vídeo a partir do app do YouTube.
  9. Cria um convite e um amigo entra.
  10. Um segundo aparelho tenta usar o mesmo link e vê "Pede um convite pra quem te mandou".
- [ ] **Step 6:** `git commit -m "docs: deploy guide and phase 1 smoke checklist"`
