// Deterministic colour coding per venue so the same shop always gets the
// same colour across renders, views, and sessions. Uses a small curated
// palette of accessible hues (works with both the light and dark themes via
// the `--pill-hue` custom property consumed in EventPill.css) rather than
// fully random colours, so the calendar stays visually calm rather than
// looking like confetti.
const PALETTE_SIZE = 24;

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Returns a stable hue index (0-23) for a given venue/shop name.
 */
export function venueColorIndex(shop) {
  if (!shop) return 0;
  return hashString(shop) % PALETTE_SIZE;
}
