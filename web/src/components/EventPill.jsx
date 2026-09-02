import { formatTimeLabel, parseLocal } from "../lib/date";
import { venueColorIndex } from "../lib/eventColor";
import "./EventPill.css";

export default function EventPill({ event, onSelect, variant = "month" }) {
  const time = formatTimeLabel(parseLocal(event.startsAt));
  const colorIndex = venueColorIndex(event.shop);
  return (
    <button
      type="button"
      className={`event-pill event-pill--${variant} event-pill--c${colorIndex}${
        event.cancelled ? " event-pill--cancelled" : ""
      }`}
      onClick={() => onSelect(event)}
    >
      <span className="event-pill__time">{time}</span>
      <span className="event-pill__name">{event.name}</span>
    </button>
  );
}
