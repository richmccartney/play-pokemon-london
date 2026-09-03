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
  "FP",
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

// Legal-entity suffixes that carry no meaning for identifying a venue.
// pokedata.ovh mixes these in inconsistently ("BAD MOON CAFE" vs "BAD MOON
// CAFE LTD."), which would otherwise split one venue into two.
const LEGAL_SUFFIXES = /\b(LTD|LIMITED|LLP|PLC|CIC|INC|CO|COMPANY)\b\.?/g;
// Stateless counterpart for one-off tests (a /g regex's lastIndex makes
// .test() stateful across calls).
const HAS_LEGAL_SUFFIX = new RegExp(LEGAL_SUFFIXES.source, "i");

/**
 * Build the *identity* key for a venue name: like normaliseKey, but also
 * strips legal-entity suffixes so "Bad Moon Cafe" and "Bad Moon Cafe Ltd."
 * resolve to the same venue.
 */
export function venueNameKey(str) {
  const key = normaliseKey((str || "").toUpperCase().replace(LEGAL_SUFFIXES, " "));
  return VENUE_ALIASES[key] ?? key;
}

// Manual aliases for venues the source files under two unrelated names.
//
// These can't be inferred: the names share no words, and the sites are close
// enough that a pure distance rule would also merge genuinely different
// venues (The Ludoquist and FP Croydon are 252m apart, less than the 293m
// between The Movie Shack's two listings).
//
// `preferAddressFrom` names the variant whose address/coordinates are the
// real venue. The Movie Shack's registered address on Mayplace Rd is a former
// shop unit; all their events - locals, league nights and Challenges - run at
// Bexleyheath Library, so events must point people at the library.
const VENUE_ALIASES = {
  THEMOVIESHACK: "BEXLEYHEATHLIBRARY",
};

// Which variant's address wins, keyed by the resolved (aliased) name key.
const PREFERRED_ADDRESS_SOURCE = {
  BEXLEYHEATHLIBRARY: "BEXLEYHEATHLIBRARY",
};

// Display name to use for an aliased group, keyed by resolved name key.
// Without this the group would be named after whichever variant is most
// common, and the shop name is what people recognise.
const PREFERRED_DISPLAY_NAME = {
  BEXLEYHEATHLIBRARY: "The Movie Shack",
  RETROGIANTMIGHTYMEEPLES: "Mighty Meeples",
};

// Venue names that must never be folded into a shorter name they happen to
// extend. The prefix rule below is what lets "Bad Moon Cafe" absorb "Bad Moon
// Cafe Holloway Road", but it misfires when a shop lends its name to a
// separate venue nearby: Mighty Meeples is a games club at the rear of the
// Golden Lion pub (RM1 1HR), ~130m from the Retro Giant shop itself (RM1
// 3ED), so both the name and the distance test say "same place" when they are
// not. Events at each need their own address and map pin.
const DISTINCT_VENUES = new Set(["RETROGIANTMIGHTYMEEPLES"]);

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
      // Small joining words (not first word). Compared on the bare letters so
      // that punctuation doesn't hide them, e.g. "of)" in "(back of)".
      if (index !== 0 && LOWER_WORDS.has(bare.toLowerCase())) {
        return word.toLowerCase();
      }
      // Capitalise the first *letter* rather than the first character, so a
      // leading bracket doesn't swallow the capital ("(back" -> "(Back").
      // Any letter after an apostrophe stays lowercase ("john's" -> "John's",
      // not "John'S").
      return word.replace(/[a-z]/, (c) => c.toUpperCase());
    })
    .join("");
}

/**
 * Round a coordinate to ~111m precision (3 decimal places). Used only as a
 * coarse bucket key; actual venue matching uses `withinVenueRadius` below,
 * because rounding alone splits venues whose GPS jitter straddles a boundary
 * (e.g. 51.7705 and 51.7708 round to different values but are 33m apart).
 */
function roundCoord(n) {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(3) : "?";
}

// Two sightings within this distance are treated as the same physical venue.
// Comfortably absorbs geocoding jitter (the same shop returned with slightly
// different coordinates) while staying far below the separation between
// genuinely different branches (the two Bad Moon Cafes are ~6km apart).
//
// It deliberately stays under the closest pair of *genuinely different*
// venues in the data (The Ludoquist and FP Croydon, 252m apart).
const VENUE_MATCH_METRES = 200;

// Explicitly aliased venues are known to be the same place, so they're
// allowed a wider radius: a shop's registered address can sit a few streets
// from where it actually runs events (The Movie Shack's listed address is
// 293m from Bexleyheath Library, where its events are held).
const ALIASED_MATCH_METRES = 1000;

/** Approximate distance in metres between two lat/lng pairs. */
function metresBetween(aLat, aLng, bLat, bLng) {
  const latMetres = (aLat - bLat) * 111_320;
  const lngMetres =
    (aLng - bLng) * 111_320 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.hypot(latMetres, lngMetres);
}

function withinVenueRadius(entry, lat, lng, limit = VENUE_MATCH_METRES) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lng)) return false;
  return metresBetween(entry.lat, entry.lng, lat, lng) <= limit;
}

/**
 * Resolve a raw (shop, address, city, state, latitude, longitude) tuple to a
 * canonical venue, updating the mutable `registry` in place so repeated
 * sightings of the *same physical venue* converge on one name/address over
 * time (the most-frequently-seen raw form wins).
 *
 * Venues are grouped by name AND location together, not name alone — two
 * different branches of a chain that happen to share a name (e.g. two
 * "Bad Moon Cafe" locations) must never be merged into one venue, or one
 * branch's events would end up displaying the other branch's address/map
 * pin.
 *
 * @param {{shop:string,address:string,city:string,state:string,latitude?:number,longitude?:number}} raw
 * @param {object} registry - mutable venue registry (see store.js), shape:
 *   { [normalisedKey]: { canonicalName, canonicalAddress, variants: { [rawShop+"|"+rawAddress]: count } } }
 * @returns {{name:string,address:string}}
 */
export function resolveVenue(raw, registry) {
  const lat = Number(raw.latitude);
  const lng = Number(raw.longitude);
  const nameKey = venueNameKey(raw.shop);

  // Backfill entries written before venues carried explicit coordinates:
  // their key encodes the rounded lat/lng, so recover it rather than letting
  // the entry become permanently unmatchable (which would fork the venue).
  for (const [k, entry] of Object.entries(registry)) {
    if (Number.isFinite(entry.lat) && Number.isFinite(entry.lng)) continue;
    const match = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(k);
    if (!match) continue;
    entry.lat = Number(match[1]);
    entry.lng = Number(match[2]);
    entry.nameKey = entry.nameKey ?? venueNameKey(k.slice(0, k.lastIndexOf("@")));
  }

  // Match against an existing venue when the name is the same (or one is an
  // extension of the other, e.g. "BAD MOON CAFE" vs "BAD MOON CAFE HOLLOWAY
  // ROAD") *and* the location is within VENUE_MATCH_METRES.
  //
  // The distance check is what makes the prefix rule safe: two genuinely
  // different branches that share a name sit far apart (the two Bad Moon
  // Cafes are ~6km apart) and so keep their own entries, while the same shop
  // reported with jittery coordinates converges on one.
  // Aliased venues (see VENUE_ALIASES) are known to be the same place under
  // two unrelated names, so they get a wider matching radius.
  const isAliased =
    VENUE_ALIASES[normaliseKey(raw.shop)] !== undefined ||
    Object.values(VENUE_ALIASES).includes(nameKey);
  const radius = isAliased ? ALIASED_MATCH_METRES : VENUE_MATCH_METRES;

  const key =
    Object.keys(registry).find((k) => {
      const existing = registry[k];
      if (!existing.nameKey) return false;
      if (!withinVenueRadius(existing, lat, lng, radius)) return false;
      if (existing.nameKey === nameKey) return true;
      // Only the exact-name test applies to venues we have marked distinct;
      // the prefix rule would wrongly swallow them into their namesake.
      if (DISTINCT_VENUES.has(nameKey) || DISTINCT_VENUES.has(existing.nameKey))
        return false;
      return (
        existing.nameKey.startsWith(nameKey) ||
        nameKey.startsWith(existing.nameKey)
      );
    }) ?? `${nameKey}@${roundCoord(lat)},${roundCoord(lng)}`;

  const variantKey = `${raw.shop}|${raw.address}`;

  let entry = registry[key];
  if (!entry) {
    entry = { canonicalName: null, canonicalAddress: null, variants: {} };
    registry[key] = entry;
  }
  // Anchor the venue on the first coordinates seen so the match radius is
  // measured from a stable point rather than drifting with each sighting.
  if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lng)) {
    entry.lat = lat;
    entry.lng = lng;
  }
  // Keep the shortest name seen as the venue's identity, so a longer
  // branch-suffixed variant doesn't stop a later plain sighting matching.
  entry.nameKey =
    entry.nameKey && entry.nameKey.length < nameKey.length
      ? entry.nameKey
      : nameKey;

  entry.variants[variantKey] = (entry.variants[variantKey] || 0) + 1;

  // Pick the most-frequently-seen raw (shop, address) pair as canonical.
  // Ties keep the existing canonical (stability) or fall back to the first
  // variant seen.
  //
  // Where an alias declares which variant holds the real address (see
  // PREFERRED_ADDRESS_SOURCE), that variant wins outright regardless of
  // frequency — otherwise the more numerous listing would point people at the
  // wrong place.
  const preferredSource = PREFERRED_ADDRESS_SOURCE[entry.nameKey];
  let bestVariantKey = null;
  let bestCount = -1;
  let preferredVariantKey = null;
  for (const [vKey, count] of Object.entries(entry.variants)) {
    if (count > bestCount) {
      bestCount = count;
      bestVariantKey = vKey;
    }
    if (
      preferredSource &&
      !preferredVariantKey &&
      normaliseKey(vKey.slice(0, vKey.indexOf("|"))) === preferredSource
    ) {
      preferredVariantKey = vKey;
    }
  }
  bestVariantKey = preferredVariantKey ?? bestVariantKey;

  const sepIndex = bestVariantKey.indexOf("|");
  const bestShop = bestVariantKey.slice(0, sepIndex);
  const bestAddress = bestVariantKey.slice(sepIndex + 1);

  entry.canonicalName =
    PREFERRED_DISPLAY_NAME[entry.nameKey] ?? titleCase(bestShop);
  entry.canonicalAddress = titleCase(bestAddress);
  entry.baseNameKey = entry.nameKey;

  // The venue's map pin must follow the preferred address too, so events
  // don't plot at the shop's registered address instead of the real venue.
  if (preferredSource && normaliseKey(raw.shop) === preferredSource) {
    entry.lat = lat;
    entry.lng = lng;
  }

  // Display names are resolved in a separate pass once every event has been
  // seen (see finaliseVenueNames): whether a venue needs disambiguating
  // depends on the other venues in the registry, which isn't fully known
  // while events are still streaming in.
  entry.displayName = entry.displayName ?? entry.canonicalName;

  return { key, name: entry.canonicalName, address: entry.canonicalAddress };
}

/**
 * Resolve final display names for every venue in the registry. Must run after
 * all events have been processed.
 *
 * Venues sharing a base name are different branches of the same shop (e.g.
 * two "Bad Moon Cafe" sites), so each gets a locality appended. They're also
 * given a *common* base name — the shortest canonical form seen across the
 * group — so one branch doesn't render as "Bad Moon Cafe Ltd. (Great Dover
 * St)" while its sibling is "Bad Moon Cafe Holloway Road (Holloway Rd)".
 *
 * @param {object} registry - mutable venue registry, updated in place
 */
export function finaliseVenueNames(registry) {
  const entries = Object.entries(registry).filter(([, e]) => e.baseNameKey);

  // Group venues that are branches of the same shop. An exact key match isn't
  // enough: one branch is often filed under the bare shop name while another
  // carries a location suffix ("BADGERBADGER" in Deptford vs
  // "BADGERBADGERWESTNORWOOD"), which would otherwise leave both looking like
  // standalone venues and neither getting disambiguated.
  //
  // Venues are grouped under the shortest name that the others extend, so the
  // group is keyed on the shared root rather than whichever was seen first.
  const roots = entries
    .map(([, e]) => e.baseNameKey)
    .sort((a, b) => a.length - b.length);

  const groups = new Map();
  for (const [key, entry] of entries) {
    // Venues marked distinct are not branches of their namesake, so they must
    // not be pulled into its group and given a "(locality)" branch label.
    const root = DISTINCT_VENUES.has(entry.baseNameKey)
      ? entry.baseNameKey
      : roots.find(
          (r) => !DISTINCT_VENUES.has(r) && entry.baseNameKey.startsWith(r)
        ) ?? entry.baseNameKey;
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push([key, entry]);
  }

  for (const members of groups.values()) {
    if (members.length === 1) {
      const [, entry] = members[0];
      entry.displayName =
        PREFERRED_DISPLAY_NAME[entry.baseNameKey] ?? entry.canonicalName;
      continue;
    }

    // Build the shared base name by stripping legal suffixes and any branch
    // label that's already embedded in one variant's name ("Bad Moon Cafe
    // Holloway Road" -> "Bad Moon Cafe"), so siblings render consistently
    // before their locality is appended.
    const cleaned = members
      .map(([, e]) => cleanBaseName(e.canonicalName))
      .filter(Boolean)
      .sort((a, b) => a.length - b.length);
    const sharedName = cleaned[0];

    for (const [, entry] of members) {
      entry.displayName = disambiguatedName(
        sharedName ?? entry.canonicalName,
        entry.canonicalAddress
      );
    }
  }
}

/**
 * Strip trailing legal-entity suffixes from a display name, e.g.
 * "Bad Moon Cafe LTD." -> "Bad Moon Cafe".
 */
function cleanBaseName(name) {
  if (!name) return name;
  return name
    .replace(new RegExp(`\\s*${HAS_LEGAL_SUFFIX.source}\\s*$`, "i"), "")
    .trim();
}

/**
 * Build a disambiguated display name for two branches that share a name, e.g.
 * "Bad Moon Cafe (Holloway Road)".
 *
 * Addresses look like "Arch 5, 303 Holloway Rd, London N7 8HS, UK", so the
 * first comma-fragment is often a unit/arch number ("Arch 5", "Unit 8") which
 * tells a human nothing about *where* the venue is. Prefer the first fragment
 * that reads like a street or locality, and fall back to the postcode district
 * so we always produce something meaningful.
 */
function disambiguatedName(name, address) {
  const fragments = (address || "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  // Unit/floor/arch designators carry no locational meaning on their own.
  const isUnitFragment = (f) =>
    /^(unit|arch|suite|shop|floor|flat|no\.?|building|block)\b/i.test(f) ||
    /^\d+[a-z]?$/i.test(f);
  // Country codes and generic region names aren't distinguishing either.
  const isGeneric = (f) => /^(uk|gb|england|scotland|wales|london)$/i.test(f);

  const candidate = fragments.find(
    (f) => !isUnitFragment(f) && !isGeneric(f) && /[a-z]/i.test(f)
  );

  let label = candidate;
  if (label) {
    // Trim a trailing postcode/city off e.g. "303 Holloway Rd" style
    // fragments, and drop a leading street number: "303 Holloway Rd" reads
    // better as "Holloway Rd".
    label = label.replace(/^\d+[a-z]?\s+/i, "").trim();
  }

  if (!label) {
    // Last resort: the outward postcode ("N7 8HS" -> "N7").
    const postcode = (address || "").match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/i);
    label = postcode ? postcode[1].toUpperCase() : null;
  }

  if (!label) return name;
  // Avoid double-appending if the name already says it.
  if (normaliseKey(name).includes(normaliseKey(label))) return name;
  return `${name} (${label})`;
}
