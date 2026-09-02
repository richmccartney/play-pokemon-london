import { formatTimeLabel, parseLocal } from "../lib/date";
import { venueColorIndex } from "../lib/eventColor";
import { eventIcon } from "../lib/eventIcon";
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
  const icon = eventIcon(event.typeLabel);
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
        {detailed && icon && (
          <span className="event-pill__type">{icon.label}</span>
        )}
      </span>
      <span className="event-pill__name">
        {icon && (
          <span className="event-pill__icon" title={icon.label} aria-label={icon.label} role="img">
            {icon.icon}
          </span>
        )}
        {heading}
      </span>
      {showVenue && (
        <span className="event-pill__venue">
          <span aria-hidden="true">📍</span> {event.shop}
        </span>
      )}
    </button>
  );
}
