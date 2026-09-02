// Serves the public .ics calendar feed that people subscribe to.
//
// Exposed at /.netlify/functions/calendar and redirected to /calendar.ics
// (see netlify.toml) so subscribe URLs look like:
//   webcal://<site>/calendar.ics

import { getUpcomingEvents } from "../../src/lib/store.js";
import { buildCalendar } from "../../src/lib/calendar.js";

export default async (req) => {
  try {
    // Include cancelled events: they're published with STATUS:CANCELLED so
    // subscribers' calendar clients actually remove them. Omitting them
    // entirely would leave stale copies in already-synced calendars.
    const events = await getUpcomingEvents({ includeCancelled: true });
    const ics = buildCalendar(events);

    return new Response(ics, {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="pokemon-events.ics"',
        // Subscribed calendars are refreshed periodically by clients (often
        // hourly or on their own schedule); a short cache is fine since we
        // only regenerate the underlying data nightly anyway.
        "cache-control": "public, max-age=1800",
      },
    });
  } catch (err) {
    console.error("calendar function failed:", err);
    return new Response("Failed to generate calendar", { status: 500 });
  }
};
