// Builds an iCalendar (.ics) feed from stored events using the `ics` npm
// package. Keeping this separate from the fetch/store logic makes it easy
// to unit test and to reuse from both the scheduled sync and the on-demand
// calendar function (in case we ever want to build the feed lazily).

import { createEvents } from "ics";
import { DateTime } from "luxon";

const CALENDAR_NAME = "Pokémon TCG League Events";
const PRODID = "-//pokemon-events-calendar//EN";
const SOURCE_TIMEZONE = "Europe/London";

/**
 * @param {import('./pokedata.js').normaliseEvent extends (...args: any) => infer R ? R : never} event
 */
function toIcsEvent(event) {
  // pokedata gives wall-clock local (UK) time with no offset. The `ics`
  // package has no per-event VTIMEZONE support, so we convert to true UTC
  // ourselves (DST-aware) and emit UTC times — every calendar client then
  // renders it correctly in the subscriber's own local timezone.
  const local = DateTime.fromISO(event.startsAt, { zone: SOURCE_TIMEZONE });
  const utc = local.toUTC();

  const locationParts = [event.shop, event.address, event.city, event.state]
    .filter(Boolean)
    .join(", ");

  // We can only pull limited fields from pokedata.ovh (name, venue, time,
  // address). The official pokemon.com tournament page has richer details
  // (admission cost, organizer contact, registration links) but is behind
  // bot protection we can't scrape server-side — so instead we link out to
  // it prominently and tell subscribers what they'll find there.
  const descriptionLines = [
    event.typeLabel ? `Type: ${event.typeLabel}` : null,
    event.pokemonUrl
      ? `\nFull details (admission cost, organizer contact, registration link): ${event.pokemonUrl}`
      : null,
  ].filter(Boolean);

  return {
    uid: `pokedata-${event.id}@pokemon-events-calendar`,
    title: event.name || event.shop,
    description: descriptionLines.join("\n"),
    location: locationParts,
    url: event.pokemonUrl ?? undefined,
    start: [utc.year, utc.month, utc.day, utc.hour, utc.minute],
    duration: { hours: 3 }, // pokedata doesn't give an end time; assume 3h.
    startInputType: "utc",
    startOutputType: "utc",
    productId: PRODID,
    calName: CALENDAR_NAME,
    geo:
      Number.isFinite(event.latitude) && Number.isFinite(event.longitude)
        ? { lat: event.latitude, lon: event.longitude }
        : undefined,
    categories: event.typeLabel ? [event.typeLabel] : undefined,
    status: event.cancelled ? "CANCELLED" : "CONFIRMED",
  };
}

/**
 * @param {Array<ReturnType<typeof import('./pokedata.js').normaliseEvent>>} events
 * @returns {string} full .ics file contents
 */
export function buildCalendar(events) {
  const icsEvents = events.map(toIcsEvent);
  const { error, value } = createEvents(icsEvents);
  if (error) {
    throw error;
  }
  return value;
}
