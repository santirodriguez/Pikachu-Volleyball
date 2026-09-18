'use strict';

const FIGHT_SIZE_SEQUENCE = Object.freeze([
  20,
  22,
  25,
  27,
  30,
  27,
  25,
  22,
  20,
]);

function getPlayerFrameIndex(state, frameNumber) {
  if (state < 4) return 5 * state + frameNumber;
  if (state === 4) return 17 + frameNumber;
  return 18 + 5 * (state - 5) + frameNumber;
}

function getPlayerScaleX(playerNumber, state, divingDirection) {
  if (playerNumber === 1) {
    if (state === 3 || state === 4) {
      return divingDirection === -1 ? -1 : 1;
    }
    return 1;
  }

  if (state === 3 || state === 4) {
    return divingDirection === 1 ? 1 : -1;
  }
  return -1;
}

function getPunchLayout(ball) {
  if (!ball || ball.punchEffectRadius <= 0) {
    return { visible: false };
  }

  const radius = Math.max(0, ball.punchEffectRadius - 2);
  return {
    visible: true,
    x: ball.punchEffectX,
    y: ball.punchEffectY,
    width: 2 * radius,
    height: 2 * radius,
  };
}

function stepIntroMarkAlpha(frameCounter, currentAlpha) {
  if (frameCounter === 0) return 0;
  if (frameCounter < 100) return Math.min(1, currentAlpha + 1 / 25);
  return Math.max(0, currentAlpha - 1 / 25);
}

function getFightLayout(frameCounter, width, height) {
  let halfWidth;
  let halfHeight;

  if (frameCounter < 30) {
    halfWidth = Math.floor(Math.floor((frameCounter * width) / 30) / 2);
    halfHeight = Math.floor(Math.floor((frameCounter * height) / 30) / 2);
  } else {
    const size = FIGHT_SIZE_SEQUENCE[(frameCounter + 1) % 9];
    halfWidth = Math.floor(Math.floor((size * width) / 30) / 2);
    halfHeight = Math.floor(Math.floor((size * height) / 30) / 2);
  }

  return {
    visible: true,
    x: 100 - halfWidth,
    y: 70 - halfHeight,
    width: halfWidth * 2,
    height: halfHeight * 2,
  };
}

function stepSachisoft(frameCounter, currentAlpha) {
  const baseAlpha = frameCounter === 0 ? 0 : currentAlpha;
  return {
    visible: true,
    alpha: frameCounter > 70 ? 1 : Math.min(1, baseAlpha + 0.04),
  };
}

function stepSittingTiles(frameCounter, displacement, alpha, tileHeight) {
  const nextDisplacement = (displacement + 2) % tileHeight;
  let nextAlpha = frameCounter === 0 ? 0 : alpha;

  if (frameCounter > 30) {
    nextAlpha = Math.min(1, nextAlpha + 0.04);
  }
  if (frameCounter > 70) {
    nextAlpha = 1;
  }

  return {
    visible: true,
    displacement: nextDisplacement,
    x: -nextDisplacement,
    y: -nextDisplacement,
    alpha: nextAlpha,
  };
}

function getPikachuVolleyballLayout(frameCounter, textureWidth) {
  const layout = {
    visible: frameCounter > 30,
    x: 140,
    width: textureWidth,
  };

  if (frameCounter > 30 && frameCounter <= 44) {
    layout.x = 140 + 195 - 15 * (frameCounter - 30);
  } else if (frameCounter > 44 && frameCounter <= 55) {
    layout.width = 200 - 15 * (frameCounter - 44);
  } else if (frameCounter > 55 && frameCounter <= 71) {
    layout.width = 40 + 15 * (frameCounter - 55);
  }

  return layout;
}

function getWithWhoLayouts(
  frameCounter,
  selectedWithWho,
  sizeIncrement,
  width,
  height
) {
  let nextIncrement = sizeIncrement;
  if (frameCounter > 70 && nextIncrement < 10) {
    nextIncrement += 1;
  }

  const layouts = [0, 1].map((index) => {
    if (frameCounter <= 70) {
      return { visible: false };
    }

    const selected = Number(selectedWithWho === index);
    const halfWidthIncrement = selected * (nextIncrement + 2);
    const halfHeightIncrement = selected * nextIncrement;

    return {
      visible: true,
      x: 216 - width / 2 - halfWidthIncrement,
      y: 184 + 30 * index - halfHeightIncrement,
      width: width + 2 * halfWidthIncrement,
      height: height + 2 * halfHeightIncrement,
    };
  });

  return {
    sizeIncrement: nextIncrement,
    layouts,
  };
}

function getScoreDigits(score) {
  return {
    units: score % 10,
    tens: Math.floor(score / 10) % 10,
    tensVisible: score >= 10,
  };
}

function getGameStartLayout(frameCounter, frameTotal, width, height) {
  if (frameCounter >= frameTotal - 1) {
    return { visible: false };
  }

  const halfWidth = Math.floor((width * frameCounter) / 50);
  const halfHeight = Math.floor((height * frameCounter) / 50);
  return {
    visible: true,
    x: 216 - halfWidth,
    y: 50 + 2 * halfHeight,
    width: 2 * halfWidth,
    height: 2 * halfHeight,
  };
}

function getGameEndLayout(frameCounter, width, height) {
  if (frameCounter < 50) {
    const halfWidthIncrement =
      2 * Math.floor(((50 - frameCounter) * width) / 50);
    const halfHeightIncrement =
      2 * Math.floor(((50 - frameCounter) * height) / 50);

    return {
      visible: true,
      x: 216 - width / 2 - halfWidthIncrement,
      y: 50 - halfHeightIncrement,
      width: width + 2 * halfWidthIncrement,
      height: height + 2 * halfHeightIncrement,
    };
  }

  return {
    visible: true,
    x: 216 - width / 2,
    y: 50,
    width,
    height,
  };
}

function changeFadeAlpha(currentAlpha, increment) {
  if (increment >= 0) {
    return Math.min(1, currentAlpha + increment);
  }
  return Math.max(0, currentAlpha + increment);
}

module.exports = {
  FIGHT_SIZE_SEQUENCE,
  getPlayerFrameIndex,
  getPlayerScaleX,
  getPunchLayout,
  stepIntroMarkAlpha,
  getFightLayout,
  stepSachisoft,
  stepSittingTiles,
  getPikachuVolleyballLayout,
  getWithWhoLayouts,
  getScoreDigits,
  getGameStartLayout,
  getGameEndLayout,
  changeFadeAlpha,
};
