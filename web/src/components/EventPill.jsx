import { formatTimeLabel, parseLocal } from "../lib/date";
import { venueColorIndex } from "../lib/eventColor";
import "./EventPill.css";

export default function EventPill({ event, onSelect, variant = "month" }) {
  const time = formatTimeLabel(parseLocal(event.startsAt));
  const colorIndex = venueColorIndex(event.shop);
  // Month cells only have room for a single line, so the richer venue and
  // type detail is reserved for the roomier week and day layouts.
  const detailed = variant !== "month";
  // Most locals have no organiser-supplied name, so their title is a
  // synthesised "<venue> - Pokémon TCG <type>" that would just repeat the
  // venue and type lines. In that case the venue is the headline instead.
  const heading = event.hasOrganiserName === false ? event.shop : event.name;
  const showVenue = detailed && event.shop && event.shop !== heading;
  return (
    <button
      type="button"
      className={`event-pill event-pill--${variant} event-pill--c${colorIndex}${
        event.cancelled ? " event-pill--cancelled" : ""
      }`}
      onClick={() => onSelect(event)}
    >
      <span className="event-pill__head">
        <span className="event-pill__time">{time}</span>
        {detailed && event.typeLabel && (
          <span className="event-pill__type">{event.typeLabel}</span>
        )}
      </span>
      <span className="event-pill__name">{heading}</span>
      {showVenue && (
        <span className="event-pill__venue">
          <span aria-hidden="true">📍</span> {event.shop}
        </span>
      )}
    </button>
  );
}
