/**
 * Haptic ticks for touch interactions (choosing a look, switching a tool, a slider snapping to
 * its default). Uses the Vibration API where it exists (Android browsers); a no-op elsewhere
 * (iOS Safari, desktop). Skipped when motion is reduced, by the OS or in the app's settings.
 */
/** True when motion is reduced by the OS (unless the app forces full motion) or by the app setting. */
export const motionReduced = () =>
  document.documentElement.dataset.motion === 'reduced' ||
  (document.documentElement.dataset.motion !== 'full' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const coarse = () => window.matchMedia?.('(pointer: coarse)').matches;

export function tick(ms = 8) {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator) || !coarse() || motionReduced()) return;
    navigator.vibrate(ms);
  } catch {
    // Some browsers throw when vibration isn't allowed yet (no user gesture); ignore.
  }
}
