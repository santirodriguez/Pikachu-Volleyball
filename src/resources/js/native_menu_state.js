'use strict';

import menuLogicModule from './menu_logic.cjs';
import controlBindingsModule from './control_bindings.cjs';
import { PRODUCT_NAME, getIntegratedMenuStrings } from './integrated_menu_strings.js';

const {
  SUPPORTED_LOCALES,
  wrapIndex,
  shouldActivateMenuConfirm,
  menuTabDirection,
  normalizeLocale,
} = menuLogicModule;
const {
  CONTROL_BINDING_DEFINITIONS,
  formatKeyboardCode,
} = controlBindingsModule;

const NAV_IDS = Object.freeze([
  'continue',
  'restart',
  'match',
  'controls',
  'audio',
  'language',
  'about',
  'quit',
]);

const LANGUAGES = Object.freeze([
  Object.freeze({ locale: 'en', label: 'English' }),
  Object.freeze({ locale: 'es-ar', label: 'Español' }),
  Object.freeze({ locale: 'ca', label: 'Català' }),
  Object.freeze({ locale: 'ko', label: '한국어' }),
  Object.freeze({ locale: 'zh', label: '中文' }),
]);

const ABOUT_LINKS = Object.freeze([
  Object.freeze({
    id: 'website',
    url: 'https://santiagorodriguez.com',
  }),
  Object.freeze({
    id: 'source',
    url: 'https://github.com/santirodriguez/pikachu-volleyball',
  }),
  Object.freeze({
    id: 'reverse',
    url: 'https://github.com/gorisanson/pikachu-volleyball',
  }),
]);

const SETTING_VALUES = Object.freeze({
  winningScore: Object.freeze(['5', '10', '15']),
  speed: Object.freeze(['slow', 'medium', 'fast']),
  practiceMode: Object.freeze(['false', 'true']),
  graphic: Object.freeze(['sharp', 'soft']),
  colorScheme: Object.freeze(['light', 'dark']),
  bgm: Object.freeze(['on', 'off']),
  sfx: Object.freeze(['stereo', 'mono', 'off']),
});

const NAV_LAYOUT = Object.freeze({
  x: 14,
  y: 70,
  width: 130,
  height: 23,
  step: 24,
});

const PANEL_LAYOUT = Object.freeze({
  x: 158,
  y: 84,
  width: 252,
  height: 26,
  step: 31,
});

const CONTROL_LAYOUT = Object.freeze({
  player1X: 158,
  player2X: 288,
  y: 86,
  width: 122,
  height: 20,
  step: 22,
  resetY: 241,
  resetAllY: 260,
});

const TRIGGER_LAYOUT = Object.freeze({
  x: 190,
  y: 5,
  width: 52,
  height: 18,
});

const MODAL_LAYOUT = Object.freeze({
  x: 80,
  y: 89,
  width: 272,
  height: 132,
});

const MODAL_ACCEPT_LAYOUT = Object.freeze({
  x: MODAL_LAYOUT.x + 26,
  y: MODAL_LAYOUT.y + 99,
  width: 104,
  height: 22,
});

const MODAL_CANCEL_LAYOUT = Object.freeze({
  x: MODAL_LAYOUT.x + 142,
  y: MODAL_LAYOUT.y + 99,
  width: 104,
  height: 22,
});

function replaceTokens(template, tokens) {
  return Object.entries(tokens).reduce(
    (message, [key, value]) => message.replace(`{${key}}`, value),
    template
  );
}

function displaySettingValue(name, value, strings) {
  if (name === 'winningScore') {
    return `${value} ${strings.values.points}`;
  }
  if (name === 'practiceMode') {
    return value === 'true' ? strings.values.on : strings.values.off;
  }
  if (name === 'colorScheme') {
    return value === 'dark' ? strings.theme.dark : strings.theme.light;
  }
  return strings.values[value] || String(value).toUpperCase();
}

function inBounds(item, x, y) {
  return (
    x >= item.x &&
    y >= item.y &&
    x < item.x + item.width &&
    y < item.y + item.height
  );
}

function createItem({
  nodeId,
  id,
  kind,
  label,
  index,
  layout,
  focused,
  hovered = false,
  disabled = false,
  meta = {},
}) {
  return {
    ...meta,
    nodeId,
    id,
    kind,
    label,
    focused,
    hovered,
    disabled,
    x: layout.x,
    y: layout.y + index * (layout.step || layout.height),
    width: layout.width,
    height: layout.height,
  };
}

export function createNativeMenuState(commands, initialLocale = 'en') {
  let locale = normalizeLocale(initialLocale);
  let visible = false;
  let mode = 'nav';
  let selectedNavIndex = 0;
  let panelIndex = 0;
  let status = '';
  let modal = null;
  let modalFocusIndex = 0;
  let modalReturnMode = 'nav';
  let modalReturnPanelIndex = 0;
  let controlCapture = null;
  let hoveredNodeId = null;
  let triggerFocused = false;

  function strings() {
    return getIntegratedMenuStrings(locale);
  }

  function resetTransientState() {
    mode = 'nav';
    selectedNavIndex = 0;
    panelIndex = 0;
    modal = null;
    modalFocusIndex = 0;
    modalReturnMode = 'nav';
    modalReturnPanelIndex = 0;
    controlCapture = null;
    hoveredNodeId = null;
  }

  function open() {
    if (visible) return;
    visible = true;
    resetTransientState();
    triggerFocused = false;
    commands.setPaused(true);
    commands.resetInputs();
    status = strings().status.ready;
  }

  function close(resumeMatch = true) {
    modal = null;
    controlCapture = null;
    mode = 'nav';
    visible = false;
    hoveredNodeId = null;
    triggerFocused = true;
    if (resumeMatch) commands.setPaused(false);
    commands.resetInputs();
  }

  function showConfirmation(message, action) {
    modalReturnMode = mode;
    modalReturnPanelIndex = panelIndex;
    modal = {
      context: 'standard',
      title: strings().confirmation.title,
      message,
      action,
      showActions: true,
    };
    modalFocusIndex = 1;
    mode = 'modal';
    hoveredNodeId = null;
  }

  function cancelModal() {
    if (
      modal?.context === 'control-capture' ||
      modal?.context === 'control-confirm'
    ) {
      controlCapture = null;
      modal = null;
      mode = 'panel';
      return;
    }
    modal = null;
    mode = modalReturnMode;
    panelIndex = modalReturnPanelIndex;
    hoveredNodeId = null;
  }

  function updateLocale(nextLocale) {
    const normalized = normalizeLocale(nextLocale);
    if (!SUPPORTED_LOCALES.includes(normalized)) return false;
    if (normalized === locale) return true;
    locale = normalized;
    commands.persistLocale?.(locale);
    status = strings().status.ready;
    return true;
  }

  function applyPendingAction(action) {
    if (!action) return;
    if (action.type === 'restart') {
      commands.restartMatch();
      close(false);
      return;
    }
    if (action.type === 'quit') {
      commands.requestPlatformCommand({ type: 'quit' });
      return;
    }
    if (action.type === 'language') {
      if (!updateLocale(action.locale)) return;
      commands.restartForLocale();
      close(false);
    }
  }

  function acceptModal() {
    if (!modal) return;
    if (modal.context === 'control-confirm') {
      const bindingId = controlCapture?.bindingId;
      const code = controlCapture?.candidateCode;
      if (!bindingId || !code) return;
      const result = commands.setControlBinding(bindingId, code);
      if (!result.ok) {
        modal.context = 'control-capture';
        modal.showActions = false;
        modal.message = strings().controls.reserved;
        mode = 'capture';
        return;
      }
      status = strings().controls.saved;
      controlCapture = null;
      modal = null;
      mode = 'panel';
      return;
    }
    const action = modal.action;
    modal = null;
    mode = 'nav';
    applyPendingAction(action);
  }

  function cycleSetting(item, direction) {
    const values = item.values || [];
    const current = item.value;
    const currentIndex = Math.max(0, values.indexOf(current));
    const next = values[wrapIndex(currentIndex + direction, values.length)];
    let result = true;

    if (item.setting === 'winningScore') {
      result = commands.setWinningScore(next);
    } else if (item.setting === 'practiceMode') {
      result = commands.setPracticeMode(next === 'true');
    } else {
      result = commands.setSetting(item.setting, next);
    }

    if (result?.ok === false) {
      status =
        result.reason === 'practice-mode'
          ? strings().status.practiceScore
          : strings().status.scoreReached;
      return;
    }
    if (result === false) return;
    status = strings().status.changed;
  }

  function startControlCapture(bindingId) {
    const copy = strings().controls;
    controlCapture = {
      bindingId,
      candidateCode: null,
      returnIndex: panelIndex,
    };
    modal = {
      context: 'control-capture',
      title: copy.captureTitle,
      message: replaceTokens(copy.captureBody, {
        action: copy.actions[bindingId] || bindingId,
      }),
      action: null,
      showActions: false,
    };
    mode = 'capture';
  }

  function handleCaptureKey(code, repeat) {
    if (code === 'Escape') {
      cancelModal();
      return true;
    }
    if (repeat) return true;

    const result = commands.previewControlBinding(
      controlCapture?.bindingId,
      code
    );
    if (!result.ok) {
      modal.message =
        result.reason === 'key-conflict'
          ? replaceTokens(strings().controls.conflict, {
              action:
                strings().controls.actions[result.conflictId] ||
                result.conflictId,
            })
          : strings().controls.reserved;
      return true;
    }

    controlCapture.candidateCode = code;
    modal = {
      context: 'control-confirm',
      title: strings().controls.proposedTitle,
      message: replaceTokens(strings().controls.proposedBody, {
        key: formatKeyboardCode(code),
        action:
          strings().controls.actions[controlCapture.bindingId] ||
          controlCapture.bindingId,
      }),
      action: null,
      showActions: true,
    };
    modalFocusIndex = 0;
    mode = 'modal';
    return true;
  }

  function buildNavItems() {
    const copy = strings();
    return NAV_IDS.map((id, index) =>
      createItem({
        nodeId: 100 + index,
        id: `nav:${id}`,
        kind: 'nav',
        label: copy.nav[id],
        index,
        layout: NAV_LAYOUT,
        focused: mode === 'nav' && selectedNavIndex === index,
        hovered: hoveredNodeId === 100 + index,
        meta: { navId: id, selected: selectedNavIndex === index },
      })
    );
  }

  function currentNavId() {
    return NAV_IDS[selectedNavIndex] || 'continue';
  }

  function buildPanelItems() {
    const copy = strings();
    const settings = commands.getSettings();
    const id = currentNavId();
    const definitions = [];

    if (id === 'restart') {
      definitions.push({
        id: 'action:restart',
        kind: 'action',
        action: 'restart',
        label: copy.restart.action,
      });
    } else if (id === 'match') {
      definitions.push(
        {
          id: 'setting:winningScore',
          kind: 'setting',
          setting: 'winningScore',
          values: SETTING_VALUES.winningScore,
          value: String(settings.winningScore),
          label: copy.match.winningScore,
        },
        {
          id: 'setting:speed',
          kind: 'setting',
          setting: 'speed',
          values: SETTING_VALUES.speed,
          value: settings.speed,
          label: copy.match.speed,
        },
        {
          id: 'setting:practiceMode',
          kind: 'setting',
          setting: 'practiceMode',
          values: SETTING_VALUES.practiceMode,
          value: String(settings.practiceMode),
          label: copy.match.practice,
        },
        {
          id: 'command:reset-defaults',
          kind: 'command',
          command: 'reset-defaults',
          label: copy.match.reset,
        }
      );
    } else if (id === 'controls') {
      const playerRows = { 1: 0, 2: 0 };
      for (const definition of CONTROL_BINDING_DEFINITIONS) {
        const row = playerRows[definition.player]++;
        definitions.push({
          id: `control:${definition.id}`,
          kind: 'control',
          bindingId: definition.id,
          player: definition.player,
          row,
          label:
            copy.controls.actions[definition.id] || definition.id,
          value:
            settings.controlBindings[definition.id] ||
            definition.defaultCode,
        });
      }
      definitions.push(
        {
          id: 'control-reset:player1',
          kind: 'control-reset',
          scope: 'player1',
          label: copy.controls.resetPlayer1,
        },
        {
          id: 'control-reset:player2',
          kind: 'control-reset',
          scope: 'player2',
          label: copy.controls.resetPlayer2,
        },
        {
          id: 'control-reset:all',
          kind: 'control-reset',
          scope: 'all',
          label: copy.controls.resetAll,
        }
      );
    } else if (id === 'audio') {
      definitions.push(
        {
          id: 'setting:graphic',
          kind: 'setting',
          setting: 'graphic',
          values: SETTING_VALUES.graphic,
          value: settings.graphic,
          label: copy.audio.graphics,
        },
        {
          id: 'setting:colorScheme',
          kind: 'setting',
          setting: 'colorScheme',
          values: SETTING_VALUES.colorScheme,
          value: settings.colorScheme,
          label: copy.theme.label,
        },
        {
          id: 'setting:bgm',
          kind: 'setting',
          setting: 'bgm',
          values: SETTING_VALUES.bgm,
          value: settings.bgm,
          label: copy.audio.bgm,
        },
        {
          id: 'setting:sfx',
          kind: 'setting',
          setting: 'sfx',
          values: SETTING_VALUES.sfx,
          value: settings.sfx,
          label: copy.audio.sfx,
        }
      );
    } else if (id === 'language') {
      for (const language of LANGUAGES) {
        definitions.push({
          id: `locale:${language.locale}`,
          kind: 'locale',
          locale: language.locale,
          label: language.label,
          value: language.locale === locale ? copy.language.current : '',
        });
      }
    } else if (id === 'about') {
      for (const link of ABOUT_LINKS) {
        definitions.push({
          id: `link:${link.id}`,
          kind: 'link',
          url: link.url,
          label:
            link.id === 'website'
              ? copy.about.website
              : link.id === 'source'
              ? copy.about.source
              : copy.about.reverseLink,
        });
      }
    } else if (id === 'quit') {
      definitions.push({
        id: 'action:quit',
        kind: 'action',
        action: 'quit',
        label: copy.quit.action,
      });
    }

    const length = definitions.length;
    panelIndex = length > 0 ? wrapIndex(panelIndex, length) : 0;

    return definitions.map((definition, index) => {
      let valueLabel = '';
      if (definition.kind === 'setting') {
        valueLabel = displaySettingValue(
          definition.setting,
          definition.value,
          copy
        );
      } else if (definition.kind === 'control') {
        valueLabel = formatKeyboardCode(definition.value);
      } else if (definition.kind === 'locale') {
        valueLabel = definition.value;
      }

      const accessibilityLabel = valueLabel
        ? `${definition.label}: ${valueLabel}`
        : definition.label;
      let layout = PANEL_LAYOUT;
      let itemIndex = index;
      let groupLabel = '';

      if (definition.kind === 'control') {
        const playerOne = definition.player === 1;
        layout = {
          x: playerOne ? CONTROL_LAYOUT.player1X : CONTROL_LAYOUT.player2X,
          y: CONTROL_LAYOUT.y + definition.row * CONTROL_LAYOUT.step,
          width: CONTROL_LAYOUT.width,
          height: CONTROL_LAYOUT.height,
        };
        itemIndex = 0;
        if (definition.row === 0) {
          groupLabel = playerOne
            ? copy.controls.player1
            : copy.controls.player2;
        }
      } else if (definition.kind === 'control-reset') {
        if (definition.scope === 'all') {
          layout = {
            x: CONTROL_LAYOUT.player1X,
            y: CONTROL_LAYOUT.resetAllY,
            width:
              CONTROL_LAYOUT.player2X +
              CONTROL_LAYOUT.width -
              CONTROL_LAYOUT.player1X,
            height: 18,
          };
        } else {
          layout = {
            x:
              definition.scope === 'player1'
                ? CONTROL_LAYOUT.player1X
                : CONTROL_LAYOUT.player2X,
            y: CONTROL_LAYOUT.resetY,
            width: CONTROL_LAYOUT.width,
            height: 18,
          };
        }
        itemIndex = 0;
      }

      return createItem({
        nodeId: 1000 + index,
        id: definition.id,
        kind: definition.kind,
        label: accessibilityLabel,
        index: itemIndex,
        layout,
        focused: mode === 'panel' && panelIndex === index,
        hovered: hoveredNodeId === 1000 + index,
        meta: {
          ...definition,
          displayLabel: definition.label,
          secondaryLabel: valueLabel,
          groupLabel,
        },
      });
    });
  }

  function panelCopy() {
    const copy = strings();
    const id = currentNavId();
    if (id === 'continue') return copy.continue;
    if (id === 'restart') return copy.restart;
    if (id === 'match') return copy.match;
    if (id === 'controls') return copy.controls;
    if (id === 'audio') return copy.audio;
    if (id === 'language') return copy.language;
    if (id === 'about') return copy.about;
    return copy.quit;
  }

  function buildModalItems() {
    if (!modal?.showActions) return [];
    const copy = strings();
    return [
      createItem({
        nodeId: 9000,
        id: 'modal:accept',
        kind: 'modal',
        label: copy.confirmation.accept,
        index: 0,
        layout: MODAL_ACCEPT_LAYOUT,
        focused: mode === 'modal' && modalFocusIndex === 0,
        hovered: hoveredNodeId === 9000,
        meta: { modalAction: 'accept' },
      }),
      createItem({
        nodeId: 9001,
        id: 'modal:cancel',
        kind: 'modal',
        label: copy.confirmation.cancel,
        index: 0,
        layout: MODAL_CANCEL_LAYOUT,
        focused: mode === 'modal' && modalFocusIndex === 1,
        hovered: hoveredNodeId === 9001,
        meta: { modalAction: 'cancel' },
      }),
    ];
  }

  function buildTriggerItem() {
    const copy = strings();
    return createItem({
      nodeId: 50,
      id: 'menu-trigger',
      kind: 'trigger',
      label: `P · ${copy.trigger}`,
      index: 0,
      layout: TRIGGER_LAYOUT,
      focused: triggerFocused,
      hovered: hoveredNodeId === 50,
      meta: { trigger: true },
    });
  }

  function getFrame() {
    const copy = strings();
    const section = panelCopy();
    const navItems = buildNavItems();
    const panelItems = buildPanelItems();
    const modalItems = buildModalItems();
    const settings = commands.getSettings();
    return {
      visible,
      locale,
      colorScheme: settings.colorScheme === 'dark' ? 'dark' : 'light',
      mode,
      productName: PRODUCT_NAME,
      title: copy.paused,
      panelKicker: section.kicker || '',
      panelTitle: section.title || copy.nav[currentNavId()],
      panelBody: section.body || '',
      panelPoster: section.poster || '',
      panelHelp: section.help || '',
      status: status || copy.status.ready,
      navigationHint:
        mode === 'panel'
          ? `Esc · ${copy.hints.returnToMenu}`
          : `Tab · ${copy.hints.navigate}`,
      trigger: visible ? null : buildTriggerItem(),
      navItems,
      panelItems,
      modal: modal
        ? {
            title: modal.title,
            message: modal.message,
            showActions: modal.showActions,
            x: MODAL_LAYOUT.x,
            y: MODAL_LAYOUT.y,
            width: MODAL_LAYOUT.width,
            height: MODAL_LAYOUT.height,
            items: modalItems,
          }
        : null,
    };
  }

  function activateNavItem() {
    const id = currentNavId();
    if (id === 'continue') {
      close(true);
    } else if (id === 'restart') {
      showConfirmation(strings().restart.warning, { type: 'restart' });
    } else if (id === 'quit') {
      showConfirmation(strings().quit.warning, { type: 'quit' });
    } else {
      mode = 'panel';
      panelIndex = 0;
    }
  }

  function activatePanelItem(item, direction = 1) {
    if (!item || item.disabled) return;
    if (item.kind === 'setting') {
      cycleSetting(item, direction);
    } else if (item.kind === 'command') {
      commands.resetDefaults();
      status = strings().status.defaults;
    } else if (item.kind === 'action') {
      if (item.action === 'restart') {
        showConfirmation(strings().restart.warning, { type: 'restart' });
      } else if (item.action === 'quit') {
        showConfirmation(strings().quit.warning, { type: 'quit' });
      }
    } else if (item.kind === 'control') {
      startControlCapture(item.bindingId);
    } else if (item.kind === 'control-reset') {
      commands.resetControlBindingScope(item.scope);
      status = strings().controls.resetDone;
    } else if (item.kind === 'locale') {
      if (item.locale === locale) {
        status = strings().status.currentLanguage;
      } else if (commands.isMatchInProgress()) {
        showConfirmation(strings().language.restartWarning, {
          type: 'language',
          locale: item.locale,
        });
      } else {
        if (!updateLocale(item.locale)) return;
        commands.restartForLocale();
        close(false);
      }
    } else if (item.kind === 'link') {
      commands.requestPlatformCommand({
        type: 'openUrl',
        url: item.url,
      });
    }
  }

  function handleModalKey(code, repeat = false, shiftKey = false) {
    const items = buildModalItems();
    if (code === 'Tab') {
      if (items.length > 0) {
        modalFocusIndex = wrapIndex(
          modalFocusIndex + menuTabDirection(shiftKey),
          items.length
        );
      }
    } else if (code === 'ArrowLeft' || code === 'ArrowRight') {
      modalFocusIndex = wrapIndex(modalFocusIndex + 1, items.length);
    } else if (shouldActivateMenuConfirm(code, repeat)) {
      if (modalFocusIndex === 1) cancelModal();
      else acceptModal();
    } else if (code === 'Escape' || code === 'KeyP') {
      cancelModal();
    }
  }

  function handleTab(shiftKey = false) {
    const direction = menuTabDirection(shiftKey);
    if (mode === 'panel') {
      const items = buildPanelItems();
      if (items.length === 0) {
        mode = 'nav';
        return;
      }
      const next = panelIndex + direction;
      if (next >= 0 && next < items.length) {
        panelIndex = next;
      } else {
        mode = 'nav';
      }
      return;
    }

    const items = buildPanelItems();
    if (!shiftKey && items.length > 0) {
      mode = 'panel';
      panelIndex = 0;
      return;
    }
    selectedNavIndex = wrapIndex(
      selectedNavIndex + direction,
      NAV_IDS.length
    );
    panelIndex = 0;
  }

  function handleKey(code, isDown, repeat = false, shiftKey = false) {
    if (typeof code !== 'string' || code.length === 0) return false;

    if (mode === 'capture' && isDown) {
      return handleCaptureKey(code, repeat);
    }
    if (mode === 'modal' && isDown) {
      handleModalKey(code, repeat, shiftKey);
      return true;
    }

    if (code === 'KeyP') {
      if (!isDown || repeat) return true;
      if (visible) close(true);
      else open();
      return true;
    }

    if (!visible) return false;
    if (!isDown) return true;

    if (code === 'Tab') {
      handleTab(shiftKey);
      return true;
    }

    if (mode === 'panel') {
      const items = buildPanelItems();
      if (code === 'ArrowDown') {
        panelIndex = wrapIndex(panelIndex + 1, items.length);
      } else if (code === 'ArrowUp') {
        panelIndex = wrapIndex(panelIndex - 1, items.length);
      } else if (code === 'ArrowLeft' || code === 'ArrowRight') {
        const item = items[panelIndex];
        if (item?.kind === 'setting') {
          activatePanelItem(item, code === 'ArrowRight' ? 1 : -1);
        } else if (item?.kind === 'locale') {
          panelIndex = wrapIndex(
            panelIndex + (code === 'ArrowRight' ? 1 : -1),
            items.length
          );
        }
      } else if (shouldActivateMenuConfirm(code, repeat)) {
        activatePanelItem(items[panelIndex], 1);
      } else if (code === 'Escape') {
        mode = 'nav';
      }
      return true;
    }

    if (code === 'ArrowDown') {
      selectedNavIndex = wrapIndex(selectedNavIndex + 1, NAV_IDS.length);
      panelIndex = 0;
    } else if (code === 'ArrowUp') {
      selectedNavIndex = wrapIndex(selectedNavIndex - 1, NAV_IDS.length);
      panelIndex = 0;
    } else if (shouldActivateMenuConfirm(code, repeat)) {
      activateNavItem();
    } else if (code === 'Escape') {
      close(true);
    }
    return true;
  }

  function focusNode(nodeId) {
    const frame = getFrame();
    if (!visible && frame.trigger?.nodeId === nodeId) {
      triggerFocused = true;
      return true;
    }
    if (frame.modal) {
      const modalIndex = frame.modal.items.findIndex(
        (item) => item.nodeId === nodeId
      );
      if (modalIndex >= 0) {
        modalFocusIndex = modalIndex;
        mode = 'modal';
        return true;
      }
      return false;
    }

    const navIndex = frame.navItems.findIndex(
      (item) => item.nodeId === nodeId
    );
    if (navIndex >= 0) {
      selectedNavIndex = navIndex;
      panelIndex = 0;
      mode = 'nav';
      return true;
    }
    const nextPanelIndex = frame.panelItems.findIndex(
      (item) => item.nodeId === nodeId
    );
    if (nextPanelIndex >= 0) {
      panelIndex = nextPanelIndex;
      mode = 'panel';
      return true;
    }
    return false;
  }

  function activateNode(nodeId) {
    const frame = getFrame();
    if (!visible && frame.trigger?.nodeId === nodeId) {
      open();
      return true;
    }
    if (frame.modal) {
      const modalIndex = frame.modal.items.findIndex(
        (item) => item.nodeId === nodeId
      );
      if (modalIndex < 0) return false;
      modalFocusIndex = modalIndex;
      if (modalIndex === 1) cancelModal();
      else acceptModal();
      return true;
    }

    const navIndex = frame.navItems.findIndex(
      (item) => item.nodeId === nodeId
    );
    if (navIndex >= 0) {
      selectedNavIndex = navIndex;
      panelIndex = 0;
      mode = 'nav';
      if (frame.navItems[navIndex]?.navId === 'continue') {
        activateNavItem();
      }
      return true;
    }
    const nextPanelIndex = frame.panelItems.findIndex(
      (item) => item.nodeId === nodeId
    );
    if (nextPanelIndex >= 0) {
      panelIndex = nextPanelIndex;
      mode = 'panel';
      activatePanelItem(frame.panelItems[nextPanelIndex], 1);
      return true;
    }
    return false;
  }

  function handlePointer(x, y, isDown) {
    const frame = getFrame();

    if (!visible) {
      const trigger = frame.trigger;
      const overTrigger = Boolean(trigger && inBounds(trigger, x, y));
      hoveredNodeId = overTrigger ? trigger.nodeId : null;
      if (isDown && overTrigger) {
        triggerFocused = true;
        open();
      }
      return overTrigger;
    }

    const items = frame.modal
      ? frame.modal.items
      : [...frame.navItems, ...frame.panelItems];
    const item = items.find((candidate) => inBounds(candidate, x, y)) || null;
    hoveredNodeId = item?.nodeId || null;

    if (!isDown || !item) return true;

    focusNode(item.nodeId);
    if (item.kind === 'nav' && item.navId !== 'continue') {
      return true;
    }
    activateNode(item.nodeId);
    return true;
  }

  function handleAccessibilityAction(nodeId, action) {
    if (!visible && nodeId !== 50) return false;
    if (action === 'focus') return focusNode(nodeId);
    if (action === 'click') return activateNode(nodeId);
    return false;
  }

  function setLocale(nextLocale) {
    return updateLocale(nextLocale);
  }

  return Object.freeze({
    open,
    close,
    handleKey,
    handlePointer,
    handleAccessibilityAction,
    getFrame,
    getLocale: () => locale,
    getQuickRematchHint: () => strings().quickRematchHint,
    setLocale,
    isVisible: () => visible,
  });
}

export const NATIVE_ABOUT_URLS = ABOUT_LINKS.map(({ url }) => url);
