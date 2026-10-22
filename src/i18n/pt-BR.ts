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
  'home.songsError': 'Não deu pra carregar as músicas agora.',
  // Ninguém jogou ainda: o DJ Bop convida a colar a primeira.
  'home.empty': 'Tá silêncio por aqui. Cola a primeira!',
  'home.invite': 'Convidar',
  'home.admin': 'Admin',
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
  'jogo.explain': 'Não entendi',
  'jogo.slow': '0.75x',
  'jogo.repeat': 'Repetir verso',
  'jogo.hint': 'Dica',
  'jogo.hintAd': 'Dica · anúncio',
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
} as const;
