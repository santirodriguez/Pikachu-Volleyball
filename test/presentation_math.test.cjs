'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const presentation = require('../src/resources/js/presentation_math.cjs');

test('shared presentation math preserves player frames and facing', () => {
  assert.equal(presentation.getPlayerFrameIndex(0, 4), 4);
  assert.equal(presentation.getPlayerFrameIndex(3, 1), 16);
  assert.equal(presentation.getPlayerFrameIndex(4, 0), 17);
  assert.equal(presentation.getPlayerFrameIndex(5, 2), 20);

  assert.equal(presentation.getPlayerScaleX(1, 0, 0), 1);
  assert.equal(presentation.getPlayerScaleX(1, 3, -1), -1);
  assert.equal(presentation.getPlayerScaleX(1, 3, 1), 1);
  assert.equal(presentation.getPlayerScaleX(2, 0, 0), -1);
  assert.equal(presentation.getPlayerScaleX(2, 3, 1), 1);
  assert.equal(presentation.getPlayerScaleX(2, 3, -1), -1);
});

test('shared presentation math preserves punch and score rendering', () => {
  assert.deepEqual(
    presentation.getPunchLayout({
      punchEffectRadius: 20,
      punchEffectX: 210,
      punchEffectY: 272,
    }),
    {
      visible: true,
      x: 210,
      y: 272,
      width: 36,
      height: 36,
    }
  );
  assert.deepEqual(presentation.getPunchLayout({ punchEffectRadius: 0 }), {
    visible: false,
  });
  assert.deepEqual(presentation.getScoreDigits(15), {
    units: 5,
    tens: 1,
    tensVisible: true,
  });
});

test('shared presentation math preserves intro and menu animation boundaries', () => {
  assert.equal(presentation.stepIntroMarkAlpha(0, 1), 0);
  assert.equal(presentation.stepIntroMarkAlpha(1, 0), 0.04);
  assert.equal(presentation.stepIntroMarkAlpha(100, 1), 0.96);

  assert.deepEqual(presentation.getFightLayout(30, 160, 160), {
    visible: true,
    x: 20,
    y: -10,
    width: 160,
    height: 160,
  });

  assert.deepEqual(
    presentation.stepSittingTiles(31, 46, 0, 48),
    {
      visible: true,
      displacement: 0,
      x: -0,
      y: -0,
      alpha: 0.04,
    }
  );

  assert.deepEqual(
    presentation.getPikachuVolleyballLayout(45, 276),
    {
      visible: true,
      x: 140,
      width: 185,
    }
  );
});

test('shared presentation math preserves with-who growth, start/end and fade formulas', () => {
  assert.deepEqual(
    presentation.getWithWhoLayouts(71, 0, 2, 120, 20),
    {
      sizeIncrement: 3,
      layouts: [
        {
          visible: true,
          x: 151,
          y: 181,
          width: 130,
          height: 26,
        },
        {
          visible: true,
          x: 156,
          y: 214,
          width: 120,
          height: 20,
        },
      ],
    }
  );

  assert.deepEqual(presentation.getGameStartLayout(25, 71, 96, 24), {
    visible: true,
    x: 168,
    y: 74,
    width: 96,
    height: 24,
  });
  assert.deepEqual(presentation.getGameStartLayout(70, 71, 96, 24), {
    visible: false,
  });

  assert.deepEqual(presentation.getGameEndLayout(0, 96, 24), {
    visible: true,
    x: -24,
    y: 2,
    width: 480,
    height: 120,
  });
  assert.deepEqual(presentation.getGameEndLayout(50, 96, 24), {
    visible: true,
    x: 168,
    y: 50,
    width: 96,
    height: 24,
  });

  assert.equal(presentation.changeFadeAlpha(0.5, 1 / 16), 0.5625);
  assert.equal(presentation.changeFadeAlpha(0.02, -1 / 16), 0);
});
