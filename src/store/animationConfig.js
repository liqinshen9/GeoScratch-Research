export const ANIMATION_EASINGS = Object.freeze({
  LINEAR: 'linear',
  EASE_IN: 'ease-in',
  EASE_OUT: 'ease-out',
  EASE_IN_OUT: 'ease-in-out',
})

export const EASING_FNS = Object.freeze({
  [ANIMATION_EASINGS.LINEAR]: (t) => t,
  [ANIMATION_EASINGS.EASE_IN]: (t) => t * t * t,
  [ANIMATION_EASINGS.EASE_OUT]: (t) => 1 - Math.pow(1 - t, 3),
  [ANIMATION_EASINGS.EASE_IN_OUT]: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
})

export function getEasingFn(name) {
  return EASING_FNS[name] || EASING_FNS[ANIMATION_EASINGS.EASE_IN_OUT]
}
