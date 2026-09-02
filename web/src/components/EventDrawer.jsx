import { useCallback, useEffect, useRef, useState } from "react";
import { formatFullDateLabel, formatTimeLabel, parseLocal } from "../lib/date";
import { eventIcon } from "../lib/eventIcon";
import "./EventDrawer.css";

export default function EventDrawer({ event, allEvents = [], onSelectEvent, onClose }) {
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const touchStart = useRef(null);
  // Mirrored in a ref because touchend must read the latest offset
  // synchronously; a fast swipe can end before React commits the state.
  const dragXRef = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [dismissing, setDismissing] = useState(false);

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

  // The drawer enters from the right, so a rightward swipe dismisses it.
  // The panel tracks the finger and only closes past a distance or velocity
  // threshold; otherwise it springs back.
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, time: Date.now(), axis: null };
  }, []);

  const handleTouchMove = useCallback((e) => {
    const start = touchStart.current;
    if (!start) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;

    // Decide once whether this gesture is a horizontal swipe or a vertical
    // scroll, so scrolling the drawer content never drags the panel.
    if (start.axis === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (start.axis !== "x") return;

    const next = Math.max(0, dx);
    dragXRef.current = next;
    setDragX(next);
  }, []);

  const handleTouchEnd = useCallback(() => {
    const start = touchStart.current;
    touchStart.current = null;
    const travelled = dragXRef.current;
    if (!start || start.axis !== "x") {
      dragXRef.current = 0;
      setDragX(0);
      return;
    }
    const width = drawerRef.current?.offsetWidth || window.innerWidth;
    const elapsed = Date.now() - start.time;
    const velocity = travelled / Math.max(elapsed, 1);

    // A flick can dismiss on velocity alone, but still needs to cover enough
    // distance so an incidental nudge never closes the drawer.
    if (travelled > width * 0.35 || (velocity > 0.5 && travelled > 60)) {
      setDismissing(true);
      dragXRef.current = width;
      setDragX(width);
      window.setTimeout(onClose, 180);
    } else {
      dragXRef.current = 0;
      setDragX(0);
    }
  }, [onClose]);

  if (!event) return null;

  const start = parseLocal(event.startsAt);
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${
    event.longitude - 0.01
  }%2C${event.latitude - 0.01}%2C${event.longitude + 0.01}%2C${
    event.latitude + 0.01
  }&layer=mapnik&marker=${event.latitude}%2C${event.longitude}`;
  const bigMapHref = `https://www.openstreetmap.org/?mlat=${event.latitude}&mlon=${event.longitude}#map=15/${event.latitude}/${event.longitude}`;
  // City and region are often the same word ("London", "London") in the
  // source, so de-duplicate before showing them as one line.
  const area = [event.city, event.state].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
  // Locals have no organiser-supplied name, so their title is a synthesised
  // "<venue> - Pokémon TCG <type>" which would only repeat the type shown
  // above and the venue listed below. Lead with the venue instead.
  const heading = event.hasOrganiserName === false ? event.shop : event.name;

  const icon = eventIcon(event.typeLabel);

  // Other upcoming dates at the same venue, so someone who can't make this
  // one can find the next. Matched on venueKey rather than the display name
  // so a venue renamed by disambiguation still groups correctly.
  const alsoHere = allEvents
    .filter(
      (e) =>
        e.id !== event.id &&
        (event.venueKey ? e.venueKey === event.venueKey : e.shop === event.shop) &&
        parseLocal(e.startsAt) >= start
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 6);

  return (
    <div className="event-drawer-overlay" onClick={onClose}>
      <div
        className="event-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-drawer-title"
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={
          dragX
            ? {
                transform: `translateX(${dragX}px)`,
                transition: dismissing || dragX === 0 ? "transform 0.18s ease-out" : "none",
                animation: "none",
              }
            : undefined
        }
      >
        <div className="event-drawer__grabber" aria-hidden="true" />
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
            {icon && (
              <span className="event-drawer__icon" aria-label={icon.label} role="img">
                {icon.icon}
              </span>
            )}
            {heading}
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
            {event.shop !== heading && (
              <div className="event-drawer__fact">
                <dt>Venue</dt>
                <dd>{event.shop}</dd>
              </div>
            )}
            <div className="event-drawer__fact">
              <dt>Address</dt>
              <dd>{event.address}</dd>
            </div>
            {area && (
              <div className="event-drawer__fact">
                <dt>Area</dt>
                <dd>{area}</dd>
              </div>
            )}
            {Number.isFinite(event.distanceKm) && (
              <div className="event-drawer__fact">
                <dt>Distance</dt>
                <dd>{event.distanceKm} km from central London</dd>
              </div>
            )}
            <div className="event-drawer__fact">
              <dt>Listing</dt>
              <dd>
                {event.pokemonUrl
                  ? "Officially sanctioned Play! Pokémon event"
                  : "Regular league night — check with the store before travelling"}
              </dd>
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
              Official event page ↗
            </a>
          )}

          {alsoHere.length > 0 && (
            <section className="event-drawer__also">
              <h3 className="event-drawer__also-title">
                More at {event.shop}
              </h3>
              <ul className="event-drawer__also-list">
                {alsoHere.map((other) => {
                  const otherStart = parseLocal(other.startsAt);
                  return (
                    <li key={other.id}>
                      <button
                        type="button"
                        className="event-drawer__also-item"
                        onClick={() => onSelectEvent?.(other)}
                      >
                        <span className="event-drawer__also-when">
                          {formatFullDateLabel(otherStart)} ·{" "}
                          {formatTimeLabel(otherStart)}
                        </span>
                        <span className="event-drawer__also-type">
                          {(() => {
                            const otherIcon = eventIcon(other.typeLabel);
                            return otherIcon ? `${otherIcon.icon} ` : "";
                          })()}
                          {other.typeLabel}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
