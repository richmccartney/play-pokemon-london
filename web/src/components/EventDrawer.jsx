import { useEffect, useRef } from "react";
import { formatFullDateLabel, formatTimeLabel, parseLocal } from "../lib/date";
import "./EventDrawer.css";

export default function EventDrawer({ event, onClose }) {
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);

  // Focus the close button on open, restore focus to the trigger on close,
  // and trap Escape/Tab within the drawer while it's open (WCAG 2.1 dialog
  // pattern) for keyboard and screen reader users.
  useEffect(() => {
    if (!event) return;
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();
    document.body.style.overflow = "hidden";

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [event, onClose]);

  if (!event) return null;

  const start = parseLocal(event.startsAt);
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${
    event.longitude - 0.01
  }%2C${event.latitude - 0.01}%2C${event.longitude + 0.01}%2C${
    event.latitude + 0.01
  }&layer=mapnik&marker=${event.latitude}%2C${event.longitude}`;
  const bigMapHref = `https://www.openstreetmap.org/?mlat=${event.latitude}&mlon=${event.longitude}#map=15/${event.latitude}/${event.longitude}`;

  return (
    <div className="event-drawer-overlay" onClick={onClose}>
      <div
        className="event-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-drawer-title"
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="event-drawer__header">
          <button
            type="button"
            className="event-drawer__close"
            onClick={onClose}
            ref={closeButtonRef}
            aria-label="Close event details"
          >
            <span aria-hidden="true">← Back</span>
          </button>
        </div>

        <div className="event-drawer__body">
          {event.cancelled && (
            <p className="event-drawer__cancelled-badge" role="status">
              Cancelled
            </p>
          )}
          <p className="event-drawer__type">{event.typeLabel}</p>
          <h2 id="event-drawer-title" className="event-drawer__title">
            {event.name}
          </h2>
          <dl className="event-drawer__facts">
            <div className="event-drawer__fact">
              <dt>Date</dt>
              <dd>{formatFullDateLabel(start)}</dd>
            </div>
            <div className="event-drawer__fact">
              <dt>Time</dt>
              <dd>{formatTimeLabel(start)}</dd>
            </div>
            <div className="event-drawer__fact">
              <dt>Venue</dt>
              <dd>{event.shop}</dd>
            </div>
            <div className="event-drawer__fact">
              <dt>Address</dt>
              <dd>{event.address}</dd>
            </div>
          </dl>

          <div className="event-drawer__map-wrap">
            <iframe
              title={`Map showing the location of ${event.shop}`}
              className="event-drawer__map"
              src={mapSrc}
              loading="lazy"
            />
            <a
              className="event-drawer__map-link"
              href={bigMapHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              View larger map ↗
            </a>
          </div>

          {event.pokemonUrl && (
            <a
              className="btn event-drawer__official-link"
              href={event.pokemonUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Official event page (admission, organizer contact, registration) ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
