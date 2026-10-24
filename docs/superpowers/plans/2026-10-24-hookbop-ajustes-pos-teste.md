# Hookbop: ajustes pós-teste (plano de construção)

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** corrigir o que o dono sentiu no primeiro teste (pausa seca, letra piscando, travamento ao sair e voltar,
tradução sem pausa, dica sobrando), pôr a capinha das músicas e criar o painel de métricas só do dono.

**Arquitetura:**
- **Fade:** vira um comando do reducer. O `GameScreen` executa o comando com um "fader" de volume ligado ao adaptador
  do player.
- **Sair e voltar:** a correção é um realinhamento do relógio do jogo e um botão "Continuar". O progresso da partida
  fica guardado no aparelho.
- **Animações:** usam GSAP, isoladas em hooks pequenos que respeitam "reduzir movimento".
- **Métricas:** duas tabelas novas, `ai_usage` e `app_events`, e resumos em views, tudo só para a chave de serviço.
  A IA registra o próprio uso no serviço de ajuda. As ações chegam por uma rota com lista fechada. A página
  `/admin/metricas` é só do dono.

**Stack:** Next.js 16 (App Router, `cacheComponents`, `src/proxy.ts`), React 19, Tailwind v4, Supabase (Postgres, RLS,
pgTAP), API IFrame do YouTube, SDK `@anthropic-ai/sdk`, GSAP com `@gsap/react` (novo), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-hookbop-ajustes-pos-teste-design.md`. Ela se apoia na spec original,
`docs/superpowers/specs/2026-10-22-hookbop-design.md`, e nas decisões R1 a R87 registradas em
`.superpowers/sdd/2026-10-22-hookbop-parte-a/progress.md`.

## Restrições globais

- **YouTube:**
  - player oficial (`youtube-nocookie`), com nada desenhado por cima do player;
  - não toca em segundo plano;
  - mudar o volume pela API oficial é permitido.
- **Textos:** todo texto na tela fica em `src/i18n/pt-BR.ts` e é lido com `t()`. As falas do DJ Bop têm no máximo 8
  palavras e nunca culpam o jogador.
- **Marca:** usar os tokens de `src/app/globals.css`. Botões têm pelo menos 44 px. Texto sobre o limão é `#0E0E10`.
- **Pontuação:** só a primeira tentativa conta. O Karaokê dá 0 XP. Uma resposta dada durante o fade ou a pausa conta
  como "antes do fim do verso".
- **IA:** roda só no servidor, com `claude-haiku-5-5` e cache por verso. Nenhum dado pessoal vai para o modelo.
- **Métricas:** nenhum membro lê `ai_usage`, `app_events` nem os resumos. Só o dono vê o painel, conferido pelo
  servidor a cada acesso.
- **Animações:** só `transform` e `opacity`. Com "reduzir movimento" ligado, tudo vira fade simples. Nada atrasa o
  toque nem cobre o player.
- **Commits:** mensagem `tipo: descrição`, em inglês, **sem nenhuma marca de autoria de IA** (nada de
  `Co-Authored-By`, "Generated with" ou emoji de robô).
- **Publicação:** enviar para a `main` publica o app pela Vercel. Só se envia com o "pode publicar" do dono. Uma
  migração nova tem que estar no banco hospedado **antes** do envio.
- **Testes:** use letras e títulos inventados, nunca letra de música real.
- **Comandos (Windows):**
  - unitários: `npx vitest run <arquivo>`
  - banco: `npx supabase test db`
  - ponta a ponta: `npx playwright test <arquivo>`
  - aplicar migração local: `npx supabase migration up --local`, **nunca** `db reset`
  - tipos do banco: `npx supabase gen types typescript --local > src/lib/supabase/database.types.ts`

## Foco da revisão

1. **A volta depois do fade.** Se o verso seguinte tem lacuna esperando, a música volta para o começo dele; senão,
   volta de onde parou. Num verso mais curto que o fade, nenhuma lacuna pode sumir sem pausa. Testes nas tarefas 2 e 3.
2. **iPhone, onde não há controle de volume.** A música segue ~2 s e para, e o "Continuar" toca o clipe pelo gesto do
   próprio botão. Testes nas tarefas 1 e 4.
3. **Voltar ao app.** A música nunca volta sozinha, a letra realinha com o clipe e nenhuma lacuna é marcada como
   pulada pelo tempo fora. Testes na tarefa 4.
4. **Métricas privadas.** Membro e visitante não leem nem gravam fora da rota, e a página não existe para quem não é
   o dono. Testes nas tarefas 11, 13 e 14.
5. **"Reduzir movimento".** Nenhuma animação de deslize ou pulo com ele ligado, e a letra continua legível e
   acessível. Testes nas tarefas 8 a 10.

---

### Tarefa 1: Volume e fader no player

**Arquivos:**
- Modificar: `src/lib/player/adapter.ts`, `src/lib/player/youtubeAdapter.ts`, `src/lib/player/fakeAdapter.ts`
- Criar: `src/lib/player/fade.ts`, `src/lib/player/fade.test.ts`
- Testar também: `src/lib/player/youtubeAdapter.test.ts`, `src/lib/player/fakeAdapter.test.ts` (se existir)

**Interfaces:**
- **Produz:**
  - `PlayerAdapter` ganha `setVolume(v: number): void` (0 a 100), `getVolume(): number` e
    `getPlayerState(): PlayerState`. O último lê o estado real do player, sem depender de eventos.
  - `FakePlayerAdapter` registra `` `volume:${v}` `` em `calls`. Sem chamada, o volume é 100. `getPlayerState()`
    devolve o último estado emitido.
  - `supportsVolume(nav: { userAgent: string; maxTouchPoints: number }): boolean` é `false` para iPhone, iPad e iPad
    que se apresenta como Mac com toque.
  - `createFader(adapter: PlayerAdapter, opts: { volume: boolean; stepMs?: number; setTimer?; clearTimer? })` devolve
    `Fader`, com estes métodos:
    - `fadeOut(ms: number, onDone: () => void): void`: desce o volume do atual até 0 em passos de `stepMs` (padrão
      50), depois chama `onDone`. Sem volume, só espera `ms` e chama `onDone`.
    - `fadeIn(ms: number): void`: sobe do volume atual até o volume guardado no começo do último `fadeOut` (ou 100).
      Sem volume, não faz nada.
    - `cancel(): void`: para qualquer rampa no meio, sem chamar `onDone`.
    - `fading(): 'out' | 'in' | null`.

- [ ] **Passo 1: testes que falham** (`fade.test.ts`, com `vi.useFakeTimers()` e `FakePlayerAdapter`)
  - `fadeOut(2000, done)`:
    - registra volumes decrescentes até `volume:0`;
    - chama `done` uma vez, depois de 2000 ms;
    - nunca chama `pause` por conta própria.
  - `fadeIn(800)` depois de um `fadeOut` com volume inicial 70 sobe até `volume:70`.
  - `cancel()` no meio do `fadeOut` para os passos, e `done` não é chamado.
  - `fadeOut` seguido de `fadeIn` antes do fim cancela a descida e sobe a partir do volume em que estava.
  - `createFader(fake, { volume: false })`: nenhum `volume:` em `calls`, e `done` é chamado depois de `ms`.
  - `supportsVolume`:
    - UA de iPhone → false;
    - UA de Android → true;
    - `Macintosh` com `maxTouchPoints: 5` → false;
    - `Macintosh` com 0 → true.
- [ ] **Passo 2:** `npx vitest run src/lib/player/fade.test.ts`. Esperado: FAIL.
- [ ] **Passo 3: implementação.**
  - No `youtubeAdapter`, adicione `setVolume`, `getVolume` e `getPlayerState` à interface `YTPlayer` e ao
    mapeamento, com o mesmo `live()` guard. Converta `getPlayerState` com o mesmo mapa de estados que já existe.
  - Escreva `fade.ts`.
- [ ] **Passo 4:** rode o arquivo e `npx vitest run src/lib/player`. Esperado: PASS.
- [ ] **Passo 5:** `git commit -m "feat: player volume and a fader for smooth pauses"`

### Tarefa 2: Reducer com fade e regra da volta

**Arquivos:**
- Modificar: `src/lib/types.ts` (`Command`), `src/lib/game/reducer.ts`, `src/lib/game/reducer.test.ts`

**Interfaces:**
- **Consome:** `Command` atual.
- **Produz:**
  - Os comandos `pause` e `play` ganham `fade?: boolean`.
  - O reducer emite `{type:'pause', fade:true}` ao começar uma espera (no mesmo ponto de hoje, `endMs - 150`).
  - Ao soltar a música depois de uma resposta, `REPEAT_LINE` ou erro com `autoRepeat`, emite
    `{type:'play', fade:true}`.
  - O `pause` de quem sai do app continua sem fade (é o `GameScreen` que monta esse comando).
  - Novo evento `RESYNC { timeMs }`: atualiza `lastTickMs` sem marcar lacunas como puladas e sem tratar o salto como
    "seek".
  - Exporte `PAUSE_LEAD_MS`.

**Regras (da spec, §1):**
- **Durante a espera** (`phase:'waiting'`), os `TICK`s seguem atualizando `lastTickMs` enquanto o clipe toca o fade:
  - não começam outra espera;
  - não marcam lacunas do verso seguinte;
  - não tiram o jogo da espera.
  - Um `PLAYER_STATE playing` durante a espera, vindo de um estado que **já era** `playing`, não conta como "o
    jogador apertou play".
- **A volta:** ao soltar a música (em `continueWait` e no fim da espera), se `lastTickMs` já passou do `startMs` de um
  verso posterior ao esperado que tem lacuna que `awaitsAnswer`, os comandos são
  `[{type:'seek', ms: thatLine.startMs}, {type:'play', fade:true}]`. Senão, `[{type:'play', fade:true}]`.
- **Antes do fim do verso:** para uma resposta à lacuna esperada (ou a outra do mesmo verso) durante
  `phase:'waiting'`, `beforeLineEnd` usa `Math.min(atMs, line.endMs - PAUSE_LEAD_MS)`.

- [ ] **Passo 1: testes que falham** (`reducer.test.ts`, com os helpers `game`, `tick`, `answer`, `player`)
  - A espera emite `{type:'pause', fade:true}`.
  - **Durante o fade**, com ticks de 100 ms avançando 2 s além do fim do verso:
    - o jogo continua `waiting` na mesma lacuna;
    - nenhuma lacuna do verso seguinte fica `skipped`;
    - nenhum novo comando.
  - **Verso seguinte com lacuna** (início 300 ms depois do fim do esperado): acertar depois de 2 s de fade emite
    `[{seek: nextLine.startMs}, {play, fade:true}]`.
  - **Verso seguinte sem lacuna:** acertar depois de 2 s de fade emite só `[{play, fade:true}]`.
  - **Verso curto** (1,2 s, com lacuna) totalmente dentro do fade: depois da resposta, a música volta para o começo
    dele, e o próximo `TICK` que cruza o ponto de pausa dele começa a espera dele.
  - **Resposta certa no fade**, com `atMs` 1,5 s depois do fim do verso: `beforeLineEnd` é true e o XP é o mesmo de
    hoje (o teste existente "a right answer during the wait" continua dando 12).
  - **Erro com `autoRepeat`:** `[{seek: line.startMs}, {play, fade:true}]`.
  - **`REPEAT_LINE`:** `[{seek: line.startMs}, {play, fade:true}]`.
  - **`RESYNC`** para 40 s com o clipe parado num ponto de 10 s: nenhuma lacuna vira `skipped` e `lastTickMs` = 40000.
  - **`PLAYER_STATE playing`** recebido durante a espera, quando o anterior já era `playing`: não pula a lacuna.
- [ ] **Passo 2:** `npx vitest run src/lib/game/reducer.test.ts`. Esperado: FAIL nos novos.
- [ ] **Passo 3:** implemente. Atualize os testes antigos que esperavam `{type:'pause'}` e `{type:'play'}` sem `fade`.
- [ ] **Passo 4:** `npx vitest run src/lib/game`. Esperado: PASS.
- [ ] **Passo 5:** `git commit -m "feat: waits fade out, resume rule for blanks heard inside the fade"`

### Tarefa 3: GameScreen toca o fade; "Traduzir verso" e a folha de ajuda pausam com fade

**Arquivos:**
- Modificar:
  - `src/components/game/GameScreen.tsx`
  - `src/components/game/useHelpSheet.ts`
  - `src/components/game/useLineTranslations.ts`
  - `src/components/game/LyricPanel.tsx`
  - `src/i18n/pt-BR.ts`
- Testar: `src/components/game/GameScreen.test.tsx`, `src/components/game/LyricPanel.test.tsx`

**Interfaces:**
- **Consome:** `createFader`, `supportsVolume` (tarefa 1) e os comandos com `fade` (tarefa 2).
- **Produz:**
  - `run()` executa:
    - `pause+fade` como `fader.fadeOut(FADE_OUT_MS, () => adapter.pause())`;
    - `play+fade` como "se `fading()==='out'`, `cancel()`; senão `adapter.play()`; depois `fader.fadeIn(FADE_IN_MS)`";
    - `seek` antes do play, como hoje, com o filtro R44.
  - `FADE_OUT_MS = 2000` e `FADE_IN_MS = 800` ficam em um só lugar, no `GameScreen`.
  - O fader é criado uma vez por adaptador, com `volume: supportsVolume(navigator)`.
  - `LyricPanel` ganha `onContinue?: () => void` e mostra um botão "Continuar" (`t('jogo.continue')`) quando o recebe.

- [ ] **Passo 1: testes que falham** (`GameScreen.test.tsx`, com `FakePlayerAdapter` e timers falsos)
  - **Escolha:** chegar na lacuna gera `volume:` decrescentes e só depois `pause`. Acertar gera `play` e `volume:`
    subindo até o volume de antes.
  - **Volume não controlável** (mock de `supportsVolume` → false): nenhum `volume:`, e `pause` acontece 2 s depois
    da lacuna.
  - **"Traduzir verso" fora do Karaokê**, com a música tocando e sem espera: há fade, depois `pause`, a tradução
    aparece e o botão "Continuar" aparece. Tocar em "Continuar" gera `play` com fade-in e o botão some.
  - **"Traduzir verso" durante uma espera:** nenhum `pause` novo e nenhum "Continuar". Responder solta a música.
  - **Karaokê:** "Traduzir verso" não pausa (não há `pause` nem `volume:` novos).
  - **Folha de ajuda:** "Não entendi" com a música tocando gera fade e depois `pause`. "Valeu" gera `play` com fade-in.
  - **Sair do app:** `setVisibility('hidden')` gera `pause` imediato, sem `volume:`.
- [ ] **Passo 2:** rode os testes. Esperado: FAIL.
- [ ] **Passo 3:** implemente. Os novos textos (`jogo.continue: 'Continuar'`) vão para o `pt-BR.ts`.
- [ ] **Passo 4:** `npx vitest run src/components/game`. Esperado: PASS.
- [ ] **Passo 5:** `git commit -m "feat: smooth fades in the game, translate and help pause the clip"`

### Tarefa 4: Sair e voltar sem travar

**Arquivos:**
- Modificar:
  - `src/lib/player/usePauseWhenHidden.ts`
  - `src/lib/player/usePlayerTime.ts`
  - `src/components/game/GameScreen.tsx`
  - `src/i18n/pt-BR.ts`
- Testar: `GameScreen.test.tsx`, `usePauseWhenHidden.test.ts`, `usePlayerTime.test.ts`

**Interfaces:**
- **Produz:** `usePauseWhenHidden(pause, enabled, onVisible?: () => void)`. O `onVisible` é chamado quando a página
  volta a ficar visível depois de ter ficado escondida.

**Comportamento (spec §6):**
- **Ao voltar:**
  - o `GameScreen` lê `adapter.getPlayerState()` e `adapter.getCurrentTimeMs()`;
  - despacha `RESYNC`;
  - se o player estiver tocando sozinho, manda `pause` imediato;
  - mostra um botão grande "Continuar" (`t('jogo.continue')`), fora do player, na área do jogo.
- **"Continuar":** despacha `RESYNC` com o tempo atual e manda `play` com fade-in. Se o jogo estava numa espera, ela
  continua (o botão só some e a resposta é que solta a música).

- [ ] **Passo 1: reproduzir.** Escreva um teste com o cenário relatado:
  - página escondida;
  - o player emite `paused` e depois `playing` sozinho, sem o app pedir;
  - o tempo do player pula 1 s;
  - a página volta.

  O teste espera que a letra (o verso mostrado) acompanhe o tempo do player. Rode e veja falhar.

  Investigue também, com `superpowers:systematic-debugging`, se:
  - `usePlayerTime` e o filtro R44 deixam de despachar `TICK` depois da volta;
  - o reducer fica com `playerPlaying` errado por eventos perdidos.

  Escreva no relatório a causa que achar, com a evidência.
- [ ] **Passo 2: testes que falham** do comportamento novo:
  - ao voltar, há `pause` imediato se o player está tocando;
  - aparece "Continuar";
  - nenhuma lacuna fica `skipped` pelo tempo fora;
  - o verso mostrado bate com o tempo do player depois de "Continuar";
  - "Continuar" gera `play` com fade-in.
- [ ] **Passo 3:** implemente a correção da causa e o comportamento novo.
- [ ] **Passo 4:** `npx vitest run src/components/game src/lib/player`. Esperado: PASS.
- [ ] **Passo 5:** `git commit -m "fix: coming back to the app resyncs the lyrics and waits for Continuar"`

### Tarefa 5: Guardar a partida no aparelho e oferecer "Continuar de onde parou"

**Arquivos:**
- Criar: `src/lib/game/savedProgress.ts`, `src/lib/game/savedProgress.test.ts`
- Modificar:
  - `src/lib/game/reducer.ts` (evento `RESTORE`)
  - `src/components/game/GameScreen.tsx`
  - `src/components/game/SongScreen.tsx`
  - `src/components/game/ModePicker.tsx`
  - `src/i18n/pt-BR.ts`

**Interfaces:**
- **Produz:**
  - `SavedProgress`, com os campos `{ version: 1, youtubeId, mode, difficulty, savedAt, lastTickMs, status, attempted,
    hinted, tilesPlaced, score }`.
  - `saveProgress(storage, p)`.
  - `loadProgress(storage, youtubeId, now): SavedProgress | null`. Devolve null se tiver mais de 24 h, se a versão
    for outra, ou se o JSON for inválido.
  - `clearProgress(storage, youtubeId)`.
  - A chave é `hb_progress:<youtubeId>`. Todo acesso fica em try/catch.
  - O reducer ganha `RESTORE { saved }`. Ele só aplica o progresso se os ids das lacunas salvas forem exatamente os
    da partida (`blanks` é determinístico pelo vídeo e pela dificuldade). Senão, ignora.
  - O `ModePicker` ganha `saved?: { mode; difficulty; savedAt }`, `onResume()` e `onDiscard()`.

- [ ] **Passo 1: testes que falham:**
  - salva e carrega;
  - expira depois de 24 h;
  - JSON quebrado → null;
  - storage que lança erro → null, sem quebrar.
  - `RESTORE` com lacunas diferentes não muda nada; com as mesmas, restaura `status` e `score`.
  - O `GameScreen` salva a cada resposta e a cada 5 s de jogo, e limpa no fim da partida.
  - O `SongScreen`, com progresso salvo, mostra "Continuar de onde parou" e "Começar do zero" no seletor.
    - Continuar: monta o jogo com `RESTORE`, dá `seek` no começo do verso de `lastTickMs` e toca com fade-in.
    - Começar do zero: limpa o progresso.
- [ ] **Passo 2:** rode os testes. Esperado: FAIL.
- [ ] **Passo 3:** implemente.
- [ ] **Passo 4:** `npx vitest run src/lib/game src/components/game`. Esperado: PASS.
- [ ] **Passo 5:** `git commit -m "feat: keep a game in progress on the device and offer to resume it"`

### Tarefa 6: Tirar o botão "Dica"

**Arquivos:**
- Modificar: `src/components/game/ToolsBar.tsx`, `src/components/game/GameScreen.tsx`, `src/i18n/pt-BR.ts`, e os testes
  que usam as props de dica

**Decisão:**
- A barra de ferramentas perde o espaço da dica nos modos com lacuna e passa a ter "0.75x" e "Repetir verso", com as
  larguras ajustadas. O Karaokê mantém a ação de esconder ou mostrar a tradução.
- O evento `HINT` do reducer, o tipo "com ajuda" e o direito `hint` em `entitlements.ts` continuam no código, sem
  botão. Eles servem para dados antigos e para uma dica paga na fase pública.
- Remova `hint()`, `hintDisabled`, `jogo.hintAd` e o que mais ficar sem uso na interface.

- [ ] **Passo 1: testes que falham:**
  - nenhum botão de dica em Escolha, Digitação e Monte o verso;
  - a barra tem 2 ferramentas nos modos com lacuna;
  - o Karaokê continua com a ação da tradução.
- [ ] **Passo 2:** rode os testes. Esperado: FAIL.
- [ ] **Passo 3:** implemente.
- [ ] **Passo 4:** rode `src/components/game`. Esperado: PASS.
- [ ] **Passo 5:** `git commit -m "feat: drop the hint button"`

### Tarefa 7: Capinha da música no card

**Arquivos:**
- Criar: `src/components/home/SongThumb.tsx` (cliente), `src/components/home/SongThumb.test.tsx`
- Modificar: `src/components/home/SongCard.tsx`, `src/i18n/pt-BR.ts`, `src/app/privacidade/page.tsx` (via chaves)

**Interfaces:**
- **Produz:** `SongThumb({ youtubeId, title })`.
  - A imagem é `https://i.ytimg.com/vi/<youtubeId>/mqdefault.jpg`, com `loading="lazy"`, `decoding="async"`, 80×45 e
    cantos `rounded-blank`.
  - O texto alternativo é `t('home.songThumbAlt', { musica: title })`.
  - Se a imagem não carregar, mostra o disco de hoje.
  - O id passa por `encodeURIComponent` e só aceita o padrão de 11 caracteres. Fora disso, mostra o disco.
  - Use `next/image` com `unoptimized`, ou `<img>` com a exceção de lint justificada num comentário. Escolha um e
    registre no relatório.
- A política ganha uma linha em `privacidade.terceiros.youtube`: as capinhas da tela inicial também vêm do YouTube.

- [ ] **Passo 1: testes que falham:**
  - mostra a imagem com o endereço e o alt certos;
  - com `error`, troca pelo disco;
  - um id inválido mostra o disco.
- [ ] **Passos 2 a 4:** rode e veja falhar, implemente, rode e veja passar (`src/components/home`).
- [ ] **Passo 5:** `git commit -m "feat: song thumbnails on the home cards"`

### Tarefa 8: Animações, base e letra deslizando

**Arquivos:**
- Criar:
  - `src/lib/motion/useReducedMotion.ts` e `src/lib/motion/useReducedMotion.test.ts`
  - `src/lib/motion/gsap.ts`, que registra os plugins usados
  - `src/components/game/useLineTransition.ts`
- Modificar: `src/components/game/LyricPanel.tsx`, `src/components/game/KaraokeView.tsx`, `package.json`
- Testar: `LyricPanel.test.tsx`, `KaraokeView.test.tsx`

**Antes de escrever:** leia a skill `cinematic-frontend` do dono (GSAP). Use **só** o núcleo do GSAP e `@gsap/react`,
**sem** Lenis e sem ScrollTrigger, porque brigariam com a rolagem própria do Karaokê.

**Interfaces:**
- **Produz:**
  - `useReducedMotion(): boolean`. Lê `prefers-reduced-motion`, reage à mudança e é seguro no servidor: devolve false.
  - `useLineTransition(containerRef, key: number, reduced: boolean)`. Quando `key` (o índice do verso) muda, anima os
    versos: o bloco sobe, o atual cresce e clareia, o anterior diminui e esmaece, o próximo entra apagado. Tudo em
    menos de 450 ms, com `transform` e `opacity`. Com `reduced`, só `opacity`.

- [ ] **Passo 1: testes que falham** (com `vi.mock('gsap')`)
  - Trocar o verso chama a animação com `y` e `opacity`.
  - Com `matchMedia` de movimento reduzido, a animação não usa `y` nem `scale`.
  - O texto, os `aria` e os `data-testid` dos versos continuam os mesmos.
  - O Karaokê anima o realce do verso atual sem mudar a rolagem que já existe.
- [ ] **Passo 2:** instale com `npm install gsap @gsap/react`. Rode os testes. Esperado: FAIL.
- [ ] **Passo 3:** implemente.
- [ ] **Passo 4:** rode `src/components/game` e `src/lib/motion`. Esperado: PASS. Rode `npx next build` e anote no
  relatório o tamanho que o GSAP somou ao JS da rota `/jogar`.
- [ ] **Passo 5:** `git commit -m "feat: lyrics slide between lines, with a reduced-motion fade"`

### Tarefa 9: Animações de resposta e de carregamento

**Arquivos:**
- Modificar:
  - `EscolhaArea.tsx`, `DigitacaoArea.tsx`, `MontarArea.tsx` (resposta)
  - `LyricPanel.tsx` (lacuna da vez e tradução carregando)
  - `HelpSheet.tsx` (carregando)
  - `SongScreen.tsx` (o `Notice` de carregamento)
- Criar: `src/components/brand/SpinningDisc.tsx`
- Testes dos componentes tocados

**Comportamento (spec §3):**
- **Lacuna da vez:** pulsa em limão.
- **Respostas:** o acerto dá um pulinho (scale) junto com o ✓; o erro dá uma tremidinha (x) junto com o ✕.
- **Carregando a música:** o disco gira enquanto a música e a letra carregam.
- **Tradução e folha do DJ Bop:** enquanto a tradução não chega, passa um brilho no lugar; a folha do DJ Bop usa o
  mesmo carregamento.
- **Movimento reduzido:** sem pulso, pulo, tremor nem giro, só troca de opacidade. O carregamento continua anunciado
  por `role="status"`.

- [ ] **Passos 1 a 4:** primeiro os testes que falham, um por comportamento:
  - a classe ou a chamada de animação existe;
  - com movimento reduzido, ela não existe;
  - os nomes acessíveis de antes continuam iguais.

  Depois implemente e rode `src/components`.
- [ ] **Passo 5:** `git commit -m "feat: answer feedback and loading animations"`

### Tarefa 10: Transições de tela e de folha

**Arquivos:**
- Modificar:
  - `HelpSheet.tsx` e `SettingsSheet.tsx` (sobem de baixo)
  - `SongScreen.tsx` (troca curta entre `loading`, `picker`, `game` e `end`)
  - `EndScreen.tsx` (o anel enche e o resultado entra)
  - `ModePicker.tsx` e `SongList.tsx` (cards entram em sequência)
  - os testes de cada um

**Regras:**
- O foco continua indo para onde vai hoje: o resultado no fim e o abridor ao fechar a folha.
- Nenhuma transição atrasa a interação por mais de ~300 ms, e o player nunca anima nem é coberto.
- Movimento reduzido: só fade.

- [ ] **Passos 1 a 4:** testes que falham para:
  - a transição de entrada e saída;
  - o movimento reduzido;
  - o foco preservado;
  - o player sem animação.

  Depois implemente e rode `src/components`.
- [ ] **Passo 5:** `git commit -m "feat: sheet and screen transitions"`

### Tarefa 11: Tabelas de métricas (migração 0006)

**Arquivos:**
- Criar: `supabase/migrations/0006_metrics.sql`, `supabase/tests/database/metrics.test.sql`
- Modificar: `src/lib/supabase/database.types.ts` (gerado)

**Conteúdo da migração:**
- **`public.ai_usage`**, com as colunas:
  - `id bigserial pk`
  - `created_at timestamptz default now()`
  - `user_id uuid not null`
  - `youtube_id text not null`
  - `line_index int not null`
  - `kind text check in ('explain','translate')`
  - `source text check in ('model','cache','reuse')`
  - `model text`
  - `input_tokens int not null default 0`
  - `output_tokens int not null default 0`
  - `cost_usd numeric(12,6) not null default 0`
  - `latency_ms int`
  - `outcome text check in ('ok','declined','error')`

  Índices em `(created_at)` e `(user_id, created_at)`.
- **`public.app_events`**, com as colunas:
  - `id bigserial pk`
  - `created_at timestamptz default now()`
  - `user_id uuid not null`
  - `session_id uuid not null`
  - `name text not null check in (<lista da tarefa 13>)`
  - `youtube_id text`
  - `mode text`
  - `props jsonb not null default '{}'`, com `check (octet_length(props::text) <= 2048)`

  Índices em `(created_at)` e `(name, created_at)`.
- **Views só de leitura** para o painel e para análise:
  - `metrics_ai_daily`: dia, chamadas por fonte, tokens e custo;
  - `metrics_usage_daily`: dia, pessoas ativas, partidas começadas, terminadas e abandonadas;
  - `metrics_modes`: partidas e conclusão por modo;
  - `metrics_songs`: partidas por música, com o título vindo de `videos`;
  - `metrics_help`: pedidos de ajuda por modo e por tipo.
- **`app_config`:** a chave `brl_rate` (texto, por exemplo `'5.50'`) fica a cargo do dono. A migração insere esse
  valor padrão com `on conflict do nothing`.
- **Função `public.purge_old_metrics()`:** apaga linhas de `ai_usage` e `app_events` com mais de 12 meses. É só para
  `service_role`.
- **Acesso:**
  - RLS ligada nas duas tabelas e nenhuma policy;
  - `revoke all` de `anon` e `authenticated` nas tabelas, nas sequências e nas views;
  - `grant` só para `service_role`.

- [ ] **Passo 1: testes pgTAP que falham:**
  - `authenticated` e `anon` sem select nem insert nas tabelas e views (use `table_privs_are` ou
    `has_table_privilege`);
  - os `check`s recusam `kind`, `source`, `outcome` e `name` fora da lista, e `props` grande demais;
  - as views existem e somam certo com dados inventados;
  - `purge_old_metrics` apaga só o que tem mais de 12 meses e não é executável por `authenticated`.
- [ ] **Passo 2:** `npx supabase migration up --local` e depois `npx supabase test db`. Esperado: FAIL nos novos
  antes de escrever a migração e PASS depois.
- [ ] **Passo 3:** gere os tipos.
- [ ] **Passo 4:** rode `npx supabase test db` e `npx tsc --noEmit`. Esperado: PASS.
- [ ] **Passo 5:** `git commit -m "feat: metrics tables and owner-only summaries"`

### Tarefa 12: A IA registra o próprio uso

**Arquivos:**
- Criar: `src/lib/help/pricing.ts`, `src/lib/help/pricing.test.ts`
- Modificar:
  - `src/lib/help/model.ts` e `modelError.ts`
  - `src/lib/help/helpService.ts` e `src/lib/help/helpService.test.ts`
  - `src/lib/supabase/helpStore.ts` e os testes dele

**Interfaces:**
- **Produz:**
  - `callModel(system, user): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number };
    latencyMs: number }>`. Um `ModelError` com `answered: true` passa a carregar `usage` e `latencyMs`.
  - `PRICES = { 'claude-haiku-5-5': { inputPerMTok: 0.10, outputPerMTok: 0.50, asOf: '2026-10' } }`.
  - `costUsd(model, usage): number`.
  - `HelpDeps.recordUsage(entry: AiUsageEntry): Promise<void>`, implementado no `helpStore` com a chave de serviço.

**Regras:**
- **Cache e reaproveitamento:** um acerto no cache e um reaproveitamento por texto igual também registram, com
  `source` `'cache'` ou `'reuse'`, 0 tokens e custo 0.
- **Chamada ao modelo:** registra tokens, custo, tempo e `outcome`:
  - `'ok'`;
  - `'declined'` se `declined`;
  - `'error'` nos outros erros. Sem tokens se `answered` for false.
- **Falha do registro:** se `recordUsage` falhar, nunca muda a resposta ao jogador. Registre com `console.warn` e
  siga em frente.

- [ ] **Passo 1: testes que falham:**
  - **`pricing`:** 1 milhão de tokens de entrada custa US$ 0,10.
  - **`getHelp`:** registra `cache` num acerto, `reuse` no refrão e `model` com os tokens numa chamada nova.
  - **Recusa:** registra `declined` com os tokens.
  - **Erro de rede:** registra `error` sem tokens.
  - **`recordUsage` que lança erro:** o jogador recebe a resposta igual.
  - **`model.ts`:** devolve `usage` de `response.usage` (o SDK fica mockado).
- [ ] **Passos 2 a 4:** rode e veja falhar, implemente, rode `src/lib/help` e `src/lib/supabase` e veja passar.
- [ ] **Passo 5:** `git commit -m "feat: log AI usage and estimated cost per help request"`

### Tarefa 13: Registro de ações do app

**Arquivos:**
- Criar:
  - `src/lib/metrics/events.ts`: a lista fechada de ações e a validação
  - `src/lib/metrics/track.ts`: o cliente
  - `src/app/api/events/route.ts`
  - `src/lib/metrics/handler.ts`
  - os testes de cada um
- Modificar: os pontos de instrumentação abaixo

**Interfaces:**
- **Ações:** `app_opened`, `song_opened`, `mode_selected`, `game_started`, `game_finished`, `game_abandoned`,
  `help_explain`, `help_translate`, `continue_after_leave`, `install_prompt_shown`, `install_accepted`,
  `invite_created`, `calibration_done`.
- **Campos permitidos em `props` por ação:**
  - `game_finished`: `{ pct, durationMs, totalBlanks }`;
  - `help_*`: `{ lineIndex }`;
  - o resto: `{}`.

  Qualquer outro campo é descartado.
- **`POST /api/events`:**
  - corpo `{ sessionId: uuid, events: Array<{ name, youtubeId?, mode?, props? }> }`, com no máximo 20 eventos e
    8 KB;
  - 401 sem sessão, 403 se não for membro, 400 se for inválido, 204 se der certo;
  - o `user_id` vem da sessão;
  - grava com a chave de serviço;
  - responde com `Cache-Control: no-store`.
- **`track(name, data?)`:**
  - junta os eventos e envia a cada 5 s;
  - no `pagehide`, envia com `navigator.sendBeacon`;
  - o `sessionId` é um uuid guardado em `sessionStorage`, com try/catch;
  - nunca lança erro nem atrapalha o jogo.
- **Onde instrumentar:**
  - `app_opened`: uma vez por sessão;
  - `song_opened`: quando a música fica pronta;
  - `mode_selected` e `game_started`: no `SongScreen`;
  - `game_finished`: em `finishGame`;
  - `game_abandoned`: ao desmontar ou sair durante a fase `game`;
  - `help_explain` e `help_translate`: no `GameScreen`;
  - `continue_after_leave`: no "Continuar" da tarefa 4;
  - `install_*`: no `InstallPromptGate`;
  - `invite_created`: na ação de criar convite;
  - `calibration_done`: no `CalibrationSheet`.

- [ ] **Passo 1: testes que falham:**
  - **Validação:** recusa um nome fora da lista; descarta campos de `props` não permitidos; recusa mais de 20 eventos.
  - **Rota:**
    - 401, 403 e 400;
    - 204 grava com o `user_id` da sessão, e um `user_id` mandado no corpo é ignorado;
    - o cliente de serviço não é criado antes de checar o membro.
  - **`track`:** junta e envia; com `sendBeacon` no `pagehide`; nunca lança erro.
  - **Instrumentação:** cada ponto chama `track` com o nome certo (`track` mockado).
- [ ] **Passos 2 a 4:** rode e veja falhar, implemente, rode `src/lib/metrics`, `src/app/api/events` e
  `src/components` e veja passar.
- [ ] **Passo 5:** `git commit -m "feat: record app usage events through a validated route"`

### Tarefa 14: Painel de métricas do dono

**Arquivos:**
- Criar:
  - `src/app/admin/metricas/page.tsx`
  - `src/app/admin/metricas/exportar/route.ts`
  - `src/lib/metrics/queries.ts`
  - `src/components/admin/MetricCard.tsx`
  - `src/components/admin/Projection.tsx` (cliente)
  - `docs/analytics.md`
  - os testes
- Modificar: `src/components/home/HomeLinks.tsx` (pílula "Métricas" só para o dono), `src/i18n/pt-BR.ts`

**Regras:**
- **Página:**
  - confere o dono do mesmo jeito que o `/admin` (`currentUserId`, `listActiveMembers`, `isActiveOwner`);
  - para quem não é o dono, chama `notFound()`;
  - lê os resumos com `createServiceSupabase()` **só depois** dessa checagem;
  - o período vem de `?dias=7|30` (padrão 30), e qualquer outro valor vira 30.
- **Cartões:**
  - gasto da IA no período e no mês;
  - custo médio por pessoa ativa, por partida e por música;
  - tokens e quanto veio da memória;
  - modos mais jogados;
  - partidas terminadas e abandonadas por modo;
  - músicas mais jogadas;
  - pedidos de ajuda por modo.
- **Valores:** em dólar e em reais, pela cotação `brl_rate` do `app_config`. A cotação pode ser trocada na página, por
  uma server action que também confere o dono.
- **Projeção:** campo "Pessoas por mês" (padrão 50) × custo médio por pessoa ativa nos últimos 30 dias.
- **Exportar:** `GET /admin/metricas/exportar?dias=30`, só para o dono (404 para os outros), devolve um JSON baixável
  com:
  - os resumos;
  - os registros do período: `ai_usage` com `user_id`, e `app_events`;
  - `generatedAt` e `schemaVersion`.
- **`docs/analytics.md`:** descreve as tabelas, as views, cada métrica e exemplos de consulta, para um assistente de
  IA analisar pelo conector do Supabase.
- **Visual:** usa os tokens da marca. Os cartões ficam legíveis no celular. A skill `dataviz` vale se houver gráfico.

- [ ] **Passo 1: testes que falham:**
  - **Acesso:** membro comum recebe `notFound` na página e 404 no exportar; o dono vê os cartões.
  - **Período:** `?dias` inválido vira 30.
  - **Cálculos:** a projeção e as médias somam certo com dados inventados; `brl_rate` inválida volta ao padrão.
  - **Home:** "Métricas" aparece só para o dono.
- [ ] **Passos 2 a 4:** rode e veja falhar, implemente, rode `src/app/admin`, `src/lib/metrics` e
  `src/components/home` e veja passar.
- [ ] **Passo 5:** `git commit -m "feat: owner metrics panel with projection and export"`

### Tarefa 15: Política de privacidade atualizada

**Arquivos:** `src/i18n/pt-BR.ts` (chaves `privacidade.*`) e `src/app/privacidade/page.test.tsx`

**Conteúdo novo:**
- **Registro de uso:** o app registra o uso da IA (tokens e custo) e as ações no app (lista resumida), para o dono
  entender o que funciona e quanto custa.
- **Quem vê:** só o dono vê esses registros.
- **Prazo:** ficam guardados por 12 meses.
- **YouTube:** as capinhas da tela inicial vêm do YouTube.
- **Data:** atualize a data no topo.

O texto final é **revisado pelo dono** antes da publicação.

- [ ] **Passos 1 a 4:** primeiro os testes que falham (os títulos e as menções a "registro de uso" e "12 meses"),
  depois implemente e veja passar.
- [ ] **Passo 5:** `git commit -m "docs: privacy policy covers usage records and thumbnails"`

### Tarefa 16: Publicar

Esta tarefa é do controlador, junto com o dono.

- [ ] **Verificar tudo:**
  - `npx vitest run`, `npx supabase test db`, `npx playwright test`, `npx tsc --noEmit`, `npx eslint src e2e` e
    `npx next build` passam;
  - a busca de marcas de IA nos commits a enviar sai vazia.
- [ ] **Revisão do dono:** ele revisa o texto da privacidade.
- [ ] **Migração hospedada:** com o "pode publicar" do dono, aplique `0006_metrics.sql` no banco hospedado (projeto
  `pvozdsnbxpyysuzectmb`) **antes** do envio.
- [ ] **Enviar:** envie a `main`, acompanhe o deploy e confira `/`, `/privacidade` e `/admin/metricas`. A página de
  métricas deve dar 404 sem login de dono.
- [ ] **Teste no celular (dono):**
  - a pausa com fade nas lacunas;
  - traduzir pausando;
  - sair e voltar;
  - as capinhas;
  - o painel de métricas.
