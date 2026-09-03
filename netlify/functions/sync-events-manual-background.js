// Manually-triggerable version of the sync, protected by a shared secret so
// it can't be abused/spammed by the public. Useful for testing changes or
// forcing a refresh without waiting for the nightly schedule.
//
// Named "-background" so Netlify runs it as a background function: verifying
// ~20 store sites takes far longer than the 30s a synchronous function is
// allowed, and being killed mid-run meant the stale pokedata times were
// written unverified. Background functions get up to 15 minutes, and return
// 202 immediately rather than the result.
//
// Trigger with:
//   curl -X POST https://<site>/.netlify/functions/sync-events-manual-background \
//     -H "x-write-key: $SYNC_WRITE_KEY"

import { fetchAllEvents } from "../../src/lib/pokedata.js";
import { verifyAgainstStoreSites } from "../../src/lib/store-sites.js";
import {
  upsertEvents,
  getVenueRegistry,
  saveVenueRegistry,
} from "../../src/lib/store.js";

export default async (req) => {
  const providedKey = req.headers.get("x-write-key");
  const expectedKey = process.env.SYNC_WRITE_KEY;

  if (!expectedKey || providedKey !== expectedKey) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const venueRegistry = await getVenueRegistry();
    const scraped = await fetchAllEvents({ venueRegistry });
    await saveVenueRegistry(venueRegistry);

    // Must mirror the nightly sync: pokedata's times are frequently stale, so
    // where a store publishes its own schedule we let the store win.
    const { events, corrections } = await verifyAgainstStoreSites(scraped);

    const merged = await upsertEvents(events);
    console.log(
      `sync-events-manual: fetched ${events.length}, corrected ${corrections.length}, stored ${Object.keys(merged).length}`
    );
    return new Response(
      JSON.stringify({
        ok: true,
        fetched: events.length,
        corrected: corrections.length,
        stored: Object.keys(merged).length,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-events-manual failed:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
