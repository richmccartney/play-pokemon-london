// Scheduled Netlify Function: runs nightly (see netlify.toml) to pull the
// latest events from pokedata.ovh and persist them to Netlify Blobs.
//
// Can also be triggered manually (see README) for testing/backfills.

import { fetchAllEvents } from "../../src/lib/pokedata.js";
import { upsertEvents } from "../../src/lib/store.js";

export default async (req) => {
  try {
    const events = await fetchAllEvents();
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
