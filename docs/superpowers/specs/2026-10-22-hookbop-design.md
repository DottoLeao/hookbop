# Hookbop: design da versão 1

Data: 2026-10-22
Situação: rascunho para aprovação (revisado depois da leitura de um builder)

Referências de apoio, todas neste projeto ou ligadas a ele:

- Pesquisa de concorrentes: `reports/Reclamações sobre LingoClip e Duolingo.md`
- Pesquisa de letras sincronizadas: `reports/Letras sincronizadas para músicas do YouTube.md`
- Wireframes e marca (canvas): https://claude.ai/artifact/UJtXzHGE6zR2TKZ2FJvsq1

Neste documento, **(decidido)** é o que o dono do produto escolheu. **(escolha de design)** é uma decisão tomada durante o desenho que ele ainda pode revisar ao ler.

---

## 1. Intenção

O Hookbop é um PWA grátis para aprender inglês com qualquer música do YouTube. O clipe toca no player oficial, e ao lado dele o jogador completa, monta e canta a letra em jogos curtos. A experiência precisa ser divertida e satisfatória, com aquela sensação boa de progresso, mas sem enganar o jogador.

Por que existe:

- O dono do produto não gosta de pagar por apps assim e quer usar o próprio app. **(decidido)**
- Os concorrentes erram em pontos conhecidos:
  - O LingoClip limita o plano grátis a 3 jogos por dia e cobra de R$16,90 a R$19,90 por mês. Usuários pedem, por conta própria, para ver anúncio em troca de mais jogos.
  - Os jogos de completar letra "não ensinam": falta tradução e explicação em português.
  - O Duolingo admitiu que a fricção do plano grátis freou o crescimento. Os usuários reclamam do sistema de Energia e de cobranças inesperadas.
- O plano é começar com um grupo de amigos e depois lançar para o mundo todo. Por isso o nome é em inglês. **(decidido)**

## 2. Fases

| Fase | Quem usa | O que muda |
|---|---|---|
| **Fase 1 (esta spec)** | O dono do produto e os amigos dele, só com convite **(decidido)** | Grátis, sem anúncios ligados, letras do LRCLIB |
| Lançamento público (fora desta spec) | Qualquer pessoa, primeiro no Brasil e depois no mundo | Letras licenciadas, anúncios premiados ligados, assinatura opcional, parecer jurídico |

A fase 1 precisa ser construída de um jeito que não exija reescrever o app para chegar ao lançamento público. Na prática:
- a fonte das letras é uma peça trocável;
- a monetização é desenhada desde já, mas fica desligada;
- os textos ficam prontos para tradução.

## 3. Objetivos, não objetivos e antiobjetivos

**Objetivos da fase 1**

- Colar qualquer link de música do YouTube e jogar em poucos segundos, com a letra sincronizada.
- Quatro modos de jogo: Escolha, Digitação, Karaokê e Monte o verso. **(decidido)**
- Duelo contra o "fantasma" de um amigo, com convite pelo WhatsApp e por QR code. **(decidido)**
- Rank pessoal, ranking semanal da galera, placar por amigo e recorde por música. **(decidido)**
- Ofensiva com congelamento grátis, reparo e ofensiva em dupla. **(decidido)**
- Funcionar bem no celular, com instalação na tela inicial (PWA) e notificações.

**Não objetivos da fase 1**

- Os modos Refrão de memória, Caça ao erro e "O que ele quis dizer?" vêm depois, nessa ordem. **(decidido)**
- Anúncios ligados e cobrança de verdade.
- Ranking global e ligas com desconhecidos.
- Revisão espaçada de vocabulário e lista de "palavras que mais erro". **(escolha de design: fica para depois)**
- Modo "toque para sincronizar", para músicas que nenhum banco de letras tem. **(escolha de design: fica para depois)**
- Pronúncia pelo microfone.
- Outros idiomas na interface. A estrutura fica pronta, mas o conteúdo só sai em português do Brasil.

**Antiobjetivos: o que torna o app um fracasso mesmo que ele funcione**

- Mentir para o jogador sobre acerto, erro ou dificuldade. Nada de manipular a dificuldade escondido por causa de anúncio, no estilo "Block Blast". **(decidido)**
- Marcar como errado algo que o jogador acertou, ou o contrário.
- Bloquear o jogo, limitar quantas músicas dá para jogar ou punir quem acerta. É o erro do LingoClip e da Energia do Duolingo.
- Notificação que dá culpa ou ofensiva que vira obrigação.
- Quebrar as regras do YouTube: baixar áudio, cobrir o player, cobrar ou recompensar por assistir.

## 4. Regras externas que limitam o design

Estas regras vêm das Políticas para Desenvolvedores do YouTube e da lei brasileira. Os detalhes estão nos dois relatórios.

- O clipe toca **sempre** no player oficial do YouTube, visível, com pelo menos 200×200 px, e **nada por cima**. O jogo fica ao lado ou embaixo.
- É proibido baixar, guardar ou separar o áudio do vídeo, e também tocar em segundo plano ou com a tela bloqueada.
- É proibido cobrar ou exigir qualquer ação além do play para assistir a um vídeo. Anúncio e assinatura liberam **extras do jogo**, nunca o clipe.
- É proibido dar recompensa por assistir. XP e ofensiva vêm de **respostas e músicas terminadas**, nunca de tempo de vídeo.
- Títulos e miniaturas guardados do YouTube precisam ser atualizados ou apagados a cada 30 dias.
- Para vídeos marcados como "feito para crianças", o rastreamento do player precisa ficar desligado.
- Letras e traduções de letras têm direito autoral (Lei 9.610/98, art. 29). Na fase 1, que é fechada e só para convidados, o app usa o LRCLIB. Antes do lançamento público, isso precisa de licença (Musixmatch ou LyricFind) e de parecer de um advogado.

## 5. Como uma música vira jogo

O app pega a letra **já sincronizada**, ou seja, com o horário de cada linha, num banco de letras. A IA não transcreve o áudio. **(decidido, com base na pesquisa)**

1. **Escolha da música.** Na fase 1, o jogador cola um link do YouTube **(escolha de design)**. No Android, o app também aparece no menu "Compartilhar" do YouTube **(escolha de design)**. A tela inicial mostra as "músicas da galera", que são as que o grupo já jogou. Uma busca dentro do app é opcional e limitada: a cota grátis do YouTube permite cerca de 100 buscas por dia.
2. **Dados do vídeo.** O app lê título, canal e duração, pelo player ou pela API oficial do YouTube.
3. **Limpeza do título.** Remove "(Official Video)", "Lyric Video", "- Topic" e similares, e separa artista e música.
4. **Memória do app.** Se esse vídeo já foi resolvido antes, o app usa o que guardou (letra, ajuste de tempo e lacunas) e o jogo abre na hora.
5. **Busca da letra no LRCLIB.** É feita direto do navegador, com o cabeçalho que identifica o app. O app escolhe o resultado pelo nome, pelo artista e pela duração mais próxima da do vídeo, e desiste depois de alguns segundos se o serviço estiver lento.
6. **Ajuste de tempo (offset).** Se o vídeo for mais de 10 segundos mais longo que a letra, o app pede uma calibração: "toque quando a primeira linha começar", com botões de ±0,5 s. O ajuste fica salvo por vídeo e vale para todo mundo. O app também oferece trocar para a versão "áudio oficial" do mesmo artista.
7. **Sem letra.** Quando a letra não existe, o app avisa ("Ainda não temos a letra dessa") e sugere a versão de áudio oficial ou outra música.
8. **Guardar.** O app salva vídeo → letra, ajuste de tempo e posição das lacunas. Na fase 1, também pode guardar o texto da letra para carregar mais rápido.

A fonte de letras fica atrás de uma interface própria. Trocar o LRCLIB pela Musixmatch no lançamento público deve ser só trocar essa peça. **(decidido em princípio, com base na pesquisa)**

## 6. Onde a IA entra

- **Só quando o jogador pede**, tocando em "Não entendi" ou em "Traduzir verso". **(decidido)**
  - "Não entendi" explica em português aquela palavra ou aquele verso: gíria, contração, phrasal verb, como a palavra soa quando é cantada.
  - "Traduzir verso" traduz **só aquela linha**.
- O resultado fica guardado por linha, para o próximo jogador receber na hora.
- **Acerto e erro nunca usam IA.** A confirmação é visual: a palavra fica limão com ✓, ou coral com ✕, sem texto. **(decidido)**
- As lacunas e as opções erradas do modo Escolha são feitas por **regras fixas** na fase 1, sem IA. As regras estão na seção 7. **(escolha de design, alinhada ao "IA só no Não entendi")**
- Modelo sugerido: um modelo barato e rápido, como Claude Haiku 5.5, chamado pelo servidor e nunca direto do navegador. O custo é de frações de centavo por pedido.

## 7. Modos de jogo da versão 1

O que vale para todos os modos:

- **Tela:** o player fica em cima. Embaixo vêm a letra (verso anterior em cinza, verso atual em destaque, próximo verso em cinza) e depois a área do modo.
- **Ferramentas:**
  - **0.75x:** usa a velocidade de reprodução do próprio player.
  - **Repetir verso:** volta o clipe ao começo da linha.
  - **Repetir sozinho depois de errar:** é uma opção que vem ligada.
  - **Dica:** na fase 1 é grátis. No público, vira anúncio premiado. Não aparece nos duelos.
- **Tradução:** fica escondida nos modos de jogo e aparece com "Traduzir verso". No Karaokê, ela aparece por padrão e dá para esconder. Quem está começando pode ligar "mostrar tradução sempre" nas configurações. **(decidido)**
- **Sem perder por tempo.** Quando a linha termina sem resposta, o clipe pausa e espera. Responder antes de a linha acabar dá bônus de combo. **(escolha de design)**
- **Dificuldade (escolha de design):**

  | Nível | Lacunas |
  |---|---|
  | Fácil | uma em cerca de 1 a cada 3 linhas |
  | Médio | uma em cerca de metade das linhas |
  | Difícil | uma em todas as linhas, às vezes duas |

- **Regras para escolher a lacuna (escolha de design):**
  - Só entram linhas com horário confiável.
  - Preferência para phrasal verbs, contrações como gonna e wanna, e palavras de conteúdo comuns.
  - Ficam de fora artigos, preposições soltas, nomes próprios e "oh, yeah" de fundo.
  - O builder escolhe as listas de palavras.

**Escolha.** São três opções: a certa e duas de som ou escrita parecidos, tiradas de uma lista de palavras reais do inglês. Elas são geradas por regra, por exemplo com código fonético e distância entre palavras, e nunca podem ser a palavra certa nem um sinônimo aceitável.

**Digitação.** O jogador digita a palavra que falta. A correção aceita uma letra trocada de lugar, faltando ou sobrando, desde que o que foi digitado **não seja outra palavra que existe**. Por exemplo, "gte" conta como "get", mas "got" conta como erro. Quando houve correção, as letras arrumadas aparecem com um sublinhado ondulado. **(decidido)**

**Karaokê.** A letra rola com o clipe, com a linha atual em destaque e a tradução embaixo. Tocar numa palavra ou expressão mostra o significado e permite salvar como figurinha. Esse modo não tem pontuação de acerto. Ele **não dá XP e não conta** para a ofensiva, para o reparo nem para a ofensiva em dupla. Terminar um Karaokê é, na prática, assistir ao clipe até o fim, e as regras do YouTube proíbem dar recompensa por isso. Para quem está começando, o caminho que conta é o modo Escolha no nível Fácil com "mostrar tradução sempre". **(escolha de design)**

**Monte o verso.** As palavras do verso atual aparecem embaralhadas em peças, e o jogador toca nelas na ordem certa. As peças já usadas ficam apagadas. "Não entendi a ordem" explica a estrutura da frase com IA, sob demanda.

**Duelo contra o fantasma** (em cima do modo Escolha):

1. O desafiante joga uma música.
2. O app gera um link e um QR code com as **mesmas lacunas e as mesmas opções**.
3. O amigo joga e vê, em cada linha, se o desafiante acertou ou errou ali ("J acertou", "J errou aqui"), com o placar ao vivo.
4. O prazo é de 48 horas **(escolha de design)**.
5. O resultado conta no placar entre os dois ("Você 5 × 3 João"), mas **não** mexe no rank. Depois vem a oferta de revanche.
6. A primeira partida de um convidado acontece **sem cadastro**.

## 8. Progresso e recompensa

- **XP:** vem de respostas certas. O combo multiplica o XP, e acertos seguidos aumentam o som e o número. Repetir a mesma música rende cada vez menos XP. **(decidido)**
- **O que conta como acerto (escolha de design):**
  - **Só a primeira tentativa de cada lacuna** conta para a porcentagem, o combo, o XP, o ranking semanal, o recorde da música e o duelo.
  - Depois de errar, o verso repete e o jogador pode tentar de novo para treinar. A lacuna fica certa na tela, mas essa nova tentativa não vale pontos.
  - **Lacuna respondida com Dica** conta como "com ajuda": aparece no fim da música, mas não dá pontos nem soma no combo.
  - O app guarda, em cada resposta, se ela foi de primeira, repetida ou com ajuda. Isso é obrigatório desde a fase 1.
  - **Bônus vindos de anúncio**, como o XP em dobro no lançamento público, valem só para o rank pessoal, que não é competição. Eles nunca contam no ranking semanal nem nos duelos.
- **Rank pessoal, que só sobe:** Ouvinte → Fã → DJ de garagem → DJ de festa → Headliner → Lenda. O builder define os limites de XP de cada nível. **(decidido)**
- **Ranking semanal da galera:** junta o jogador e os amigos dele, conta só o XP de acertos e zera toda segunda-feira. **(decidido)**
- **Recorde por música:** o melhor resultado do jogador e o do melhor amigo naquela música aparecem no cartão da música ("João fez 92% nessa. Bora bater?"). **(decidido)**
- **Álbum de figurinhas:**
  - Cada palavra ou expressão acertada pela primeira vez vira uma figurinha.
  - Expressões e gírias de uma lista curada são "raras" e aparecem em lilás.
  - No Karaokê, o jogador também pode salvar figurinhas manualmente.
- **Fim da música:** porcentagem de acerto, combo máximo, XP ganho, ofensiva, figurinhas novas e os botões "Desafiar no WhatsApp", "QR code", "Jogar de novo" e "Outro modo".
- **Ofensiva, o "set do dia"** **(decidido)**:
  - Um dia conta quando o jogador termina pelo menos uma música num modo com pontuação: Escolha, Digitação, Monte o verso ou duelo.
  - **Congelamento grátis:** um a cada 7 dias seguidos, com no máximo 2 guardados.
  - **Reparo:** se a ofensiva acabar, o jogador recupera jogando 3 músicas no dia seguinte.
  - **Ofensiva em dupla:** com um amigo, só cresce nos dias em que os dois jogam.
- **Notificações** **(decidido)**:
  - no máximo uma por dia, no horário em que a pessoa costuma jogar;
  - no jeito de falar do DJ Bop, sem culpa;
  - dá para desligar.

  No iPhone, as notificações só funcionam com o app instalado na tela inicial.

## 9. Entrada e convites

**(decidido)**

- Nesta fase só entra quem tem convite. O convite chega por link no WhatsApp ou por QR code.
- O primeiro duelo é jogado sem cadastro, direto no navegador.
- Para salvar o progresso, a pessoa entra com a conta do Google ou recebe um link de acesso por e-mail.
- Depois da primeira música, o app sugere "Adicionar à tela inicial".

**Regras do convite e da amizade (escolha de design):**

- **Quem pode convidar:** qualquer pessoa que já está no app.
- **Cada link de convite ou de duelo é pessoal.** A primeira pessoa que abre o link e joga fica com ele. Se o link for repassado num grupo grande, os outros caem numa tela do tipo "Pede um convite pra quem te mandou". Isso mantém a fase 1 fechada de verdade, que é a condição para usar o LRCLIB.
- **Limite:** no máximo 50 pessoas na fase 1. O dono do produto pode remover alguém.
- **Duelo é sempre entre duas pessoas.** Desafiar a galera toda fica para depois.
- **Amizade:** cada pessoa tem a sua lista de amigos. Duas pessoas viram amigas automaticamente quando uma entra pelo convite da outra ou aceita um duelo dela. Dá para adicionar mais amigos depois, por link ou QR code.
- **"Galera":** é você mais os seus amigos.
  - "Músicas da galera" são as músicas que você e seus amigos jogaram.
  - O ranking semanal mostra você e seus amigos.
  - No cartão da música, o "melhor amigo" é o amigo com o maior resultado naquela música.

## 10. Monetização: desenhada agora, ligada no lançamento público

**(decidido)**

- **O modelo:** o jogo é grátis e sem limite. Os anúncios premiados são opcionais e aparecem só nas pausas. Existe também uma assinatura barata para tirar os anúncios do app e liberar extras.
- **O que um anúncio premiado pode liberar:**
  - uma dica;
  - XP em dobro numa música, que conta só para o rank pessoal (ver a seção 8);
  - outro jeito de reparar a ofensiva.

  A "segunda chance" saiu da lista, porque o jogo não tem derrota e não há do que salvar o jogador. **(escolha de design)**
- **O que um anúncio nunca faz:**
  - liberar um clipe;
  - aparecer no meio de uma rodada;
  - aparecer em cima do player;
  - dar vantagem em ranking ou em duelo, porque na web não dá para confirmar que o anúncio foi realmente visto.
- **Na fase 1,** cada um desses lugares já existe no app, marcado com uma borda tracejada, mas libera grátis. O código precisa ter um controle central de "o que este usuário pode usar", para que ligar anúncios e assinatura seja uma mudança de configuração, não de tela.
- **A assinatura** promete "sem os anúncios do app, mais extras". Ela não consegue tirar os anúncios que o YouTube mostra dentro do clipe, e o texto precisa dizer isso com exatidão.
- **O preço de referência no Brasil** fica entre R$6,90 e R$15 por mês, com cancelamento em um toque e aviso antes de renovar.
- **Aviso sobre as contas:** anúncio premiado na web brasileira paga pouco, e a licença das letras custa a partir de US$199 por mês. O plano de negócio para o lançamento público fica fora desta spec.

## 11. Marca

A marca foi aprovada nas sete partes, e todas estão no canvas. **(decidido)**

- **Nome:** Hookbop. Os domínios hookbop.com, .app e .com.br estavam livres em 2026-10-22; o registro fica com o dono do produto. A marca ainda não foi pesquisada no INPI, nos EUA nem na Europa.
- **Logo:** "h" + dois discos de vinil no lugar dos "o" + "kbop". O símbolo é um disco sozinho.
- **Mascote:** o DJ Bop, com cabeça de disco verde-limão, boné para trás e fone no pescoço. Tem quatro expressões: acertou, errou, combo e desafio.
- **Cores:**

  | Grupo | Cores |
  |---|---|
  | Base | fundo #0E0E10, cartão #1C1C21, elevado #26262C, borda #3A3A42 |
  | Texto | #FFFFFF, secundário #A9A9B2, apagado #6E6E78 |
  | Destaque | limão #C8FF2E (claro #E2FF8A, escuro #A6D91A), sempre com texto escuro em cima |
  | Momentos do jogo | acerto = limão, erro #FF5C5C, aviso #FFB020, raro #B794FF |

- **Tipografia:** Space Grotesk para títulos, verso em jogo e logo, e Inter para o resto. Os tamanhos são 28, 22, 16, 15, 14 e 12.
- **Jeito de falar do DJ Bop:**
  - nunca zoa;
  - fala curto, com no máximo 8 palavras;
  - usa gíria leve e universal;
  - ensina uma gíria em inglês por vez;
  - convida em vez de cobrar.

  As falas dos 12 momentos do jogo estão no canvas.
- **Ícone:** disco preto em fundo limão.
- **Componentes:** cantos de 8, 12, 14 e 20 px e pílula, e espaços de 4, 8, 12, 16 e 24 px. O toque mínimo é de 44 px.

Os wireframes no canvas ainda estão em cinza e com letras inventadas. A marca deve ser aplicada a eles antes ou durante a construção.

## 12. Plataforma e tecnologia

**(escolha de design. O dono do produto já tem Supabase e Vercel conectados.)**

- **App:** PWA instalável, feito com o framework web que o builder preferir. Ele roda no celular primeiro, mas também funciona no computador.
- **Hospedagem:** Vercel.
- **Banco de dados, login e funções no servidor:** Supabase. O login é pelo Google e por link de e-mail, e o acesso aos dados é protegido por regras por linha.
- **Player:** a YouTube IFrame Player API. O tempo do jogo vem do relógio do player, e o app não processa nenhum áudio.
- **Letras:** LRCLIB na fase 1, atrás da interface trocável descrita na seção 5.
- **IA:** chamada só pelo servidor, com o resultado guardado por linha.
- **Notificações:** Web Push.
- **Textos da interface:** ficam num arquivo de tradução desde o primeiro dia.

Custo esperado na fase 1: menos de US$10 por mês, contando as chamadas de IA, mais os planos grátis do Supabase e da Vercel.

**Dados mínimos que o app precisa guardar.** O desenho exato fica com o builder.

- usuários, perfis e convites;
- amizades;
- vídeos resolvidos: id do YouTube, título e duração com atualização a cada 30 dias, id da letra, ajuste de tempo e votos de ajuste;
- linhas e posição das lacunas;
- partidas e respostas;
- duelos;
- XP semanal, rank e ofensivas, incluindo as em dupla;
- figurinhas;
- explicações e traduções guardadas por linha;
- inscrições de notificação.

## 13. Como saber se a fase 1 deu certo

- O dono do produto e os amigos jogam várias vezes por semana sem ninguém precisar lembrar.
- A maioria dos links colados vira jogo em poucos segundos, com a letra no tempo certo, ou depois de uma calibração rápida.
- Os duelos acontecem: um amigo desafia o outro e o outro responde dentro do prazo.
- Ninguém reclama de gabarito errado.

O builder pode medir isso com contagens simples: partidas por pessoa por semana, quanto tempo leva até a letra aparecer, quantos vídeos ficam sem letra e quantos duelos são aceitos.

## 14. Deixado para o builder

- O framework web e a organização do código.
- As listas de palavras: frequência, phrasal verbs, contrações e gírias raras.
- O algoritmo de palavras parecidas para o modo Escolha.
- O desenho do banco de dados.
- Os limites de XP de cada rank.
- Os valores exatos de combo e de XP.
- Como medir o tempo de resposta.
- Os textos de tela que não estão no canvas, sempre seguindo as regras de voz do DJ Bop.

## 15. Riscos conhecidos

- **LRCLIB:** é mantido por uma pessoa só, não tem licença das letras e às vezes fica lento ou fora do ar. Por isso o app guarda os ids e os ajustes de tempo, e a fonte das letras é trocável.
- **Clipes com introdução ou diálogo no meio:** a calibração resolve o atraso fixo. Diálogos no meio da música continuam sendo um problema.
- **Clipes indisponíveis:** alguns vídeos não podem ser exibidos fora do YouTube. O app precisa detectar isso e sugerir outra versão.
- **Vídeos e regras do YouTube:** se o acesso à API for suspenso, o app perde o player. Respeitar a seção 4 é obrigatório.
- **Concorrência:** a Fill the Song já promete jogo grátis e ilimitado, e o LingoClip pode afrouxar o limite dele. O diferencial do Hookbop está na execução: explicação em português, Monte o verso, duelo com fantasma e a marca.

## 16. Pendências do dono do produto antes de construir

- **Ordem de entrega (decidido):** a versão 1 chega aos amigos em três partes. Não há prazo definido.

  | Parte | O que entra |
  |---|---|
  | A · Jogo principal | Colar o link (e compartilhar do YouTube no Android), letra sincronizada com calibração e memória por vídeo, os quatro modos, as ferramentas, "Não entendi" e "Traduzir verso", fim da música, XP e combo. Também entram o mínimo para os amigos entrarem: convite pessoal, login pelo Google ou por e-mail e "Adicionar à tela inicial". |
  | B · Duelos e ranks | Duelo contra o fantasma (link e QR code, jogar sem cadastro), amizades automáticas, rank pessoal, ranking semanal da galera, placar por amigo e recorde por música. |
  | C · Ofensiva, figurinhas e notificações | Set do dia, congelamento, reparo, ofensiva em dupla, álbum de figurinhas comuns e raras, e notificações no celular. |

  Cada parte deve deixar o app inteiro e usável. Os lugares dos anúncios (seção 10) e a regra do que conta como acerto (seção 8) entram já na parte A.
- **Projeto no Supabase:** a organização já tem 2 projetos ativos, job-search-pipeline e radar-de-vagas. Se ela estiver no plano grátis, que permite poucos projetos ativos ao mesmo tempo, é preciso pausar um deles ou pagar o plano Pro. [a definir]
- **Domínio:** registrar o hookbop.app, ou outro domínio, antes do primeiro convite. Trocar de domínio depois obriga todo mundo a reinstalar o app e a ligar as notificações de novo, e quebra os links já enviados. [a definir]
