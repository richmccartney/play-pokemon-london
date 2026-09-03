// JSON API for the React calendar frontend.
//
// Exposed at /.netlify/functions/events and redirected to /api/events (see
// netlify.toml) so the frontend can just fetch("/api/events").

import { getUpcomingEvents } from "../../src/lib/store.js";

export default async (req) => {
  try {
    const events = await getUpcomingEvents();

    // Send only the fields the frontend actually needs (skip the bulky
    // `raw` API payload we keep around for debugging).
    const payload = events.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      typeLabel: e.typeLabel,
      shop: e.shop,
      venueKey: e.venueKey,
      city: e.city,
      state: e.state,
      countryCode: e.countryCode,
      address: e.address,
      latitude: e.latitude,
      longitude: e.longitude,
      startsAt: e.startsAt,
      distanceKm: e.distanceKm,
      pokemonUrl: e.pokemonUrl,
      // Drives the "verified" badge and the "check with the store" warning.
      confidence: e.confidence,
    }));

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=1800",
        "access-control-allow-origin": "*",
      },
    });
  } catch (err) {
    console.error("events function failed:", err);
    return new Response(JSON.stringify({ error: "Failed to load events" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
};
