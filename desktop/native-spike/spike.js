const locales = ['en', 'es-ar', 'ca', 'ko', 'zh'];

const state = {
  selected: 0,
  localeIndex: 0,
  audioRequests: 0,
  quit: false,
};

function clampMenu(index) {
  const count = 3;
  return (index + count) % count;
}

function nativeHandleKey(key) {
  switch (key) {
    case 'up':
      state.selected = clampMenu(state.selected - 1);
      break;
    case 'down':
      state.selected = clampMenu(state.selected + 1);
      break;
    case 'left':
      if (state.selected === 1) {
        state.localeIndex =
          (state.localeIndex + locales.length - 1) % locales.length;
      }
      break;
    case 'right':
      if (state.selected === 1) {
        state.localeIndex = (state.localeIndex + 1) % locales.length;
      }
      break;
    case 'enter':
      if (state.selected === 2) {
        state.audioRequests += 1;
      }
      break;
    case 'escape':
      state.quit = true;
      break;
    default:
      break;
  }
}

function nativeGetSelected() {
  return state.selected;
}

function nativeGetLocaleIndex() {
  return state.localeIndex;
}

function nativeGetAudioRequests() {
  return state.audioRequests;
}

function nativeGetQuit() {
  return state.quit ? 1 : 0;
}
