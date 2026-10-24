# Hookbop: ajustes depois do primeiro teste (desenho)

Data: 24/10/2026. Autor do pedido: o dono do Hookbop, depois de jogar a versão publicada em hookbop.vercel.app.
Base: a especificação original em `docs/superpowers/specs/2026-10-22-hookbop-design.md`, o plano da parte A
(`docs/superpowers/plans/2026-10-22-hookbop-parte-a.md`) e as decisões R1 a R87 registradas durante a construção.
Tudo o que este documento não muda continua valendo.

## Por que agora

O dono jogou o modo Escolha no celular e sentiu cinco problemas:

1. A música para de repente, às vezes cerca de 1 segundo antes de o cantor falar a palavra da lacuna. Sem ouvir a
   palavra, ele não sabe o que escolher.
2. A letra troca de verso "piscando". O olho não consegue acompanhar.
3. Ao sair do app e voltar, a letra parou de acompanhar o cantor (a música tocava e a letra ficou parada).
4. Ao tocar em "Traduzir verso", a música segue para o próximo verso e não dá tempo de ler a tradução.
5. O botão "Dica" não faz falta.

Ele também pediu duas coisas novas: a capinha (miniatura) de cada música no card da tela inicial, e um painel só
para ele, o dono, que mostre quanto a IA está custando e como as pessoas usam o app, com os dados organizados para
que um assistente de IA consiga analisá-los depois.

## Sucesso

- Nenhuma lacuna para antes de o jogador ouvir a palavra, mesmo com a letra até ~1 s adiantada.
- A pausa e a volta da música são suaves: o jogador tem tempo de pensar enquanto o som some.
- A letra desliza entre versos de um jeito que o olho acompanha sem esforço.
- Sair do app e voltar nunca deixa letra e música dessincronizadas.
- O dono abre um painel e vê, em poucos segundos, quanto gastou com IA, o custo médio por pessoa, por partida e por
  música, e o que as pessoas mais usam.

## Não-objetivos

- Anúncios. Os dados do painel servem para decidir depois onde eles cabem; nada de anúncio entra agora.
- Custos do Supabase e da Vercel no painel (estão no plano grátis); só o custo da IA.
- Serviços de análise de terceiros (Google Analytics e parecidos).
- Mudar as regras de pontuação, os modos ou o que conta como acerto.

## Antiobjetivos (falhas mesmo que "funcione")

- A música parar seco, ou voltar a tocar sozinha sem o jogador pedir.
- Animação que trava o celular, atrasa a resposta do toque ou cobre o player do YouTube.
- O painel ou os registros de uso ficarem visíveis para qualquer pessoa que não seja o dono.
- Registro de uso que deixe o jogo mais lento ou que guarde dado pessoal além do necessário.

## Restrições que continuam valendo

- Regras do YouTube: player oficial, nada desenhado por cima dele, sem tocar em segundo plano. Mudar o volume pela
  API oficial do player é permitido.
- Textos na tela em `src/i18n/pt-BR.ts`, lidos com `t()`; voz do DJ Bop (no máximo 8 palavras, sem culpar ninguém).
- Cores, fontes e tamanhos da marca; botões com pelo menos 44 px.
- Sem nenhuma marca de autoria de IA em commits, código ou documentos.
- Enviar código para a `main` publica o app (a Vercel está ligada ao repositório); publicar só com o "pode
  publicar" do dono.

## 1. A pausa com fade (decidido com o dono)

Hoje o jogo pausa quando faltam 150 ms para o fim do verso (`PAUSE_LEAD_MS` em `src/lib/game/reducer.ts`), e o
player recebe `pause()` na hora.

O novo comportamento, para toda lacuna em todos os modos com lacuna (Escolha, Digitação, Monte o verso):

1. No mesmo ponto em que o jogo pausa hoje, a música **não para**: ela segue tocando por volta de **2 segundos**,
   com o volume descendo devagar até zero, e só então pausa. A área de resposta já aparece no começo do fade.
2. Quando o jogador responde e o jogo manda a música seguir, ela **volta exatamente de onde o fade parou** (sem pular
   para trás), com o volume **subindo devagar** até o volume que tinha antes do fade.
3. Se o jogador responder durante o fade, antes da pausa, o volume já começa a subir dali, sem parar.
4. No **iPhone** o player do YouTube não deixa o app mudar o volume. Lá a música segue os mesmos ~2 s e pausa, e
   volta sem fade. Isso é limitação da Apple, aceita pelo dono.
5. "Repetir verso" e a repetição automática ao errar (que voltam ao começo do verso) também voltam com fade-in.
6. **Exceção, decidida com o dono:** durante o fade o começo do verso seguinte já toca baixinho, enquanto o jogador
   está respondendo. Se esse verso seguinte também tem uma lacuna esperando resposta, a música não volta de onde o
   fade parou: ela volta para o começo desse verso (um salto para trás de no máximo ~2 s), com fade-in, para o
   jogador ouvir a palavra dele. Assim nenhuma lacuna passa escondida dentro de um fade, nem num verso curto. Nos
   outros casos, volta de onde parou.

Por que ~2 s: dá folga para a palavra no fim do verso e para letras até ~1 s adiantadas em relação ao clipe.

O construtor precisa garantir: durante o fade o relógio da música passa do fim do verso para o começo do próximo.
Isso não pode fazer o jogo achar que a lacuna "passou", marcar lacunas do verso seguinte, nem trocar o verso
mostrado na tela antes da resposta.

A duração exata (entre 1,5 e 2,5 s) e a curva do volume ficam com o construtor.

Pontuação (minha decisão, para não mudar as regras): uma resposta dada durante o fade ou durante a pausa continua
valendo como "antes do fim do verso", como hoje. O bônus de resposta rápida e o campo `answers.before_line_end` não
mudam de significado só porque o relógio do clipe andou durante o fade.

## 2. "Traduzir verso" pausa a música (decidido com o dono)

- Fora do Karaokê, tocar em "Traduzir verso" faz o mesmo fade-out e pausa. A tradução aparece embaixo do verso
  (com animação de carregamento enquanto chega) e um botão **"Continuar"** volta a música de onde parou, com fade-in.
- Se o jogo já estava esperando uma lacuna, a tradução não muda a espera: responder continua sendo o que solta a
  música, e o "Continuar" não aparece.
- No Karaokê não pausa: lá as traduções já aparecem sozinhas (palpite aceito pelo dono por não ter objetado).
- A folha de ajuda do DJ Bop ("Não entendi") já pausa (decisão R70); passa a usar o mesmo fade.

## 3. Animações (decidido com o dono; detalhes com o construtor)

O mais importante para o dono: a letra.

- **Letra deslizando.** Quando o verso muda, a letra inteira sobe deslizando, em menos de meio segundo, como nas
  letras do Spotify ou do Apple Music. O verso atual fica grande e claro; o anterior sobe, diminui e esmaece; o
  próximo aparece embaixo, apagado, chegando. Vale para o painel de letra dos modos com lacuna e para o Karaokê.
- **Lacuna da vez** pulsa em verde-limão para chamar o olho.
- **Respostas:** acerto dá um pulinho com o ✓; erro dá uma tremidinha curta com o ✕.
- **Carregando:** o disco do logo gira enquanto a música e a letra carregam; um brilho passa onde a tradução vai
  entrar até ela chegar; a folha do DJ Bop mostra o mesmo tipo de carregamento.
- **Transições:** a folha de ajuda sobe de baixo; a tela de fim, o seletor de modo e as outras trocas de tela entram
  com uma transição curta, em vez de trocar seco; os cards da tela inicial aparecem em sequência.
- **"Reduzir movimento"** ligado no celular: tudo vira fade simples, sem deslizar nem pular.
- Só `transform` e `opacity`; nada pode atrasar o toque nem cobrir o player.

Ferramenta (decisão do construtor, com meu palpite registrado): o dono costuma pedir as animações dos projetos
dele com GSAP. Para este app, minha escolha é GSAP no núcleo (com o pacote para React), sem rolagem suave (Lenis)
nem animação ligada à rolagem da página, que brigariam com a rolagem própria do Karaokê e com o jogo.

## 4. Tirar o botão "Dica" (decidido com o dono)

- O botão some da barra de ferramentas em todos os modos.
- O que fica no lugar e o que fazer com o código da dica que deixa de ser usado (no reducer e nos direitos de fase)
  fica com o construtor. Os registros antigos com tipo "com ajuda" continuam válidos no banco.

## 5. Capinha da música (decidido com o dono)

- O card de "Músicas da galera" mostra a miniatura do vídeo que o próprio YouTube oferece (endereço público de
  miniatura pelo id do vídeo), carregada só quando o card aparece, com texto alternativo.
- A imagem não é guardada pelo app. Se não carregar, volta o disco de hoje.
- A política de privacidade passa a dizer que a tela inicial carrega imagens do YouTube.

## 6. Sair do app e voltar (decidido com o dono, item 4 é palpite aceito)

1. Ao sair, a música pausa (como já faz hoje, decisão R84).
2. Ao voltar, antes de tudo o jogo pergunta ao player em que ponto o clipe está e realinha a letra, sem marcar
   lacunas como puladas pelo tempo fora.
3. A música não volta sozinha: aparece um botão grande **"Continuar"** (fora do player), que volta de onde parou,
   com fade-in.
4. Se o celular fechou o app de vez, o progresso da partida (música, modo, dificuldade, ponto do clipe, respostas
   já dadas) fica guardado no aparelho; ao abrir aquela música de novo, o app oferece **"Continuar de onde parou"** ou
   começar do zero. O progresso guardado some quando a partida termina.

O construtor deve primeiro reproduzir o travamento relatado (a letra parada com a música tocando depois de voltar)
e achar a causa antes de corrigir; o "realinhar" do item 2 é o comportamento esperado, não a hipótese da causa.

O que o dono viu, para reproduzir: **Android, com o Hookbop instalado na tela inicial. Ele trocou de tela por cerca de
1 segundo e voltou. A música voltou a tocar sozinha, e a letra parou de acompanhar.** Duas coisas para explicar: por
que a música voltou sozinha (pela decisão R84 ela devia ter pausado e esperado), e por que a letra ficou parada com o
clipe tocando.

## 7. Painel de métricas do dono (decidido com o dono)

### O que o app registra

- **Cada uso da IA**: quando, quem, música e verso, tipo (explicação ou tradução), modelo, tokens de entrada e de
  saída, custo estimado em dólar, tempo de resposta, resultado (deu certo, recusada, erro) e de onde veio a resposta
  (da IA, da memória por verso, ou reaproveitada do refrão, essas duas sem custo).
- **Cada ação no app**: quem, quando, uma identificação da sessão (uma por abertura do app) e o nome da ação, com
  poucos detalhes da ação. Ações: abrir o app, abrir uma música, escolher modo, começar partida, terminar partida
  (com acerto e duração), sair no meio de uma partida, pedir explicação, pedir tradução, continuar depois de sair,
  ver e aceitar o convite de instalação, criar convite, calibrar o tempo.
- Os registros são gravados pelo servidor, a partir de uma lista fechada de ações e com tamanho limitado; nenhum
  membro consegue ler esses registros.

### O painel

- Um botão **"Métricas"** ao lado do "Admin" na tela inicial, que só aparece para o dono (o e-mail em
  `app_config.owner_email`, hoje dottoleao@gmail.com).
- O servidor confere que é o dono em cada acesso; para qualquer outra pessoa a página não existe (como já faz o
  `/admin`, que usa `isActiveOwner`).
- Cartões simples, com escolha de período (por exemplo 7 e 30 dias):
  - gasto da IA no período e no mês;
  - custo médio por pessoa ativa, por partida e por música;
  - projeção: "com N pessoas por mês, o gasto seria X", a partir da média por pessoa;
  - tokens usados e quanto da IA veio da memória (economia);
  - modos mais jogados; partidas terminadas e abandonadas por modo; músicas mais jogadas;
  - em que modo e em que parte da música as pessoas mais pedem ajuda.
- Valores em dólar (como a Anthropic cobra), com estimativa em reais por uma cotação que o dono define.
- O custo é estimado pelos tokens registrados e pelo preço do modelo guardado no código, com a data do preço.

### Pensado para a IA analisar

- Os dados ficam em tabelas e em resumos prontos no banco (por dia, por modo, por música), que um assistente de IA
  consulta direto pelo conector do Supabase quando o dono pedir uma análise.
- Um botão **"Exportar dados"** no painel baixa um arquivo com os resumos e os registros do período.
- Um documento em `docs/` descreve as tabelas, os resumos e o significado de cada métrica, para qualquer assistente
  entender sem ler o código.

### Privacidade

- A política de privacidade passa a explicar esse registro de uso: o que é registrado, para que serve, quem vê (só o
  dono) e por quanto tempo fica guardado (o construtor propõe o prazo e o dono aprova na revisão do texto).

## O que fica com o construtor

- Durações e curvas exatas do fade e das animações, dentro do que está acima.
- Como os comandos de volume entram no adaptador do player e no reducer.
- O desenho visual dos cartões do painel e se há gráficos.
- O formato exato das tabelas, das ações e do arquivo exportado.
- A ordem de entrega das partes.
