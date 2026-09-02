// Manually-triggerable version of the sync, protected by a shared secret so
// it can't be abused/spammed by the public. Useful for testing changes or
// forcing a refresh without waiting for the nightly schedule.
//
// Trigger with:
//   curl -X POST https://<site>/.netlify/functions/sync-events-manual \
//     -H "x-write-key: $SYNC_WRITE_KEY"

import { fetchAllEvents } from "../../src/lib/pokedata.js";
import { upsertEvents } from "../../src/lib/store.js";

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
    const events = await fetchAllEvents();
    const merged = await upsertEvents(events);
    return new Response(
      JSON.stringify({
        ok: true,
        fetched: events.length,
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
