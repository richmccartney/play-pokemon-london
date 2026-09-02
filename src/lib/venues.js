// Venue data-quality layer.
//
// pokedata.ovh's raw shop/address strings are messy: ALL CAPS, inconsistent
// punctuation ("DO OR DICE ADDLESTONE" vs "DO OR DICE - ADDLESTONE"), and the
// same physical venue sometimes has two differently-formatted addresses
// across different event records. This module:
//
//   1. Title-cases names/addresses into something readable.
//   2. Groups near-duplicate venue names (ignoring case/punctuation/spacing)
//      into a single canonical venue, remembering every raw variant seen.
//   3. Persists that registry (via the store) so canonical names keep
//      improving over time as more data comes in across nightly syncs —
//      the more often a spelling is seen, the more likely it "wins" as
//      canonical, and once a venue's canonical form is set it stays stable.

// Words that should stay upper-case or have special casing when
// title-casing an all-caps venue/address string.
const KEEP_UPPER = new Set([
  "TCG",
  "LTD",
  "LTD.",
  "UK",
  "GB",
  "PLC",
  "CIC",
  "LLP",
  "P9",
]);

// Small words that stay lower-case in title case (unless first/last word).
const LOWER_WORDS = new Set([
  "and",
  "of",
  "the",
  "at",
  "in",
  "on",
  "&",
]);

/**
 * Normalise a key for grouping near-duplicate names: upper-case,
 * alphanumerics only (strips spacing/punctuation differences like
 * "DO OR DICE ADDLESTONE" vs "DO OR DICE - ADDLESTONE").
 */
export function normaliseKey(str) {
  return (str || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

/**
 * Title-case a raw ALL-CAPS (or mixed-case) string, preserving known
 * acronyms and postcodes, and keeping small joining words lower-case.
 */
export function titleCase(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(/(\s+|-)/) // keep separators so we can rejoin exactly
    .map((word, index) => {
      if (/^\s+$/.test(word) || word === "-") return word;
      const upper = word.toUpperCase();
      const bare = upper.replace(/[^A-Z0-9]/g, "");

      // Postcodes (UK format, e.g. "AL3", "6PQ", "N7", "KT15") - keep as-is.
      if (/^[A-Z]{1,2}\d[A-Z\d]?$/.test(bare) || /^\d[A-Z]{2}$/.test(bare)) {
        return upper;
      }
      // Known acronyms / abbreviations.
      if (KEEP_UPPER.has(bare)) return upper;
      // Small joining words (not first word).
      if (index !== 0 && LOWER_WORDS.has(word.toLowerCase())) {
        return word.toLowerCase();
      }
      // Handle words with apostrophes, e.g. "st john's".
      return word.replace(/(^|')([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
    })
    .join("");
}

/**
 * Resolve a raw (shop, address, city, state) tuple to a canonical venue,
 * updating the mutable `registry` in place so repeated venues converge on
 * one name/address over time (the most-frequently-seen raw form wins).
 *
 * @param {{shop:string,address:string,city:string,state:string}} raw
 * @param {object} registry - mutable venue registry (see store.js), shape:
 *   { [normalisedKey]: { canonicalName, canonicalAddress, variants: { [rawShop+"|"+rawAddress]: count } } }
 * @returns {{name:string,address:string}}
 */
export function resolveVenue(raw, registry) {
  const key = normaliseKey(raw.shop);
  const variantKey = `${raw.shop}|${raw.address}`;

  let entry = registry[key];
  if (!entry) {
    entry = { canonicalName: null, canonicalAddress: null, variants: {} };
    registry[key] = entry;
  }

  entry.variants[variantKey] = (entry.variants[variantKey] || 0) + 1;

  // Pick the most-frequently-seen raw (shop, address) pair as canonical.
  // Ties keep the existing canonical (stability) or fall back to the first
  // variant seen.
  let bestVariantKey = null;
  let bestCount = -1;
  for (const [vKey, count] of Object.entries(entry.variants)) {
    if (count > bestCount) {
      bestCount = count;
      bestVariantKey = vKey;
    }
  }
  const sepIndex = bestVariantKey.indexOf("|");
  const bestShop = bestVariantKey.slice(0, sepIndex);
  const bestAddress = bestVariantKey.slice(sepIndex + 1);

  entry.canonicalName = titleCase(bestShop);
  entry.canonicalAddress = titleCase(bestAddress);

  return { name: entry.canonicalName, address: entry.canonicalAddress };
}
