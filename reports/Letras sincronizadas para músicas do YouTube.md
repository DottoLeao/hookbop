# Sincronizar letras exige banco, offset e licença

Para a letra aparecer sincronizada em poucos segundos em qualquer clipe do YouTube, o app não deve pedir a uma IA que "escute" o vídeo. **As regras do YouTube proíbem baixar, guardar ou separar o áudio do clipe**, e mesmo as melhores IAs ainda **erram de 12% a 20% das palavras cantadas**. O que funciona é buscar uma letra *já sincronizada*, com o horário de cada linha, num banco de letras, a partir do artista, do nome da música e da duração do vídeo. Depois o app corrige o *offset*, o atraso fixo criado pela introdução do clipe, uma vez por vídeo, e guarda a correção para todos os jogadores. A IA entra só no texto: traduz, explica em português e escolhe as lacunas, por **menos de meio centavo de dólar por música** com modelos baratos. Na primeira versão, para você e seus amigos, o LRCLIB (banco gratuito e comunitário) trouxe letra sincronizada para **42 de 42 músicas populares testadas**, e a conta mensal fica **abaixo de US$ 10**, sem contar hospedagem. Num lançamento público e monetizado, o LRCLIB não serve, porque não tem licença das letras e é mantido por uma única pessoa. A fonte licenciada mais barata com sincronia, o plano Grow da Musixmatch, custa **US$ 199 por mês**. Perto de 10 mil jogadores o custo sobe para **US$ 499**, e acima disso vira **acordo a partir de US$ 2.000**. A tradução em português é uma segunda barreira, porque a Lei 9.610/98 exige autorização do autor para traduzir. O LyricsTraining junta clipes embutidos do YouTube com letras licenciadas de editoras e mostra que o modelo é viável quando a parte jurídica está resolvida.

## O YouTube entrega o vídeo e o relógio, e a letra precisa vir de fora

Alguns termos aparecem o tempo todo neste relatório:

| Termo | Em palavras simples |
|---|---|
| **Letra sincronizada** | Letra em que cada linha (ou cada palavra) vem com o horário em que é cantada, por exemplo `[00:29.57]`. É isso que deixa o app destacar a linha certa enquanto o clipe toca. A sincronia "linha a linha" marca o começo de cada verso. A "palavra a palavra" marca cada palavra, no estilo karaokê. |
| **LRC** | O formato de arquivo mais comum para letra sincronizada: o texto da letra com o horário na frente de cada linha. |
| **Offset** | Um deslocamento fixo de tempo. Se o clipe tem 20 segundos de cena antes da música começar, todas as linhas aparecem 20 segundos adiantadas. Corrigir o offset é somar esses 20 segundos a todas as linhas. |
| **Alinhamento** | Encaixar no áudio um texto que já se conhece, descobrindo em que segundo cada palavra é cantada. A IA não precisa adivinhar as palavras, só o momento de cada uma. |
| **Transcrição** | A IA ouve e escreve a letra do zero, sem texto de referência. É bem mais difícil e erra muito mais. |
| **Casamento** (*matching*) | Descobrir qual registro do banco de letras corresponde àquele vídeo específico, com aquela duração. |
| **Cache** | Guardar um resultado já calculado para que o próximo jogador o receba na hora, sem refazer o trabalho. |

O player oficial embutido funciona como um relógio confiável. Pela API oficial, o app pergunta em que segundo o vídeo está (`getCurrentTime`) e qual é a duração total (`getDuration`, que devolve zero até o vídeo carregar). Também pode pausar ou pular para um trecho com `seekTo` ([YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)). Consultando esse relógio de 4 a 10 vezes por segundo, o app destaca a linha certa no painel ao lado. O que o player **não entrega é texto nem som**. O único ajuste de legendas documentado é ligar, desligar e mudar o tamanho delas dentro do próprio player, e nenhuma função devolve o texto da legenda ou o áudio ([YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)).

As outras portas também estão fechadas. Baixar legendas pela API oficial (`captions.download`) exige que o usuário tenha **permissão de editar o vídeo**, ou seja, que seja o dono do canal, e cada chamada custa 200 unidades de cota ([YouTube Data API: captions.download](https://developers.google.com/youtube/v3/docs/captions/download)). As legendas automáticas não servem para música. O próprio YouTube avisa que ruído de fundo gera erros e manda os criadores revisarem ([YouTube Help](https://support.google.com/youtube/answer/6373554)). As letras do YouTube Music vêm licenciadas da LyricFind e da Musixmatch e não têm API pública ([9to5Google](https://9to5google.com/2023/04/07/youtube-music-real-time-lyrics/); [ytmusicapi](https://ytmusicapi.readthedocs.io/en/stable/reference/browsing.html)). Existem ferramentas não oficiais populares que puxam legendas, como a youtube-transcript-api, com cerca de 8,5 mil estrelas no GitHub. Elas usam partes não documentadas do site, e o próprio autor avisa que o YouTube bloqueia servidores em nuvem ([youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api)). Desde 2025, pedidos de legenda feitos pelo cliente web exigem um token anti-robô ([yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)).

Por cima disso, as Políticas para Desenvolvedores proíbem raspar dados do YouTube (§III.E.6), acessar dados por qualquer meio que não seja a API oficial (§III.I.14), baixar ou guardar o conteúdo audiovisual sem autorização por escrito (§III.E.1.a) e separar ou isolar o áudio do vídeo (§III.I.7) ([YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies)). **Isso descarta a ideia de mandar o áudio do clipe para uma IA de transcrição.**

A boa notícia: as regras limitam o que fica *em cima* do player, não o que fica *ao lado*. O player precisa ter pelo menos 200×200 pixels (o recomendado é 480×270), e nenhum elemento pode cobrir qualquer parte dele ([Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)). As políticas até citam um app feito para ensinar francês como exemplo de uso aceitável (§III.C.6) ([Developer Policies](https://developers.google.com/youtube/terms/developer-policies)). Um layout com o clipe numa caixa livre e a letra, a tradução e o jogo num painel próprio, abaixo ou ao lado, está dentro das regras. Pausar o vídeo numa lacuna até o jogador responder usa funções documentadas e não conta como modificar o player.

## O LRCLIB achou 42 de 42 músicas, mas só a Musixmatch vende licença

O **LRCLIB** é a resposta prática para a primeira versão. É um banco comunitário de letras sincronizadas, gratuito, sem chave de acesso, que aceita chamadas feitas direto do navegador do jogador ([LRCLIB API Documentation](https://lrclib.net/docs)). Os limites são por endereço de internet: cerca de 90 pedidos por minuto para um app que se identifica, e 180 por minuto (mais 6.000 por minuto no total do app) para quem registra o app no portal de desenvolvedores ([LRCLIB API Documentation](https://lrclib.net/docs)). Como cada jogador chama a partir da própria conexão, a carga se espalha sozinha.

Num teste feito em 21/10/2026 com 42 músicas, **todas as 42 tinham pelo menos uma letra sincronizada linha a linha**. A amostra tinha 14 sucessos de 2024 a 2026, 6 de K-pop, 5 gospel, 7 clássicos e 10 favoritas dos brasileiros ([LRCLIB search API](https://lrclib.net/api/search)). Faixas pouco conhecidas, regionais ou lançadas há poucos dias não foram testadas. Nenhuma das 42 tinha sincronia palavra a palavra, o que não atrapalha um jogo de lacunas por linha.

O tempo de resposta foi irregular. Numa rodada, a mediana foi de **1,5 s** e 9 em cada 10 buscas terminaram em até 3,2 s. Em outra rodada no mesmo dia, as buscas levaram de 0,8 s a **24 s**, com erros de servidor sobrecarregado ([LRCLIB search API](https://lrclib.net/api/search)). Os dados também são bagunçados: há registros de "Die With A Smile" com nome de álbum de trilha de videogame. E o título cru do YouTube costuma falhar: "Bruno Mars - Talking To The Moon (Official Audio)" voltou com zero resultados, e sem o "(Official Audio)" voltou com 20 ([LRCLIB search API](https://lrclib.net/api/search)).

O problema do LRCLIB não é técnico. O código é aberto (licença MIT), mas o serviço é mantido por **um único desenvolvedor, Tran Xuan Thang**, e vive de doações ([GitHub tranxuanthang/lrclib](https://github.com/tranxuanthang/lrclib)). A documentação **não publica licença para as letras, termos de uso nem política de remoção por direitos autorais**. O único mecanismo legal é um botão para denunciar "violação de copyright" num registro ([LRCLIB API Documentation](https://lrclib.net/docs)). As letras continuam protegidas pelos direitos de seus autores e editoras. O LRCLIB é um índice gratuito de conteúdo enviado por usuários, não uma licença.

A **Musixmatch**, que fornece letras sincronizadas a serviços como o Spotify, vende acesso com preço público. É a rota licenciada mais acessível encontrada:

| Plano | Preço | Chamadas de letra por dia | Letra sincronizada | Pode guardar as letras (cache) |
|---|---|---|---|---|
| Basic | US$ 49/mês | 500 | Não | Não |
| Grow | US$ 199/mês (US$ 1.910/ano) | 2.000 | Sim, linha a linha e palavra a palavra | Não |
| Scale | US$ 499/mês (US$ 4.790/ano) | 10.000 | Sim | Não |
| Enterprise | A partir de US$ 2.000/mês, negociado | Sob contrato | Sim | Sim |

Fonte: [Musixmatch Pro API pricing](https://www.musixmatch.com/pro/api/pricing).

A API tem uma função que encontra a sincronia certa a partir de título, artista e duração, com uma margem de tolerância configurável ([matcher.subtitle.get](https://docs.musixmatch.com/api-reference/lyrics-catalog/matcher-subtitle-get)). Também tem funções de tradução de letras, com cota própria de chamadas de tradução em todos os planos ([Musixmatch docs](https://docs.musixmatch.com/llms.txt); [pricing](https://www.musixmatch.com/pro/api/pricing)).

Em troca, a Musixmatch impõe regras de exibição. Toda vez que mostra uma letra, o app precisa carregar um script ou pixel de contagem, deixar visível a linha de copyright, exibir o selo "Lyrics powered by" com link e respeitar bloqueios por país ([Lyrics views tracking](https://docs.musixmatch.com/lyrics-views-tracking); [Implementation guidelines](https://docs.musixmatch.com/implementation-guidelines)). Músicas bloqueadas num país chegam sem o texto da letra ([Content Restrictions](https://docs.musixmatch.com/content-restrictions)). Os termos padrão da API valem para uso não comercial, e uso comercial exige contato com o time de vendas ([Musixmatch docs](https://docs.musixmatch.com/llms-full.txt)). A documentação não diz se a licença permite mostrar a letra com palavras escondidas (o jogo de lacunas) nem se há restrições específicas para o Brasil. As duas perguntas precisam ir ao time de vendas.

As alternativas são piores para este caso. A **LyricFind** declarava mais de 12 milhões de letras, 1,3 milhão delas sincronizadas palavra a palavra, em janeiro de 2025 ([Wikipedia: LyricFind](https://en.wikipedia.org/wiki/LyricFind)). Oferece licença gratuita só para avaliação, e o preço comercial é sob consulta ([Music Story](https://developers.music-story.com/partners/lyricfind)). O Genius não entrega letras pela API, e a biblioteca mais usada admite que raspar o site viola os termos dele ([LyricsGenius docs](https://lyricsgenius.readthedocs.io/en/stable/how_it_works.html)). O Spotify não tem endpoint público de letras ([Spotify Community](https://community.spotify.com/t5/Spotify-for-Developers/Get-lyrics/m-p/5429414/highlight/true)). A Apple exige um token privilegiado que apps de terceiros não deveriam usar ([MusanovaKit](https://github.com/rryam/MusanovaKit)).

O concorrente mais próximo, o LyricsTraining, declara nos termos que tem **licenças de grandes editoras musicais** para exibir letras. Também mantém um canal por e-mail para pedidos de remoção, analisados em até 30 dias úteis ([LyricsTraining Terms](https://lyricstraining.com/terms)).

## Do link colado à letra rodando, em dez passos

O fluxo recomendado para a primeira versão é este. A coluna "tempo" vale para a primeira vez que alguém escolhe aquele vídeo. Da segunda vez em diante, o passo 4 resolve tudo na hora.

| Passo | O que acontece | Onde roda | Tempo na 1ª vez |
|---|---|---|---|
| 1. Escolha | O jogador cola o link do YouTube ou busca pelo nome (ver limite de busca abaixo). | App | — |
| 2. Ficha do vídeo | O app lê título, canal e duração, pelo player oficial ou pela Data API (`videos.list`, 1 unidade de uma cota grátis de 10 mil por dia). | Navegador | Imediato, assim que o vídeo carrega |
| 3. Limpeza do título | Remove "(Official Music Video)", "Lyric Video", "feat." e "- Topic", e separa artista e música com uma biblioteca pronta. | Navegador | Imediato |
| 4. Memória do app | Procura no banco do próprio app se o vídeo já foi resolvido (vídeo → letra, offset, lacunas). Se já foi, pula para o passo 8. | Servidor do app | Imediato |
| 5. Busca da letra | Pergunta ao LRCLIB de duas formas ao mesmo tempo: busca exata com a duração (tolerância de ±2 s) e busca ampla por artista e música. | Navegador → LRCLIB | ~1,5 s (mediana), 3,2 s em 9 de 10 casos, até 24 s em dia ruim |
| 6. Escolha do candidato | Dá nota a cada resultado: nome e artista parecidos, duração próxima à do vídeo. | Navegador | Imediato |
| 7. Checagem de coerência | Confere se a última linha cai antes do fim do vídeo e se o vídeo dura mais de 10 s além da letra. Se durar, avisa "clipe com introdução" e abre a calibração. | Navegador | Imediato |
| 8. Letra e jogo na tela | A letra rola seguindo o relógio do player. Uma regra simples já escolhe as primeiras lacunas, e o jogo começa. | Navegador | Jogo liberado aqui |
| 9. Camada de IA | Uma IA de texto expande refrões, traduz, explica gírias e *phrasal verbs* e propõe lacunas melhores. O resultado aparece aos poucos na tela. | Servidor → API de IA | De alguns segundos a dezenas de segundos |
| 10. Guardar | Salva vídeo → id da letra, offset e lacunas (e, só na versão de teste, a tradução), para o próximo jogador receber tudo na hora. | Servidor do app | — |

Alguns detalhes fazem a diferença entre "poucos segundos" e "travou". Para o passo 3 já existe uma biblioteca, a get-artist-title, que separa artista e música em títulos no estilo do YouTube e usa o nome do canal quando o título não traz o artista ([npm get-artist-title](https://npmjs.com/package/get-artist-title)). No passo 5, a busca exata do LRCLIB só devolve letras cuja duração fica a ±2 s da duração informada. Se não achar nada, o LRCLIB dispara uma busca em segundo plano, e a letra pode aparecer numa nova tentativa minutos depois ([LRCLIB API Documentation](https://lrclib.net/docs)). O app deve se identificar no cabeçalho `Lrclib-Client`, desistir de esperar depois de alguns segundos e tentar de novo, respeitando o tempo de espera que o servidor pedir quando estiver sobrecarregado ([LRCLIB API Documentation](https://lrclib.net/docs)).

No passo 6, vale dar preferência a registros cujo nome é o próprio título do clipe. Alguns colaboradores publicam letras cronometradas sobre o vídeo, como um registro de "Espresso (Official Video)" com 201 s ([LRCLIB search API](https://lrclib.net/api/search)). Antes de chamar os amigos, também vale pré-carregar as 200 ou 300 músicas que eles mais devem pedir, para que a maioria das escolhas caia direto no passo 4.

A busca *dentro* do app tem um limite pouco conhecido. A função de busca da Data API (`search.list`) tem uma cota própria de **apenas 100 chamadas por dia** ([YouTube Data API quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)). Isso basta para um grupo de amigos e é pouco para o público. Para ampliar a cota é preciso passar por uma auditoria de conformidade do YouTube (§III.D.3) ([Developer Policies](https://developers.google.com/youtube/terms/developer-policies)). Por isso, "colar o link" é a entrada principal da primeira versão. Títulos e miniaturas guardados do YouTube precisam ser apagados ou atualizados a cada 30 dias (§III.E.4.c) ([Developer Policies](https://developers.google.com/youtube/terms/developer-policies)).

Quando nenhum banco tem a música, o app pode cair num modo "toque para sincronizar": o jogador toca na tela no começo de cada linha enquanto o clipe toca, e o app só lê o relógio do player. Nenhum áudio é processado, e o resultado fica salvo para todos.

### O clipe de "Espresso" tem cerca de 26 segundos a mais que a faixa do álbum

A letra sincronizada é cronometrada sobre uma gravação específica, normalmente a do álbum, e clipes oficiais muitas vezes começam com cenas, diálogos ou silêncio. No LRCLIB, o registro com título de clipe de "Espresso" dura 201 s, contra 175 a 176 s dos registros do álbum, uma diferença de **cerca de 26 s** ([LRCLIB search API](https://lrclib.net/api/search)). Esse número saiu da duração dos registros. Os horários reais dentro do clipe não foram conferidos nesta pesquisa.

Há um problema pior: a duração anotada no registro não garante que os horários servem para aquele corte. Em cinco músicas testadas, a primeira linha começava no mesmo instante em todos os 20 registros, qualquer que fosse a duração. **"Billie Jean" começa em 29,57 s em registros de 1 a 432 s**, incluindo versões ao vivo e estendidas ([LRCLIB search API](https://lrclib.net/api/search)). Tudo indica que o banco repete a cronometragem do álbum em registros de versões diferentes.

A correção é simples porque o erro mais comum é um deslocamento constante: se a introdução tem N segundos, basta somar N a todas as linhas, um único número por vídeo. A extensão Liner, que mostra letras do LRCLIB no YouTube, faz isso: o usuário ajusta o offset até a letra bater, e a extensão lembra o ajuste por faixa ([Liner](https://addons.mozilla.org/firefox/addon/liner/)). A Musixmatch guarda várias sincronias por música, cada uma ligada a uma duração, e orienta o integrador a escolher a mais próxima da faixa tocada ([Musixmatch implementation guidelines](https://docs.musixmatch.com/implementation-guidelines)).

Para o app, a receita recomendada tem quatro partes. A primeira é **escolher a letra pela duração** mais próxima da do vídeo. A segunda é **calibrar quando o vídeo for mais longo**: se ele durar mais de 10 s além da letra, o app abre a calibração "toque quando a primeira linha começar", com botões de ±0,5 s. A terceira é **guardar o ajuste por vídeo** e, no lançamento público, usar a mediana dos ajustes enviados pelos jogadores. A quarta é **oferecer um botão "versão áudio oficial"**, que troca o clipe pelo upload do canal automático "Artista - Topic", que costuma trazer o áudio do álbum.

Clipes com diálogo no meio da música precisam de mais de um ajuste ou da troca para o áudio oficial. Detectar o offset automaticamente não é possível, porque o app não tem acesso ao som do player.

### O que muda antes de abrir para o público

| Peça | Versão 1 (você e amigos) | Lançamento público monetizado |
|---|---|---|
| Fonte da letra | LRCLIB, chamado direto do navegador | Musixmatch (Grow ou acima) ou LyricFind, chamado pelo servidor do app |
| O que se guarda | Ids da letra, offsets e lacunas. Guardar o texto acelera, mas só é aceitável no teste fechado. | Só dados próprios (ids, offsets, posição das lacunas). O texto vem a cada partida, exceto no Enterprise. Confirmar no contrato. |
| Tradução | A IA gera uma vez por música e o app guarda | Licenciada (perguntar pelas traduções da Musixmatch) ou só trechos curtos, com parecer de advogado |
| Exibição | Livre | Script de contagem, linha de copyright, selo "Lyrics powered by" com link, bloqueios por país |
| Busca dentro do app | Colar link, ou `search.list` (100 por dia) | Cota ampliada via auditoria do YouTube, ou catálogo próprio de vídeos já resolvidos |
| Offset | Calibração manual e ajuste salvo | Mediana dos ajustes da comunidade e fila de correção |
| Acesso | Fechado, por convite | Aberto, com as regras de anúncios e de menores do YouTube e a LGPD |
| Jurídico | Risco baixo na prática, mas não zero | Parecer de advogado sobre letra, tradução e lacunas antes de abrir |

A troca de fonte é a mudança maior. Com a Musixmatch, a busca por título, artista e duração vira uma única chamada ([matcher.subtitle.get](https://docs.musixmatch.com/api-reference/lyrics-catalog/matcher-subtitle-get)). Quando o código ISRC da gravação é conhecido, a recomendação é buscar por ele primeiro ([Implementation guidelines](https://docs.musixmatch.com/implementation-guidelines)). A sincronia palavra a palavra vem de uma função própria ([track.richsync.get](https://docs.musixmatch.com/api-reference/lyrics-catalog/track-richsync-get)). Como os planos self-service proíbem guardar letras, cada partida consome uma chamada, e o custo passa a crescer com o número de partidas, não com o número de músicas.

Vale programar a primeira versão já com a fonte de letras "plugável", de modo que trocar o LRCLIB pela Musixmatch seja uma troca de peça, não uma reescrita. Existe uma via intermediária mais barata: o plano Basic (US$ 49, letra sem horários) combinado com sincronia feita pela comunidade. Só que ela quebra a promessa de "qualquer música em segundos", e o plano é descrito como próprio para protótipos e apps pequenos ([Musixmatch pricing](https://www.musixmatch.com/pro/api/pricing)).

## A IA acerta no texto e erra no ouvido

A IA é boa e barata para trabalhar com o **texto** da letra. Ela expande os "[Refrão x2]" que os bancos costumam abreviar, traduz linha a linha para um português natural, explica gírias, expressões e *phrasal verbs* com uma tradução literal ao lado e marca conteúdo adulto. Um modelo de linguagem já reduziu erros de transcrição de letras: o sistema LyricWhiz, que usa o GPT-4 para corrigir o Whisper, baixou o erro de 37,7% para 24,6% ([arXiv 2408.06370](https://arxiv.org/html/2408.06370v1)).

O preço é irrisório. O Claude Haiku 5.5 cobra US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída. O Claude Sonnet 5.5 cobra US$ 2 e US$ 10, e o processamento em lote dá 50% de desconto ([Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)). O Gemini 2.5 Flash-Lite cobra US$ 0,10 e US$ 0,40, e os modelos Flash têm faixa gratuita ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)). Uma música, com cerca de 2.500 tokens de instruções e letra e 3.000 tokens de tradução, notas e lacunas, sai por **cerca de US$ 0,0018 no Haiku 5.5 e US$ 0,035 no Sonnet 5.5**.

A recomendação é usar um modelo mais forte para a tradução e as explicações, onde duplo sentido e gíria importam, e um modelo barato para tarefas mecânicas. Não foi encontrado nenhum estudo recente sobre a qualidade de tradução de letras do inglês para o português por IA. Um professor deve revisar uma amostra.

Na escolha das lacunas, a IA deve sugerir e regras fixas devem decidir. A IA propõe palavras candidatas, com o motivo e o nível de dificuldade (A1 a C2). Em seguida o app descarta qualquer palavra que não apareça exatamente na letra, que não tenha horário confiável, que seja um "(oh, yeah)" de fundo ou nome próprio, ou que seja artigo ou preposição, a não ser que o exercício seja sobre isso. Phrasal verbs e combinações de palavras ganham prioridade. As pesquisas sobre geração automática de exercícios de completar justificam esse cuidado. Um estudo de 2024 encontrou problemas de correção e de variedade em bases desses exercícios ([CLiC-it 2024](https://aclanthology.org/2024.clicit-1.39.pdf)). Um de 2026 mostrou que lacunas escolhidas com base no texto de origem saem melhores, embora tenha testado resumos de livros didáticos, não alunos de idiomas ([AIME-Con 2026](https://aclanthology.org/2026.aimecon-main.59.pdf)).

A IA é ruim para **ouvir** música. No principal teste de transcrição de letras, o Whisper v3 errou **37,7% das palavras** em inglês. O melhor sistema, o comercial da AudioShake, errou 17,3%, mas o teste foi feito pelos pesquisadores da própria AudioShake ([arXiv 2408.06370](https://arxiv.org/html/2408.06370v1)). Num relatório de janeiro de 2026, com números divulgados pela Alibaba, dona do Qwen, o Gemini 2.5 Pro errou 12,18% das palavras em músicas inteiras, o Qwen3-ASR errou 14,60% e o GPT-4o-Transcribe errou 30,71% ([Qwen3-ASR Technical Report](https://arxiv.org/html/2601.21337)).

Os 2% a 5% de erro que os modelos de 2026 anunciam valem para **fala, não para canto** ([Artificial Analysis](https://artificialanalysis.ai/speech-to-text)). Num refrão de 50 palavras, 12% a 20% de erro são 6 a 10 palavras erradas, e um gabarito errado num jogo de lacunas destrói a confiança do jogador. O Whisper também pula versos, apaga vocais de fundo e "ohs" e inventa texto em trechos instrumentais. Separar a voz da música antes ajuda pouco, a menos que a separação seja quase perfeita ([arXiv 2506.15514](https://arxiv.org/html/2506.15514v1)). Os horários gerados por modelos como o Gemini escorregam ao longo do áudio. Num relato, o Gemini 3 Flash chegou a 157 s de erro no fim de um arquivo de 11 minutos ([Google AI forum](https://discuss.ai.google.dev/t/bug-gemini-3-flash-and-3-1-pro-progressive-timestamp-drift-in-audio-transcription/129501)).

O **alinhamento** é a exceção. Quando a IA já recebe o texto certo, os alinhadores específicos para letras erram em média 0,22 s, com mediana de 0,04 s ([DAFx 2025](https://staff.aist.go.jp/m.goto/PAPER/DAFX2025cheng.pdf)). É mais do que suficiente para destacar a linha certa. Já existem serviços prontos: a ElevenLabs cobra o alinhamento ao preço da transcrição ([ElevenLabs Forced Alignment](https://elevenlabs.io/docs/overview/capabilities/forced-alignment)), e a AudioShake cobra US$ 0,10 por minuto alinhado na AWS ([AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-ftko37es5f4vw)).

O problema é que o alinhamento precisa de um áudio que o app tenha o direito de processar, e o som do clipe do YouTube não é esse áudio. Por isso ele só serve para um catálogo próprio com áudio licenciado, ou para um arquivo que o próprio usuário envie, o que exige análise jurídica. Rodar a IA no celular do jogador também não resolve. O navegador não alcança o som do player, e os modelos pequenos que cabem no aparelho, com download de cerca de 200 MB, são fracos ([LogRocket](https://blog.logrocket.com/voice-ai-agent-browser/)).

Sobre a "IA nova chamada Jeff" mencionada no início da pesquisa: nenhuma ferramenta de transcrição com esse nome foi encontrada em outubro de 2026. O mais provável é que o ditado por voz tenha trocado "GPT" (o gpt-transcribe da OpenAI) ou "Gemini" (o Gemini 3.5 Transcribe do Google) ([OpenRouter](https://openrouter.ai/openai/gpt-transcribe); [Gemini 3.5 Transcribe](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe)). Nenhum dos dois tem resultado publicado em testes de letras de música.

## Quanto custa: centavos no teste, a partir de US$ 200 por mês no público

O custo por música mostra o quanto cada peça pesa:

| Peça | Custo por música | Observação |
|---|---|---|
| Letra do LRCLIB | US$ 0 | Sem licença |
| Ficha do vídeo (Data API) | US$ 0 | 1 unidade de uma cota grátis de 10.000 por dia |
| IA de texto: Gemini 2.5 Flash-Lite | ~US$ 0,0015 | Tem faixa gratuita |
| IA de texto: Claude Haiku 5.5 | ~US$ 0,0018 | Bom para tarefas mecânicas |
| IA de texto: Claude Sonnet 5.5 | ~US$ 0,035 | Melhor para tradução e explicações |
| Letra licenciada: Musixmatch Grow | ~US$ 0,0033 por partida | US$ 199 divididos por 60 mil chamadas por mês, com a cota cheia |
| Letra licenciada: Musixmatch Scale | ~US$ 0,0017 por partida | US$ 499 divididos por 300 mil chamadas por mês |
| Alinhamento por IA (só com áudio licenciado) | ~US$ 0,015 (ElevenLabs) a US$ 0,40 (AudioShake) | Não se aplica ao áudio do YouTube |

Os preços de IA vêm das tabelas da [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing) e do [Google](https://ai.google.dev/gemini-api/docs/pricing). Os da Musixmatch vêm da [tabela pública](https://www.musixmatch.com/pro/api/pricing). Os de alinhamento vêm da [Artificial Analysis](https://artificialanalysis.ai/speech-to-text) e da [AWS](https://aws.amazon.com/marketplace/pp/prodview-ftko37es5f4vw). O processamento em lote corta pela metade o custo da IA de texto, e o português pode somar 20% a 30% de tokens.

Para estimar o mês, a premissa é que cada jogador ativo jogue cerca de 20 músicas por mês, e que a quantidade de músicas novas cresça mais devagar que a de partidas, porque muita gente escolhe os mesmos sucessos.

| Cenário | Partidas por mês | Músicas novas por mês | Letra | IA de texto | Total aproximado por mês |
|---|---|---|---|---|---|
| V1: você e ~20 amigos | ~400 | ~200 | LRCLIB: US$ 0 | US$ 0,40 (Haiku) a US$ 7 (Sonnet) | **Menos de US$ 10** |
| Público: 1.000 jogadores | ~20.000 (~670/dia) | ~3.000 | Musixmatch Grow: US$ 199 | US$ 5 a US$ 105 se puder guardar a tradução; ~US$ 36 (Haiku) se tiver de gerar a cada partida | **~US$ 205 a US$ 305** |
| Público: 10.000 jogadores | ~200.000 (~6.700/dia) | ~10.000 | Musixmatch Scale: US$ 499 | US$ 18 a US$ 350 guardando; ~US$ 360 (Haiku) gerando a cada partida | **~US$ 520 a US$ 860** |
| Público: 100.000 jogadores | ~2.000.000 (~67.000/dia) | ~30.000 | Musixmatch Enterprise: a partir de US$ 2.000, negociado | US$ 54 a US$ 1.050 (o cache é permitido) | **A partir de ~US$ 2.050 a US$ 3.050** |

Três leituras saem dessa tabela. Primeiro, **a IA é a parte barata e a licença é a cara**. No público, a letra licenciada custa de US$ 1,70 a US$ 3,30 a cada mil partidas, e esse custo cresce com o uso porque os planos self-service não deixam guardar a letra. Segundo, a maior incerteza no custo da IA é jurídica, não técnica. Se o contrato não permitir guardar uma tradução derivada da letra, ela precisa ser gerada a cada partida. Com um modelo barato isso cabe no orçamento, mas usar o Sonnet a cada partida com 10 mil jogadores custaria cerca de US$ 7.000 por mês. Terceiro, pagar o ano adiantado reduz o Grow para cerca de US$ 159 por mês e o Scale para cerca de US$ 399.

A conta não inclui hospedagem, banco de dados, domínio nem advogado, que não foram pesquisados. O preço real do Enterprise também não é público.

## Quatro riscos que podem derrubar o app

### A Lei 9.610/98 exige autorização para a letra e para a tradução, mesmo em app gratuito

O artigo 29 da Lei de Direitos Autorais diz que usar a obra "depende de autorização prévia e expressa do autor". O inciso IV inclui expressamente "a tradução para qualquer idioma" ([LegJur, art. 29](https://www.legjur.com/legislacao/art/lei_00096101998-29); [Senado: Lei 9.610](https://legis.senado.leg.br/norma/551486)). O artigo não diferencia app pago de app gratuito. As letras do LRCLIB continuam protegidas ([AlternativeTo: LRCLIB](https://alternativeto.net/software/lrclib/about)), e a tradução de uma letra é, em geral, tratada como obra derivada, que depende de permissão do titular ([TuneCore](https://www.tunecore.ca/?p=40291)). O artigo 46 traz exceções, como a citação de trechos para estudo, mas o texto dele não foi analisado nesta pesquisa, e sua aplicação a um app precisa de parecer de advogado.

Há três saídas de menor risco, da mais segura para a menos segura. A melhor é uma **licença que cubra a tradução**, e para isso é preciso perguntar se as traduções da Musixmatch existem em português e podem ser exibidas. A segunda é **traduzir só trechos curtos**: explicar apenas os versos e expressões-chave, e não a letra inteira, pode caber no artigo 46, desde que um advogado confirme. A terceira é **gerar a tradução na hora para cada jogador, sem guardar**. Sem publicar nem armazenar a tradução, a exposição diminui, mas a questão da obra derivada continua.

Esconder palavras da letra no jogo de lacunas também é uma forma de alterar a obra, e nenhuma fonte disse se as licenças cobrem isso. A lição do LyricsTraining vale desde o primeiro dia: ter um canal visível para pedidos de remoção ([LyricsTraining Terms](https://lyricstraining.com/terms)).

### O LRCLIB depende de uma pessoa e não tem contrato

Se o mantenedor cansar, ficar sem dinheiro ou receber uma notificação jurídica, o app perde a fonte da noite para o dia, e nenhum termo de uso garante nada. Os erros de sobrecarga e as respostas de até 24 s medidos num mesmo dia mostram que o serviço já opera no limite ([LRCLIB search API](https://lrclib.net/api/search)). Existe uma cópia do banco para download, de cerca de 19 GB segundo uma fonte não datada ([osdlyrics issue #146](https://github.com/osdlyrics/osdlyrics/issues/146)). Hospedar essa cópia resolveria a falta de estabilidade e pioraria a exposição jurídica, porque o app passaria a distribuir letras protegidas a partir do próprio servidor. A defesa realista é a que já está no passo a passo: guardar os ids e os offsets, deixar a fonte "plugável" e tratar o LRCLIB como ponte até a licença, não como base do negócio.

### O YouTube pune quem mexe no player ou separa o áudio, não quem mostra a letra ao lado

O histórico de punições do YouTube mira ferramentas que reaproveitam o áudio ou substituem o player. Os robôs de música Groovy, presente em mais de 16 milhões de servidores do Discord, e Rythm fecharam em 2021 depois de cartas de "cessar e desistir" ([Tubefilter](https://tubefilter.com/2021/09/13/youtube-groovy-bot-rythm-discord-letters/)). O Invidious, um player alternativo, recebeu prazo de 7 dias para sair do ar ([Vivaldi forum](https://forum.vivaldi.net/topic/87936/youtube-legal-team-asked-invidious-developers-to-take-down-the-service-within-7-days)). Um app que só embute o player oficial e não puxa mais nada do YouTube está na faixa de menor risco.

A monetização, porém, tem limites claros. É proibido **cobrar do jogador para ver o vídeo embutido** (§III.F.3.a), então um plano pago teria de cobrar pelos recursos de estudo, não pelo clipe. O app também não pode **dar recompensa por interagir com o YouTube** (§III.F.3.c): pontos e sequências devem premiar respostas certas, não visualizações. **Anúncios** só são permitidos se a página tiver valor independente mesmo sem os dados do YouTube (§III.G.1.d), e **tocar o áudio em segundo plano**, com a tela desligada, é proibido (§III.I.9). Quando o público inclui **menores de 13 anos**, o que é provável num contexto escolar brasileiro, ficam proibidos anúncios personalizados e outras práticas (§III.J), e ainda entra a LGPD, que não foi pesquisada aqui. Todas essas regras estão nas [Developer Policies](https://developers.google.com/youtube/terms/developer-policies). Se o YouTube suspender o acesso, o app tem de parar de usar o player e apagar os dados obtidos pela API ([API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service)).

### O offset é o erro que o jogador percebe primeiro

Uma letra 26 segundos adiantada torna o jogo impossível, e o jogador culpa o app, não o clipe. A calibração por toque e o ajuste salvo por vídeo resolvem a maioria dos casos. Os clipes cinematográficos, com diálogos no meio da música, continuam um problema. Como nada detecta o atraso sozinho, a qualidade depende de os primeiros jogadores de cada vídeo corrigirem o tempo, e da regra de mostrar como lacuna apenas as linhas com horário confiável. Num app com muitas músicas pouco tocadas, uma fatia do catálogo vai ficar sem correção por bastante tempo.

## Conclusão

O ativo que o app constrói não é a letra, que se aluga do LRCLIB hoje e da Musixmatch amanhã. É a **tabela própria "este vídeo → esta letra, com este offset e estas lacunas validadas"**, que cresce a cada partida, sobrevive a uma troca de fornecedor e é exatamente o que nenhum banco de letras oferece para clipes. Por isso a primeira versão deve ser desenhada em torno dessa tabela, com a fonte de letras como peça trocável, e não em torno de uma IA que transcreve.

A pergunta "quanto custa" tem uma resposta que contraria a intuição: a IA custa centavos, e quem decide o orçamento é o contrato de licença. O teste com amigos sai praticamente de graça. Antes de abrir ao público, porém, é preciso garantir cerca de US$ 200 por mês, um custo que cresce com as partidas, e levar três perguntas ao time de vendas da Musixmatch: se o jogo de lacunas é permitido, se existem traduções em português licenciadas para exibição e se há restrições no Brasil. As respostas, somadas a um parecer de advogado sobre o artigo 46, definem se o modelo de negócio fecha.
