export function resolvePhysicalPoint({ pageX, pageY, screenX, screenY, outerWidth, outerHeight, innerWidth, innerHeight }, bounds = null) {
  const chromeY = finiteNonNegative(outerHeight - innerHeight);
  const boundLeft = Number(bounds?.left);
  const boundTop = Number(bounds?.top);

  // Chromium's screenY can include window-manager decoration offsets under X11.
  // CDP window bounds describe the actual outer window position and are preferred.
  const outerLeft = Number.isFinite(boundLeft) ? boundLeft : Number(screenX) || 0;
  const outerTop = Number.isFinite(boundTop) ? boundTop : Number(screenY) || 0;

  return {
    x: Math.round(outerLeft + Number(pageX)),
    y: Math.round(outerTop + chromeY + Number(pageY)),
  };
}

function finiteNonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
