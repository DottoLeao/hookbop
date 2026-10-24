// Todo texto de tela mora aqui e é lido por t(). Variáveis usam {nome}.
// As falas do DJ Bop seguem design/canvas/Voz.dc.html: nunca zoa, até 8 palavras,
// gíria leve e convida em vez de cobrar.
export const ptBR = {
  'dj.hello': 'E aí! Bora aprender no beat?',
  'dj.hit': 'Isso aí, no beat!',
  'dj.miss': 'Quase! Solta o replay que você pega.',
  'dj.combo': 'Tá on fire, x{n}!',
  'dj.record': 'Novo recorde! Você mandou muito.',
  'dj.endGreat': 'Mandou bem!',
  'dj.endOk': 'Boa! Bora de novo?',
  'dj.endLow': 'Quase! Solta o replay que você pega.',

  // Tela inicial: colar um link, as músicas da galera e os atalhos.
  'home.pastePlaceholder': 'Cole o link do YouTube',
  // O título da página, só para leitores de tela: o logo é uma imagem.
  'home.title': 'Hookbop',
  'home.pasteLabel': 'Link do YouTube',
  'home.play': 'Jogar',
  'home.invalidLink': 'Esse link não parece do YouTube.',
  'home.songsTitle': 'Músicas da galera',
  // No cartão de uma música: o artista e quanto ela dura.
  'home.songMeta': '{artista} · {duracao}',
  // A capinha de uma música no cartão: o texto alternativo da imagem.
  'home.songThumbAlt': 'Capinha de {musica}',
  'home.songsError': 'Não deu pra carregar as músicas agora.',
  // Ninguém jogou ainda: o DJ Bop convida a colar a primeira.
  'home.empty': 'Tá silêncio por aqui. Cola a primeira!',
  'home.invite': 'Convidar',
  'home.admin': 'Admin',
  'home.metrics': 'Métricas',
  'home.licenses': 'Licenças de terceiros',

  // Convite para instalar o app, na tela inicial depois da primeira música terminada.
  'install.title': 'Quer o Hookbop na tela inicial?',
  'install.iosHint': 'Toque em Compartilhar e depois em Adicionar à Tela de Início',
  'install.accept': 'Instalar',
  'install.dismiss': 'Agora não',

  // Tela da música (/jogar/[youtubeId]): carregar, erros, calibrar e escolher o modo.
  'jogar.back': 'Voltar',
  'jogar.loading': 'Procurando a letra...',
  'jogar.lyricsSlow': 'O banco de letras tá lento. Tenta de novo?',
  'jogar.retry': 'Tentar de novo',
  'jogar.videoUnavailable': 'Esse clipe não toca fora do YouTube.',
  'jogar.playerFailed': 'Não deu pra carregar o clipe. Tenta de novo?',
  'jogar.pasteAnother': 'Colar outro link',
  'jogar.noLyrics': 'Ainda não temos a letra dessa.',
  'jogar.searchAudio': 'Procurar a versão áudio oficial',

  'calibrar.title': 'Acertar o tempo',
  'calibrar.hint': 'Dá o play no clipe e toca em “Começou!” quando esta linha começar:',
  'calibrar.start': 'Começou!',
  'calibrar.minus': '−0,5 s',
  'calibrar.plus': '+0,5 s',
  'calibrar.offset': 'Ajuste: {valor}',
  'calibrar.save': 'Salvar',
  'calibrar.saveError': 'Não rolou salvar. Tenta de novo?',
  // O ajuste passou de 2 minutos para qualquer lado: o banco não guarda, então nem tenta salvar.
  'calibrar.tooFar': 'Esse ajuste passou do meu limite. De novo?',
  'calibrar.skip': 'Pular',
  'calibrar.switchToAudio': 'Trocar para a versão áudio oficial',

  'modo.title': 'Escolher o modo',
  'modo.question': 'Como você quer jogar?',
  'modo.change': 'Trocar',
  'modo.changeLabel': 'Trocar de música',
  'modo.calibrate': 'Ajustar o tempo',
  'modo.escolha': 'Escolha',
  'modo.escolha.desc': 'Escolha a palavra que falta entre 3 opções',
  'modo.digitacao': 'Digitação',
  'modo.digitacao.desc': 'Digite a palavra. Erro de digitação é perdoado',
  'modo.karaoke': 'Karaokê',
  'modo.karaoke.desc': 'Cante junto, com a tradução embaixo',
  'modo.montar': 'Monte o verso',
  'modo.montar.desc': 'Coloque as palavras na ordem certa',
  'modo.difficulty': 'Dificuldade',
  'modo.play': 'Jogar',
  // Uma partida desta música ficou guardada no aparelho (até 24 h): continuar dela ou começar outra.
  // {quando} é "às 14:32" (salva hoje) ou "ontem às 14:32" (salva no dia anterior).
  'modo.saved': 'Partida salva {quando} · {modo} · {dificuldade}',
  // O Karaokê não tem dificuldade.
  'modo.savedKaraoke': 'Partida salva {quando} · {modo}',
  'modo.savedToday': 'às {hora}',
  'modo.savedYesterday': 'ontem às {hora}',
  'modo.resume': 'Continuar de onde parou',
  'modo.discard': 'Começar do zero',

  'dificuldade.facil': 'Fácil',
  'dificuldade.medio': 'Médio',
  'dificuldade.dificil': 'Difícil',

  // Fim da música. O anel e as falas do DJ Bop (dj.endGreat, dj.endOk, dj.endLow) vêm do percentual de acertos de primeira.
  'fim.ring': '{pct}% de acerto',
  'fim.ringValue': '{pct}%',
  'fim.blanks': '{certas} de {total} lacunas certas',
  'fim.helped': '{n} com ajuda',
  'fim.maxCombo': 'combo máximo',
  'fim.xp': 'XP',
  'fim.xpValue': '+{n}',
  // O XP ainda não voltou do banco, ou não deu pra saber qual é.
  'fim.xpPending': '…',
  'fim.xpUnknown': '–',
  'fim.doubleXp': 'Dobrar o XP · anúncio',
  'fim.doubleXpUsed': 'XP dobrado',
  'fim.doubleXpError': 'Não rolou dobrar. Tenta de novo?',
  'fim.saveFailed': 'Essa partida ainda não foi salva.',
  'fim.saveRetry': 'Tentar salvar de novo',
  'fim.playAgain': 'Jogar de novo',
  'fim.otherMode': 'Outro modo',
  'fim.otherSong': 'Outra música',

  // Tela de jogo: cabeçalho, letra, ferramentas e configurações.
  'jogo.song': '{musica} · {artista}',
  'jogo.mode': 'Modo {modo}',
  'jogo.comboLabel': 'Combo',
  'jogo.combo': 'x{n}',
  // No Karaokê o cabeçalho não mostra combo: não há lacunas nem pontos.
  'jogo.free': 'Livre',
  'jogo.settings': 'Configurações',
  'jogo.settingsDone': 'Pronto',
  'jogo.blank': 'lacuna',
  // No Monte o verso, o verso em jogo fica escondido: só um espaço no lugar dele.
  'jogo.hiddenLine': 'verso escondido',
  // Uma lacuna certa na letra: o resultado só no nome acessível, nunca na tela.
  'jogo.hit': '{palavra}, acertou',
  'jogo.miss': '{palavra}, errou',
  'jogo.translate': 'Traduzir verso',
  // Depois de "Traduzir verso", ou ao voltar para o app, a música fica parada; este botão a faz voltar de onde parou.
  'jogo.continue': 'Continuar',
  'jogo.explain': 'Não entendi',
  'jogo.slow': '0.75x',
  'jogo.repeat': 'Repetir verso',
  'config.alwaysShowTranslation': 'Mostrar tradução sempre',
  'config.autoRepeatOnMiss': 'Repetir sozinho depois de errar',
  'config.sounds': 'Sons',

  // Modo Karaokê: a letra rolando, com a tradução embaixo de cada verso.
  'karaoke.lyrics': 'Letra',
  'karaoke.hideTranslation': 'Esconder tradução',
  'karaoke.showTranslation': 'Mostrar tradução',

  // Ajuda do DJ Bop: "Não entendi" abre a explicação, "Traduzir verso" mostra a tradução embaixo do verso.
  // Quando a ajuda não vem, ele fala com calma, sem número de erro e sem culpar ninguém.
  'ajuda.dialog': 'Explicação do DJ Bop',
  'ajuda.wholeLine': 'O verso inteiro',
  'ajuda.loading': 'Peraí, deixa eu ver...',
  'ajuda.translating': 'Traduzindo...',
  'ajuda.later': 'Pausa rapidinha! Volta daqui a pouco?',
  'ajuda.retryable': 'Não rolou agora. Tenta de novo?',
  'ajuda.unavailable': 'Essa agora não deu. Fica pra próxima?',
  'ajuda.retry': 'Tentar de novo',
  'ajuda.close': 'Valeu',

  // Modo Escolha. "acertou" e "errou" só aparecem no nome acessível do botão, nunca na tela.
  'escolha.question': 'Escolha a palavra que falta',
  'escolha.hit': '{palavra}, acertou',
  'escolha.miss': '{palavra}, errou',

  // Modo Digitação. Como no Escolha, "acertou" e "errou" só existem para leitores de tela, nunca à vista.
  'digitacao.label': 'Digite a palavra que falta',
  'digitacao.hit': '{palavra}, acertou',
  'digitacao.miss': '{palavra}, errou',
  'digitacao.corrected': '{palavra}, corrigido automaticamente',
  // Quando o código do campo não carrega. Sem culpar ninguém, e o jogo segue.
  'digitacao.loadFailed': 'O campo de digitar não carregou.',
  'digitacao.retry': 'Tentar de novo',

  // Modo Monte o verso. "acertou" e "errou" só existem para leitores de tela, nunca à vista.
  'montar.question': 'Coloque as palavras na ordem',
  // A fileira com as palavras já colocadas; quando o verso fecha, o nome acessível diz o resultado.
  'montar.row': 'Seu verso',
  'montar.hit': '{palavra}, acertou',
  'montar.miss': '{palavra}, errou',
  'montar.explain': 'Não entendi a ordem',

  'entrar.google': 'Entrar com Google',
  'entrar.email': 'Receber link por e-mail',
  'entrar.emailLabel': 'Seu e-mail',
  'entrar.codeLabel': 'Ou digite o código do e-mail',
  'entrar.codeSubmit': 'Entrar',
  'entrar.codeInvalid': 'Código inválido. Confere e tenta de novo.',
  'entrar.sent': 'Link enviado! Confere seu e-mail.',
  'entrar.error': 'Não rolou. Tenta de novo?',
  // Uma mensagem por motivo de /entrar?estado=. 'sem-convite' e 'used' dizem o mesmo.
  'entrar.estado.sem-convite': 'Pede um convite pra quem te mandou.',
  'entrar.estado.used': 'Pede um convite pra quem te mandou.',
  'entrar.estado.full': 'A galera tá cheia por enquanto.',
  'entrar.estado.removed': 'Seu acesso foi pausado.',
  'entrar.estado.not_found': 'Esse convite não existe.',
  // Why sign-in did not go through (`/entrar?erro=`): a link that did not work, or a check that could not be made.
  'entrar.erro.link': 'Esse link não rolou. Pede um novo aqui.',
  'entrar.erro.servico': 'Não rolou conferir seu acesso. Tenta de novo?',

  'convite.notFound': 'Esse convite não existe.',
  'convite.used': 'Pede um convite pra quem te mandou.',
  'convite.greeting': 'O {nome} te chamou pro Hookbop',
  'convite.enter': 'Entrar',

  'convidar.title': 'Convidar',
  'convidar.create': 'Criar convite',
  'convidar.error': 'Não rolou. Tenta de novo?',
  'convidar.whatsapp': 'Mandar no WhatsApp',
  'convidar.whatsappText': 'Bora jogar Hookbop comigo? Aprende inglês com música. Seu convite: {url}',
  'convidar.copy': 'Copiar link',
  'convidar.copied': 'Link copiado!',
  'convidar.copyError': 'Não rolou. Tenta de novo?',
  'convidar.qrLabel': 'QR code do convite',
  'convidar.listTitle': 'Meus convites',
  'convidar.waiting': 'esperando',

  'admin.title': 'Membros',
  'admin.count': '{n} de {max}',
  'admin.joined': 'Entrou em {data}',
  'admin.owner': 'Dono',
  'admin.remove': 'Remover',
  'admin.removeNamed': 'Remover {nome}',
  'admin.removeError': 'Não rolou. Tenta de novo?',

  // Painel de métricas do dono (/admin/metricas). Todo dia e todo período dizem "horário de Brasília", que é como o
  // banco conta os dias.
  'metricas.title': 'Métricas',
  'metricas.back': 'Voltar',
  'metricas.period': 'Período',
  'metricas.days': '{n} dias',
  'metricas.export': 'Exportar dados',
  'metricas.loading': 'Carregando as métricas…',
  'metricas.periodRange': 'Últimos {n} dias, horário de Brasília ({de} a {ate})',
  'metricas.monthRange': 'Em {mes}, horário de Brasília ({de} a {ate})',
  'metricas.none': '—',
  'metricas.empty': 'Nada no período ainda.',
  'metricas.inBrl': '≈ {valor}',

  // Contagens: ".one" para exatamente 1, ".other" para qualquer outro número, o zero também (veja tCount).
  'metricas.n.people.one': '{n} pessoa',
  'metricas.n.people.other': '{n} pessoas',
  'metricas.n.activePeople.one': '{n} pessoa ativa',
  'metricas.n.activePeople.other': '{n} pessoas ativas',
  'metricas.n.gamesStarted.one': '{n} partida começada',
  'metricas.n.gamesStarted.other': '{n} partidas começadas',
  'metricas.n.songsPlayed.one': '{n} música jogada',
  'metricas.n.songsPlayed.other': '{n} músicas jogadas',
  'metricas.n.games.one': '{n} partida',
  'metricas.n.games.other': '{n} partidas',
  'metricas.n.finished.one': '{n} terminada',
  'metricas.n.finished.other': '{n} terminadas',
  'metricas.n.opens.one': '{n} abertura',
  'metricas.n.opens.other': '{n} aberturas',
  'metricas.n.selections.one': '{n} escolha do modo',
  'metricas.n.selections.other': '{n} escolhas do modo',
  'metricas.n.reused.one': '{n} reaproveitado do refrão',
  'metricas.n.reused.other': '{n} reaproveitados do refrão',

  'metricas.spend.title': 'Gasto da IA',

  'metricas.average.title': 'Custo médio',
  'metricas.average.perPerson': 'Por pessoa ativa',
  'metricas.average.perGame': 'Por partida',
  'metricas.average.perSong': 'Por música',
  'metricas.average.basis': '{pessoas} · {partidas} · {musicas}',

  'metricas.projection.title': 'Projeção',
  'metricas.projection.people': 'Pessoas por mês',
  'metricas.projection.result': 'Com {pessoas} por mês, o gasto seria',
  'metricas.projection.basis':
    'Pela média de {valor} por pessoa ativa nos últimos 30 dias, horário de Brasília ({pessoas}).',
  'metricas.projection.noData': 'Ainda não há pessoas ativas nos últimos 30 dias para projetar.',
  'metricas.projection.invalid': 'Digite um número inteiro de pessoas.',

  'metricas.ai.title': 'Tokens e memória',
  'metricas.ai.calls': 'Pedidos de ajuda à IA',
  'metricas.ai.memory': 'Da memória',
  'metricas.ai.memoryDetail': '{cache} do cache por verso · {reuse} · {model} do modelo',
  'metricas.ai.inputTokens': 'Tokens de entrada',
  'metricas.ai.outputTokens': 'Tokens de saída',
  'metricas.ai.latency': 'Tempo médio de resposta',
  'metricas.ai.latencyNote': 'Só as respostas do modelo que deram certo.',
  'metricas.ai.failures': 'Recusados: {recusados} · Com erro: {erros}',

  'metricas.modes.title': 'Modos mais jogados',
  'metricas.modes.line': '{partidas} · {escolhas}',

  'metricas.games.title': 'Partidas por modo',
  'metricas.games.started': 'Começadas',
  'metricas.games.finished': 'Terminadas',
  'metricas.games.exits': 'Saídas',
  'metricas.games.completion': 'Conclusão',
  'metricas.games.avgPct': 'Acerto médio',
  'metricas.games.avgLength': 'Duração média',
  'metricas.games.note':
    'Conclusão: terminadas ÷ começadas. Saída: a pessoa saiu da partida pelo menos uma vez, e pode ter voltado e terminado.',

  'metricas.songs.title': 'Músicas mais jogadas',
  'metricas.songs.line': '{partidas} · {terminadas} · {aberturas}',
  'metricas.songs.untitled': 'Música {id}',

  'metricas.help.title': 'Pedidos de ajuda por modo',
  'metricas.help.line': '{explicar} "Não entendi" · {traduzir} "Traduzir verso"',
  'metricas.help.noMode': 'Sem modo',

  'metricas.rate.title': 'Cotação do dólar',
  'metricas.rate.current': 'US$ 1 = {valor}',
  'metricas.rate.label': 'Reais por dólar',
  'metricas.rate.save': 'Salvar',
  'metricas.rate.saved': 'Cotação salva.',
  'metricas.rate.invalid': 'Use um número entre 1 e 20, como 5,50.',
  'metricas.rate.failed': 'Não rolou. Tenta de novo?',

  'metricas.priceNote':
    'Custos estimados pelos tokens e pelo preço do {modelo}: {entrada} por milhão de tokens de entrada e {saida} por milhão de saída (preço de {data}).',

  // Política de privacidade (/privacidade). Rascunho para o dono revisar.
  'privacidade.link': 'Privacidade',
  'privacidade.title': 'Política de privacidade',
  'privacidade.updated': 'Atualizada em 24 de outubro de 2026.',
  'privacidade.back': 'Voltar para o Hookbop',
  'privacidade.contactEmail': 'dottodeveloper@gmail.com',

  'privacidade.quem.title': 'Quem somos',
  'privacidade.quem.p1':
    'O Hookbop é um app para aprender inglês com músicas do YouTube. Ele está em fase de testes fechada: só entra quem recebe um convite.',
  'privacidade.quem.p2': 'Quem cuida do app e dos seus dados é o criador do Hookbop. Para falar com ele, escreva para:',

  'privacidade.guarda.title': 'O que guardamos',
  'privacidade.guarda.conta':
    'Sua conta: seu e-mail e o nome que aparece no app. Se você entra com o Google, ele também nos envia seu nome e a foto do seu perfil.',
  'privacidade.guarda.convites': 'Convites: quem convidou quem, e quando.',
  'privacidade.guarda.jogo':
    'Suas partidas: as músicas que você jogou (o endereço do vídeo no YouTube), o modo, a dificuldade, os acertos, os pontos (XP) e cada resposta, dizendo se foi certa, errada ou com ajuda.',
  'privacidade.guarda.calibracao': 'Ajustes de tempo: o ajuste da letra que você escolhe para cada vídeo.',
  'privacidade.guarda.ajuda':
    'Pedidos de ajuda: a hora e o tipo de cada "Não entendi" ou "Traduzir verso", para controlar o limite por hora. As explicações e traduções ficam guardadas por verso, sem dizer quem pediu.',
  'privacidade.guarda.aparelho':
    'No seu aparelho: os cookies que mantêm você conectado e guardam o convite, as suas configurações do jogo e as páginas guardadas para o app abrir sem internet.',

  'privacidade.uso.title': 'Para que usamos',
  'privacidade.uso.p1':
    'Usamos esses dados para você entrar, para guardar suas partidas e seus pontos, para mostrar as "Músicas da galera", para limitar o uso da ajuda com IA e para melhorar o app.',
  'privacidade.uso.p2': 'Não vendemos seus dados e, nesta fase, não mostramos anúncios.',

  'privacidade.terceiros.title': 'Quem mais recebe dados',
  'privacidade.terceiros.p1': 'Alguns serviços trabalham para o Hookbop e recebem só o necessário:',
  'privacidade.terceiros.supabase': 'Supabase: guarda o banco de dados e cuida do login. Os servidores ficam nos Estados Unidos.',
  'privacidade.terceiros.vercel': 'Vercel: hospeda o app.',
  'privacidade.terceiros.google':
    'Google: faz o login, se você escolher entrar com o Google, e envia os e-mails com o link e o código de entrada.',
  'privacidade.terceiros.anthropic':
    'Anthropic (Claude): quando você toca em "Não entendi" ou "Traduzir verso", enviamos só o verso da música e a palavra destacada. Nenhum dado seu vai junto.',
  'privacidade.terceiros.youtube':
    'YouTube: os clipes tocam no player oficial do YouTube, que segue a política de privacidade do Google. As capinhas das músicas na tela inicial também vêm do YouTube.',
  'privacidade.terceiros.lrclib': 'LRCLIB: é onde buscamos a letra sincronizada, pelo nome da música. Nenhum dado seu vai junto.',

  'privacidade.membros.title': 'O que os outros membros veem',
  'privacidade.membros.p1':
    'Seu nome aparece para os outros membros. As músicas jogadas aparecem nas "Músicas da galera", sem dizer quem jogou.',

  'privacidade.tempo.title': 'Por quanto tempo',
  'privacidade.tempo.p1':
    'Guardamos seus dados enquanto sua conta existir. Se o seu acesso for pausado, eles continuam guardados até você pedir para apagar.',

  'privacidade.direitos.title': 'Seus direitos',
  'privacidade.direitos.p1':
    'Pela Lei Geral de Proteção de Dados (LGPD), você pode pedir para ver, corrigir, apagar ou levar os seus dados. É só escrever para o e-mail de contato acima. Respondemos em até 15 dias.',

  'privacidade.idade.title': 'Idade',
  'privacidade.idade.p1':
    'O Hookbop não é para menores de 13 anos. Se você tem menos de 18, use o app com o conhecimento de um responsável.',

  'privacidade.mudancas.title': 'Mudanças nesta política',
  'privacidade.mudancas.p1': 'Se esta política mudar, avisamos no app e atualizamos a data no topo desta página.',
} as const;
