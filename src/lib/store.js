// Persistent storage using Netlify Blobs. This avoids needing an external
// database (e.g. Supabase) for a dataset this small — Blobs give us a
// simple key/value JSON store that's automatically available inside
// Netlify Functions with zero extra configuration.

import { getStore } from "@netlify/blobs";

const STORE_NAME = "pokemon-events";
const EVENTS_KEY = "events.json";
const META_KEY = "meta.json";
const VENUES_KEY = "venues.json";

function store() {
  return getStore(STORE_NAME);
}

/**
 * Merge freshly-fetched events into whatever is already stored, so that
 * events which have scrolled out of the API's returned window (e.g. it only
 * returns the next ~90 days) aren't lost, while past events get pruned and
 * events no longer returned are marked cancelled.
 *
 * @param {Array} freshEvents - normalised events from this sync run
 */
export async function upsertEvents(freshEvents) {
  const s = store();
  const now = new Date().toISOString();

  const existing = (await s.get(EVENTS_KEY, { type: "json" })) ?? {};
  const freshIds = new Set(freshEvents.map((e) => e.id));

  const merged = { ...existing };

  // Add/update events seen in this run.
  for (const event of freshEvents) {
    const prior = merged[event.id];

    // Never let an unverified time overwrite one we previously confirmed
    // against the store's own website. If an adapter is briefly unreachable
    // (or the whole verification pass gets cut short) the fresh copy carries
    // pokedata's stale time, and blindly taking it would silently undo a
    // correction. The rest of the record still updates; only the time is
    // held back, and only until a run verifies that date again.
    const regressed =
      prior?.confidence === "verified" && event.confidence !== "verified";

    merged[event.id] = {
      ...event,
      ...(regressed
        ? {
            startsAt: prior.startsAt,
            time: prior.time,
            confidence: "verified",
            timeVerified: true,
          }
        : {}),
      firstSeenAt: prior?.firstSeenAt ?? now,
      lastSeenAt: now,
      cancelled: false,
    };
  }

  // Mark previously-known, still-future events as cancelled if they were
  // not present in this run (the source removed them).
  for (const [id, event] of Object.entries(merged)) {
    if (freshIds.has(id)) continue;
    const isFuture = new Date(event.startsAt) > new Date();
    if (isFuture && !event.cancelled) {
      merged[id] = { ...event, cancelled: true, lastSeenAt: event.lastSeenAt };
    }
  }

  // Prune events that finished more than 7 days ago to keep storage small.
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, event] of Object.entries(merged)) {
    if (new Date(event.startsAt).getTime() < cutoff) {
      delete merged[id];
    }
  }

  await s.setJSON(EVENTS_KEY, merged);
  await s.setJSON(META_KEY, {
    lastSyncAt: now,
    eventCount: Object.keys(merged).length,
    freshCount: freshEvents.length,
    // Surfaced so a truncated verification pass shows up as a visible drop
    // rather than silently serving stale times.
    verifiedCount: freshEvents.filter((e) => e.confidence === "verified")
      .length,
  });

  return merged;
}

/** @returns {Promise<Record<string, object>>} */
export async function getAllEvents() {
  const s = store();
  return (await s.get(EVENTS_KEY, { type: "json" })) ?? {};
}

/**
 * Returns future (or currently happening) events.
 *
 * Cancelled events are excluded by default, which is what the web UI wants -
 * there's no value in cluttering the calendar grid with events that aren't
 * happening.
 *
 * The .ics feed needs the opposite: quietly dropping a VEVENT does *not*
 * reliably remove it from an already-subscribed calendar, since many clients
 * keep the last-known copy. Publishing the event with STATUS:CANCELLED is what
 * actually tells a client to strike it through or remove it, so the feed
 * passes `includeCancelled: true` (see calendar.js).
 *
 * @param {object} [options]
 * @param {boolean} [options.includeCancelled=false]
 */
export async function getUpcomingEvents({ includeCancelled = false } = {}) {
  const all = await getAllEvents();
  const now = Date.now();
  return Object.values(all)
    .filter(
      (e) =>
        (includeCancelled || !e.cancelled) &&
        new Date(e.startsAt).getTime() >= now - 3 * 60 * 60 * 1000
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function getMeta() {
  const s = store();
  return (
    (await s.get(META_KEY, { type: "json" })) ?? {
      lastSyncAt: null,
      eventCount: 0,
      freshCount: 0,
    }
  );
}

/**
 * Get the persistent venue-name registry, used to converge on one
 * canonical (name, address) per venue across repeated sightings over time.
 * @returns {Promise<object>}
 */
export async function getVenueRegistry() {
  const s = store();
  return (await s.get(VENUES_KEY, { type: "json" })) ?? {};
}

/** Persist the (mutated) venue registry after a sync run. */
export async function saveVenueRegistry(registry) {
  const s = store();
  await s.setJSON(VENUES_KEY, registry);
}
