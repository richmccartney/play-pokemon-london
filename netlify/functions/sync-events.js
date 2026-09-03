// Scheduled Netlify Function: runs nightly (see netlify.toml) to pull the
// latest events from pokedata.ovh and persist them to Netlify Blobs.
//
// Can also be triggered manually (see README) for testing/backfills.

import { fetchAllEvents } from "../../src/lib/pokedata.js";
import { verifyAgainstStoreSites } from "../../src/lib/store-sites.js";
import {
  upsertEvents,
  getVenueRegistry,
  saveVenueRegistry,
} from "../../src/lib/store.js";

export default async (req) => {
  try {
    const venueRegistry = await getVenueRegistry();
    const scraped = await fetchAllEvents({ venueRegistry });
    await saveVenueRegistry(venueRegistry);

    // pokedata mis-attributes times at venues that run several games a week
    // (their Dark Sphere entries carried the MTG slot), so where a store
    // publishes its own schedule we let the store win.
    const { events, corrections } = await verifyAgainstStoreSites(scraped);
    for (const c of corrections) {
      console.log(
        `sync-events: corrected ${c.shop} on ${c.date} ${c.from} -> ${c.to}` +
          ` (${c.exact ? "exact date" : "weekly pattern"})`
      );
    }

    const merged = await upsertEvents(events);

    console.log(
      `sync-events: fetched ${events.length} events, ${
        Object.keys(merged).length
      } total stored`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        fetched: events.length,
        stored: Object.keys(merged).length,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-events failed:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

// Nightly at 02:00 UTC. See netlify.toml for the canonical schedule config
// (this export is the recommended way per Netlify's Scheduled Functions
// docs for the JS/TS runtime, but netlify.toml is authoritative).
export const config = {
  schedule: "0 2 * * *",
};
