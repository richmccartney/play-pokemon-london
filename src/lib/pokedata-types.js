// Authoritative event-type lookup from pokedata.ovh's newer /events2/ API.
//
// The legacy league-finder endpoint we use as our primary source (see
// pokedata.js) collapses Prereleases, Friendlies and plain League Locals into
// a single "nonpremier TCG" bucket, leaving us to guess the real type from the
// organiser-provided event name.
//
// The /events2/ frontend calls a cleaner JSON endpoint that exposes an
// explicit `type` per event ("cups" / "challenges" / ...). It only carries
// *premier* events - Cups and Challenges, roughly 9% of our calendar, with
// zero Prereleases/Friendlies/Play Sessions published at the time of writing -
// so it can't replace our primary source. But for the events it does cover it
// replaces a keyword guess with the real classification, and it shares the
// same guids, so it joins cleanly.
//
// This is strictly a best-effort enrichment: any failure here leaves the
// primary pipeline untouched.

const API_URL = "https://pokedata.ovh/events2/events.php";

// All type filters the /events2/ UI offers, so we pick up Prereleases and
// Friendlies automatically if they ever start being populated.
const TCG_TYPES = "cups,challenges,prerelease,friendly";

// /events2/ type codes -> our internal labels (must match TYPE_LABELS /
// NAME_TYPE_HINTS in pokedata.js so the two sources stay consistent).
const TYPE_LABELS = {
  cups: "League Cup",
  challenges: "League Challenge",
  prerelease: "Pre-release",
  friendly: "Friendly Tournament",
};

/**
 * Fetch the authoritative type for every event /events2/ knows about near a
 * search point.
 * @param {{lat:number,lng:number,radius:number,unit?:string}} point
 * @returns {Promise<Array<object>>}
 */
async function fetchTypesForPoint(point) {
  const params = new URLSearchParams({
    includePast: "false",
    spatialMode: "radius",
    lat: String(point.lat),
    lng: String(point.lng),
    radius: String(point.radius),
    unit: point.unit ?? "km",
    tcgTypes: TCG_TYPES,
    // TCG-focused calendar: no Video Game or Pokémon GO events.
    vgTypes: "",
    goTypes: "",
  });

  const res = await fetch(`${API_URL}?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "pokemon-events-calendar/1.0 (+https://github.com/)",
    },
  });

  if (!res.ok) {
    throw new Error(
      `pokedata.ovh /events2/ request failed: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Build a lookup of authoritative type labels, keyed by both the event guid
 * and its official Play! Pokémon tournament id (the latter is a fallback in
 * case guids ever stop lining up between the two endpoints).
 *
 * Never throws: on any failure it returns an empty map and the caller falls
 * back to the existing name-sniffing behaviour.
 *
 * @param {Array<{lat:number,lng:number,radius:number,unit?:string}>} points
 * @returns {Promise<Map<string,string>>}
 */
export async function fetchAuthoritativeTypes(points) {
  const byKey = new Map();

  for (const point of points) {
    let rows;
    try {
      rows = await fetchTypesForPoint(point);
    } catch (error) {
      // Best-effort only - log and carry on with the other search points.
      console.warn(
        `[pokedata-types] skipping "${point.label}": ${error.message}`
      );
      continue;
    }

    for (const row of rows) {
      // Guard against Video Game / GO rows sneaking in.
      if (row.game && row.game !== "tcg") continue;

      const label = TYPE_LABELS[row.type];
      if (!label) continue;

      if (row.id) byKey.set(row.id, label);
      if (row.pokemon_url) byKey.set(row.pokemon_url, label);
    }
  }

  return byKey;
}

/**
 * Look up the authoritative label for a raw legacy-API event, if we have one.
 * @param {object} raw - raw event record from the legacy endpoint
 * @param {Map<string,string>} [types] - map from fetchAuthoritativeTypes
 * @returns {string|undefined}
 */
export function authoritativeTypeFor(raw, types) {
  if (!types || types.size === 0) return undefined;
  return types.get(raw.guid) ?? (raw.pokemon_url ? types.get(raw.pokemon_url) : undefined);
}
