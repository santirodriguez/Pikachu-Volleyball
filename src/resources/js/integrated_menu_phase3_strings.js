'use strict';

const CONTROL_ACTIONS_EN = Object.freeze({
  'p1.left': 'Move left',
  'p1.right': 'Move right',
  'p1.up': 'Jump',
  'p1.down': 'Move down',
  'p1.downRight': 'Down-right shortcut',
  'p1.powerPrimary': 'Power Hit · primary',
  'p1.powerAlternate': 'Power Hit · alternate',
  'p2.left': 'Move left',
  'p2.right': 'Move right',
  'p2.up': 'Jump',
  'p2.down': 'Move down',
  'p2.powerPrimary': 'Power Hit · primary',
  'p2.powerAlternate': 'Power Hit · alternate',
});

const CONTROL_ACTIONS_KO = Object.freeze({
  'p1.left': '왼쪽 이동',
  'p1.right': '오른쪽 이동',
  'p1.up': '점프',
  'p1.down': '아래 이동',
  'p1.downRight': '오른쪽 아래 단축키',
  'p1.powerPrimary': '파워 히트 · 기본',
  'p1.powerAlternate': '파워 히트 · 보조',
  'p2.left': '왼쪽 이동',
  'p2.right': '오른쪽 이동',
  'p2.up': '점프',
  'p2.down': '아래 이동',
  'p2.powerPrimary': '파워 히트 · 기본',
  'p2.powerAlternate': '파워 히트 · 보조',
});

const CONTROL_ACTIONS_ZH = Object.freeze({
  'p1.left': '向左移动',
  'p1.right': '向右移动',
  'p1.up': '跳跃',
  'p1.down': '向下移动',
  'p1.downRight': '右下快捷键',
  'p1.powerPrimary': '强力击球 · 主键',
  'p1.powerAlternate': '强力击球 · 备用键',
  'p2.left': '向左移动',
  'p2.right': '向右移动',
  'p2.up': '跳跃',
  'p2.down': '向下移动',
  'p2.powerPrimary': '强力击球 · 主键',
  'p2.powerAlternate': '强力击球 · 备用键',
});

const CONTROL_EDITOR = Object.freeze({
  en: {
    actions: CONTROL_ACTIONS_EN,
    change: 'Change',
    resetPlayer1: 'Reset Player 1',
    resetPlayer2: 'Reset Player 2',
    resetAll: 'Reset all controls',
    captureTitle: 'Press a new key',
    captureBody: 'Choose a key for {action}. Escape cancels.',
    proposedTitle: 'Confirm new control',
    proposedBody: 'Use {key} for {action}?',
    reserved: 'That key is reserved for pause, back, or practice reset.',
    conflict: 'That key is already assigned to {action}.',
    saved: 'Control updated.',
    resetDone: 'Control defaults restored.',
  },
  'es-ar': {
    actions: {
      'p1.left': 'Mover a la izquierda',
      'p1.right': 'Mover a la derecha',
      'p1.up': 'Saltar',
      'p1.down': 'Bajar',
      'p1.downRight': 'Atajo abajo-derecha',
      'p1.powerPrimary': 'Golpe fuerte · principal',
      'p1.powerAlternate': 'Golpe fuerte · alternativo',
      'p2.left': 'Mover a la izquierda',
      'p2.right': 'Mover a la derecha',
      'p2.up': 'Saltar',
      'p2.down': 'Bajar',
      'p2.powerPrimary': 'Golpe fuerte · principal',
      'p2.powerAlternate': 'Golpe fuerte · alternativo',
    },
    change: 'Cambiar',
    resetPlayer1: 'Restaurar Jugador 1',
    resetPlayer2: 'Restaurar Jugador 2',
    resetAll: 'Restaurar todos',
    captureTitle: 'Presioná una tecla nueva',
    captureBody: 'Elegí una tecla para {action}. Escape cancela.',
    proposedTitle: 'Confirmar control',
    proposedBody: '¿Usar {key} para {action}?',
    reserved:
      'Esa tecla está reservada para pausa, volver o reiniciar la pelota.',
    conflict: 'Esa tecla ya está asignada a {action}.',
    saved: 'Control actualizado.',
    resetDone: 'Controles predeterminados restaurados.',
  },
  ko: {
    actions: CONTROL_ACTIONS_KO,
    change: '키 변경',
    resetPlayer1: '플레이어 1 초기화',
    resetPlayer2: '플레이어 2 초기화',
    resetAll: '모든 조작 초기화',
    captureTitle: '새 키를 누르세요',
    captureBody: '{action}에 사용할 키를 누르세요. Escape로 취소합니다.',
    proposedTitle: '새 조작 확인',
    proposedBody: '{action}에 {key} 키를 사용하시겠습니까?',
    reserved: '일시 정지, 뒤로 가기 또는 공 초기화에 예약된 키입니다.',
    conflict: '이미 {action}에 할당된 키입니다.',
    saved: '조작 키가 변경되었습니다.',
    resetDone: '기본 조작을 복원했습니다.',
  },
  zh: {
    actions: CONTROL_ACTIONS_ZH,
    change: '更改',
    resetPlayer1: '重置玩家 1',
    resetPlayer2: '重置玩家 2',
    resetAll: '重置全部控制',
    captureTitle: '按下新按键',
    captureBody: '为 {action} 选择按键。按 Escape 取消。',
    proposedTitle: '确认新控制',
    proposedBody: '将 {key} 用于 {action}？',
    reserved: '该按键已保留给暂停、返回或重置球。',
    conflict: '该按键已分配给 {action}。',
    saved: '控制已更新。',
    resetDone: '已恢复默认控制。',
  },
  ca: {
    actions: {
      'p1.left': 'Moure’s a l’esquerra',
      'p1.right': 'Moure’s a la dreta',
      'p1.up': 'Saltar',
      'p1.down': 'Baixar',
      'p1.downRight': 'Drecera avall-dreta',
      'p1.powerPrimary': 'Cop potent · principal',
      'p1.powerAlternate': 'Cop potent · alternatiu',
      'p2.left': 'Moure’s a l’esquerra',
      'p2.right': 'Moure’s a la dreta',
      'p2.up': 'Saltar',
      'p2.down': 'Baixar',
      'p2.powerPrimary': 'Cop potent · principal',
      'p2.powerAlternate': 'Cop potent · alternatiu',
    },
    change: 'Canviar',
    resetPlayer1: 'Restablir Jugador 1',
    resetPlayer2: 'Restablir Jugador 2',
    resetAll: 'Restablir tots els controls',
    captureTitle: 'Prem una tecla nova',
    captureBody: 'Tria una tecla per a {action}. Escape cancel·la.',
    proposedTitle: 'Confirma el control',
    proposedBody: 'Vols usar {key} per a {action}?',
    reserved:
      'Aquesta tecla està reservada per a pausa, tornar o reiniciar la pilota.',
    conflict: 'Aquesta tecla ja està assignada a {action}.',
    saved: 'Control actualitzat.',
    resetDone: 'Controls predeterminats restaurats.',
  },
});

const ABOUT_COPY = Object.freeze({
  en: {
    kicker: 'VERSION 2.0',
    title: 'One more match, years later',
    body:
      'As a child, this game meant a great deal to me. On a low-powered computer, Game Boy Color emulators and simple, joyful, hard-to-put-down games like this became my doorway into the Pokémon world—and the beginning of an affection that never really left.',
    original:
      '<strong>Pikachu Volleyball (1997)</strong> — SACHI SOFT / SAWAYAKAN Programmers and Satoshi Takenouchi. Thanks for creating the small, unforgettable classic that started it all.',
    reverse:
      '<a href="https://github.com/gorisanson/pikachu-volleyball" target="_blank" rel="noopener"><strong>JavaScript reverse-engineering reimplementation</strong></a> — Kyutae Lee. Thanks for the painstaking work that kept the game alive on the web and made this edition possible.',
    fork: 'This edition is simply my way of caring for a game I remember fondly.',
    website: 'Visit santiagorodriguez.com',
    source: 'View source on GitHub',
    punchline: 'Some childhood games always deserve one more match.',
  },
  'es-ar': {
    kicker: 'VERSIÓN 2.0',
    title: 'Un partido más, tantos años después',
    body:
      'De chico, este juego me hacía mucha ilusión. En una computadora con pocos recursos, los emuladores de Game Boy Color y estos juegos sencillos, alegres y difíciles de soltar fueron mi puerta de entrada al universo Pokémon y el comienzo de un cariño que todavía conservo.',
    original:
      '<strong>Pikachu Volleyball (1997)</strong> — SACHI SOFT / SAWAYAKAN Programmers y Satoshi Takenouchi. Gracias por crear el pequeño e inolvidable clásico que empezó todo.',
    reverse:
      '<a href="https://github.com/gorisanson/pikachu-volleyball" target="_blank" rel="noopener"><strong>Reimplementación en JavaScript mediante ingeniería inversa</strong></a> — Kyutae Lee. Gracias por el trabajo minucioso que mantuvo vivo el juego en la web e hizo posible esta edición.',
    fork: 'Esta edición es, simplemente, mi manera de cuidar un juego que recuerdo con mucho cariño.',
    website: 'Visitar santiagorodriguez.com',
    source: 'Ver código en GitHub',
    punchline: 'Hay juegos de la infancia que siempre merecen un partido más.',
  },
  ko: {
    kicker: '버전 2.0',
    title: '세월이 흘러도, 한 경기 더',
    body:
      '어릴 적 이 게임은 제게 큰 설렘이었습니다. 성능이 낮은 컴퓨터에서 Game Boy Color 에뮬레이터와 이처럼 단순하지만 즐겁고 좀처럼 손을 놓기 힘든 게임들은 포켓몬 세계로 들어가는 문이 되었고, 지금까지 이어지는 애정의 시작이 되었습니다.',
    original:
      '<strong>Pikachu Volleyball (1997)</strong> — SACHI SOFT / SAWAYAKAN Programmers와 Satoshi Takenouchi. 이 모든 것의 시작이 된 작지만 잊을 수 없는 고전을 만들어 주셔서 감사합니다.',
    reverse:
      '<a href="https://github.com/gorisanson/pikachu-volleyball" target="_blank" rel="noopener"><strong>JavaScript 리버스 엔지니어링 재구현</strong></a> — Kyutae Lee. 웹에서 이 게임을 이어 가고 이번 에디션을 가능하게 한 세심한 작업에 감사드립니다.',
    fork: '이 에디션은 좋은 추억으로 간직한 게임을 조심스럽게 돌보는 저만의 작은 방식일 뿐입니다.',
    website: 'santiagorodriguez.com 방문',
    source: 'GitHub 소스 보기',
    punchline: '어린 시절의 어떤 게임은 언제나 한 경기를 더 할 가치가 있습니다.',
  },
  zh: {
    kicker: '版本 2.0',
    title: '多年以后，再来一局',
    body:
      '小时候，这款游戏曾让我满怀期待。那时电脑性能有限，Game Boy Color 模拟器和这类简单、快乐又让人舍不得放下的游戏，成了我走进宝可梦世界的入口，也开启了一份延续至今的喜爱。',
    original:
      '<strong>Pikachu Volleyball (1997)</strong> — SACHI SOFT / SAWAYAKAN Programmers 与 Satoshi Takenouchi。感谢你们创造了这个小巧却令人难忘的经典，一切由此开始。',
    reverse:
      '<a href="https://github.com/gorisanson/pikachu-volleyball" target="_blank" rel="noopener"><strong>JavaScript 逆向工程重实现</strong></a> — Kyutae Lee。感谢这项细致工作，让游戏在网页上延续，也让这个版本成为可能。',
    fork: '这个版本只是我珍惜一款童年游戏、认真照看它的一种方式。',
    website: '访问 santiagorodriguez.com',
    source: '在 GitHub 查看源码',
    punchline: '有些童年游戏，总值得再来一局。',
  },
  ca: {
    kicker: 'VERSIÓ 2.0',
    title: 'Un partit més, tants anys després',
    body:
      'De petit, aquest joc em feia molta il·lusió. En un ordinador amb pocs recursos, els emuladors de Game Boy Color i jocs senzills, alegres i difícils de deixar com aquest van ser la meva porta d’entrada a l’univers Pokémon i l’inici d’un afecte que encara conservo.',
    original:
      '<strong>Pikachu Volleyball (1997)</strong> — SACHI SOFT / SAWAYAKAN Programmers i Satoshi Takenouchi. Gràcies per crear el petit clàssic inoblidable que ho va començar tot.',
    reverse:
      '<a href="https://github.com/gorisanson/pikachu-volleyball" target="_blank" rel="noopener"><strong>Reimplementació JavaScript mitjançant enginyeria inversa</strong></a> — Kyutae Lee. Gràcies per la feina minuciosa que va mantenir el joc viu al web i va fer possible aquesta edició.',
    fork: 'Aquesta edició és, simplement, la meva manera de cuidar un joc que recordo amb molt d’afecte.',
    website: 'Visita santiagorodriguez.com',
    source: 'Veure el codi a GitHub',
    punchline: 'Hi ha jocs de la infància que sempre mereixen un partit més.',
  },
});

const CATALAN = Object.freeze({
  paused: 'EN PAUSA',
  chip: '2.0 · ENCARA REMATANT',
  trigger: 'MENÚ',
  nav: {
    continue: 'Continuar',
    restart: 'Reiniciar el partit',
    match: 'Configuració del partit',
    controls: 'Controls',
    audio: 'Àudio i gràfics',
    language: 'Idioma',
    about: 'Quant al joc',
    quit: 'Sortir',
  },
  continue: {
    kicker: 'PARTIT',
    title: 'Tornem al ral·li?',
    body: 'Continua exactament el partit, el marcador i la configuració actuals.',
    poster: 'QUE CONTINUÏ EL RAL·LI',
  },
  restart: {
    kicker: 'PARTIT',
    title: 'Reiniciar el partit',
    body: 'Comença de nou amb els mateixos jugadors i opcions.',
    warning: 'S’esborraran el marcador i el progrés de la ronda.',
    action: 'Reiniciar ara',
  },
  match: {
    kicker: 'JUGABILITAT',
    title: 'Configuració del partit',
    body: 'Opcions reals. Cap interruptor decoratiu fingint que treballa.',
    winningScore: 'Puntuació guanyadora',
    speed: 'Velocitat',
    practice: 'Mode pràctica',
    reset: 'Restablir valors',
  },
  controls: {
    kicker: 'ENTRADA',
    title: 'Controls',
    body:
      'Selecciona una acció i prem la tecla que vulguis. Els valors predeterminats continuen sent una bona idea.',
    player1: 'JUGADOR 1',
    player2: 'JUGADOR 2',
    move: 'Moure',
    jumpDown: 'Saltar / Baixar',
    powerHit: 'Cop potent',
    pause: 'Menú de pausa',
    practiceReset: 'Reiniciar la pilota',
  },
  audio: {
    kicker: 'PRESENTACIÓ',
    title: 'Àudio i gràfics',
    body:
      'El caràcter original, amb menys motius per obrir menús del sistema operatiu.',
    graphics: 'Gràfics',
    bgm: 'Música',
    sfx: 'Efectes',
  },
  language: {
    kicker: 'IDIOMA',
    title: 'Idioma',
    body: 'Tria amb el ratolí o prem Seleccionar i usa les fletxes.',
    current: 'Idioma actual',
    restartWarning:
      'Canviar l’idioma recarrega l’aplicació i reinicia el partit actual.',
  },
  about: ABOUT_COPY.ca,
  quit: {
    kicker: 'ESCRIPTORI',
    title: 'Sortir del joc',
    body: 'Tanca l’AppImage i torna a un món amb menys Pikachus volant.',
    warning: 'El partit actual acabarà.',
    action: 'Sortir ara',
  },
  confirmation: {
    title: 'N’estàs segur?',
    accept: 'Confirmar',
    cancel: 'Cancel·lar',
  },
  hints: {
    navigate: 'Navegar',
    select: 'Seleccionar',
    back: 'Tornar',
    change: 'Canviar',
    returnToMenu: 'Tornar al menú',
  },
  status: {
    ready: 'Joc en pausa. Tria una acció.',
    resumed: 'Partit reprès.',
    restarted: 'Partit reiniciat.',
    changed: 'Configuració aplicada.',
    defaults: 'Valors predeterminats restaurats.',
    currentLanguage: 'Aquest idioma ja està actiu.',
    practiceScore:
      'La puntuació guanyadora no s’utilitza en mode pràctica.',
    scoreReached: 'Aquesta puntuació ja s’ha assolit en el partit.',
    quitUnavailable:
      'Sortir només està disponible a l’AppImage d’escriptori.',
  },
  values: {
    on: 'ACTIVAT',
    off: 'DESACTIVAT',
    sharp: 'NÍTID',
    soft: 'SUAU',
    stereo: 'ESTÈREO',
    mono: 'MONO',
    slow: 'LENTA',
    medium: 'MITJANA',
    fast: 'RÀPIDA',
    points: 'PTS',
  },
});

export function getPhase3MenuStrings(locale, baseStrings) {
  const editor = CONTROL_EDITOR[locale] || CONTROL_EDITOR.en;
  const about = ABOUT_COPY[locale] || ABOUT_COPY.en;
  if (locale === 'ca') {
    return {
      ...baseStrings,
      ...CATALAN,
      about,
      controls: { ...CATALAN.controls, ...editor },
    };
  }
  return {
    ...baseStrings,
    about,
    controls: { ...baseStrings.controls, ...editor },
  };
}
