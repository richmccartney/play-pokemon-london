import { useCallback, useEffect, useRef, useState } from "react";
import { formatFullDateLabel, formatTimeLabel, parseLocal } from "../lib/date";
import { eventIcon } from "../lib/eventIcon";
import { venueColorIndex } from "../lib/eventColor";
import "./EventDrawer.css";

// Close/dismiss durations: a deliberate swipe-to-dismiss continues the
// fling motion the user already started, so it plays a touch longer; a
// tap on "Back" (or Escape, or the backdrop) has no motion to continue and
// should feel snappier. The spring-back (drag released before crossing the
// dismiss threshold) sits in between — quick, but still a visible ease.
const SWIPE_CLOSE_MS = 220;
const CLICK_CLOSE_MS = 130;
const SPRING_BACK_MS = 180;

export default function EventDrawer({ event, allEvents = [], onSelectEvent, onClose }) {
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const touchStart = useRef(null);
  // Mirrored in refs because touchend/requestClose must read the latest
  // values synchronously; a fast swipe can end before React commits state,
  // and guards against a second close being requested mid-animation.
  const dragXRef = useRef(0);
  const closePhaseRef = useRef(null);
  const [dragX, setDragX] = useState(0);
  // The drawer's own width at the moment a drag or close starts, used to
  // turn dragX into a 0..1 progress fraction for the fade. Captured into
  // state (rather than read from a ref during render) so the fade amount
  // is deterministic across renders.
  const [dragWidth, setDragWidth] = useState(0);
  // True only while a finger is actually down and moving, so the drawer can
  // track it instantly (no transition); false the instant it lifts, so the
  // spring-back/dismiss/close that follows animates smoothly instead of
  // "flashing" back into place with no transition at all.
  const [dragging, setDragging] = useState(false);
  // null while open/idle, otherwise which action is closing the drawer, so
  // the exit animation can use that method's duration.
  const [closePhase, setClosePhase] = useState(null);
  // Once true (a drag has started, or a close has been requested), the
  // drawer is fully JS-driven via inline transform/opacity instead of the
  // CSS entrance keyframe — including through a spring-back, so letting go
  // of a small drag still animates smoothly rather than reverting to the
  // (now stale) keyframe animation.
  const [interacting, setInteracting] = useState(false);
  // Whether the drawer's own content has been scrolled down from the top,
  // so the sticky header can pick up a shadow separating it from whatever
  // content is now tucked underneath it.
  const [scrolled, setScrolled] = useState(false);
  // The drawer's DOM node persists across events (e.g. tapping through to
  // "also here", or opening a new event right after swipe-dismissing the
  // previous one), so track which event this render's transient UI state
  // (scroll position/shadow, and any in-progress drag/close animation)
  // belongs to, and reset it during render when a new event is shown rather
  // than carrying over the previous event's. This is the React-recommended
  // "adjust state during render" pattern for resetting state on prop change.
  const [openForEventId, setOpenForEventId] = useState(event?.id);
  if (event?.id !== openForEventId) {
    setOpenForEventId(event?.id);
    setScrolled(false);
    // Without this, a swipe-dismissed drawer (which ends with dragX left at
    // the full drawer width so it animates off-screen) would reopen for the
    // next event still translated fully off-screen, since this component
    // never unmounts between events — it just renders null while closed.
    // dragXRef/closePhaseRef themselves are reset in the effect below
    // (refs shouldn't be written during render).
    setDragX(0);
    setDragWidth(0);
    setDragging(false);
    setClosePhase(null);
    setInteracting(false);
  }

  // Slides (and fades) the drawer fully off-screen, then calls the parent's
  // onClose once that animation has had time to play. Shared by the "Back"
  // button, Escape, backdrop click, and a completed swipe-to-dismiss, so
  // every path animates out consistently — only the duration differs.
  const requestClose = useCallback(
    (method) => {
      if (closePhaseRef.current) return;
      closePhaseRef.current = method;
      setClosePhase(method);
      setInteracting(true);
      setDragging(false);
      const width = drawerRef.current?.offsetWidth || window.innerWidth;
      setDragWidth(width);
      dragXRef.current = width;
      setDragX(width);
      window.setTimeout(onClose, method === "swipe" ? SWIPE_CLOSE_MS : CLICK_CLOSE_MS);
    },
    [onClose]
  );

  // Focus the close button on open, restore focus to the trigger on close,
  // and trap Escape/Tab within the drawer while it's open (WCAG 2.1 dialog
  // pattern) for keyboard and screen reader users.
  useEffect(() => {
    if (!event) return;
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();
    document.body.style.overflow = "hidden";
    // The drawer's DOM node persists across events (e.g. tapping through to
    // "also here"), so reset scroll position and any leftover drag/close
    // state for each newly opened event rather than carrying over the last
    // one's (the corresponding state itself is reset during render above,
    // in response to the same change).
    if (drawerRef.current) drawerRef.current.scrollTop = 0;
    dragXRef.current = 0;
    closePhaseRef.current = null;

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        requestClose("click");
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
  }, [event, requestClose]);

  // The drawer enters from the right, so a rightward swipe dismisses it.
  // The panel tracks the finger and only closes past a distance or velocity
  // threshold; otherwise it springs back.
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1 || closePhaseRef.current) return;
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
      if (start.axis === "x") {
        setInteracting(true);
        setDragging(true);
        setDragWidth(drawerRef.current?.offsetWidth || window.innerWidth);
      }
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
    setDragging(false);
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
      requestClose("swipe");
    } else {
      // Springs back: dragging is already false (set above), so the render
      // below picks up a transition and eases back to rest instead of
      // snapping/flashing into place.
      dragXRef.current = 0;
      setDragX(0);
    }
  }, [requestClose]);

  // Gives the sticky header a shadow once content has scrolled up underneath
  // it, so it reads as a distinct layer floating above the content rather
  // than content abruptly touching its bottom edge. A small threshold avoids
  // the shadow flickering in from sub-pixel scroll jitter at rest.
  const handleScroll = useCallback((e) => {
    setScrolled(e.currentTarget.scrollTop > 4);
  }, []);

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
  // Same venue, so every "also here" card shares the venue's colour accent —
  // consistent with how the calendar itself colour-codes entries by venue.
  const alsoColorIndex = venueColorIndex(event.shop);

  // 0 (fully open) .. 1 (fully dragged/closed away), driving both the
  // card's own fade and the backdrop dimming behind it.
  const progress = dragWidth > 0 ? Math.min(1, dragX / dragWidth) : 0;
  const closeDurationMs =
    closePhase === "swipe" ? SWIPE_CLOSE_MS : closePhase === "click" ? CLICK_CLOSE_MS : SPRING_BACK_MS;
  const cardTransitionStyle = dragging
    ? "none"
    : `transform ${closeDurationMs}ms ease-out, opacity ${closeDurationMs}ms ease-out`;

  return (
    <div
      className="event-drawer-overlay"
      onClick={() => requestClose("click")}
      style={
        interacting
          ? {
              // Animated via background-color (not the overlay's own
              // opacity) so only the backdrop dims/undims — the card is a
              // child of this element and would otherwise be double-faded.
              backgroundColor: `rgba(0, 0, 0, ${0.4 * (1 - progress)})`,
              transition: dragging ? "none" : `background-color ${closeDurationMs}ms ease-out`,
            }
          : undefined
      }
    >
      <div
        className="event-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-drawer-title"
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={
          interacting
            ? {
                transform: `translateX(${dragX}px)`,
                opacity: 1 - progress,
                transition: cardTransitionStyle,
                animation: "none",
              }
            : undefined
        }
      >
        <div className="event-drawer__grabber" aria-hidden="true" />
        <div className={`event-drawer__header${scrolled ? " event-drawer__header--scrolled" : ""}`}>
          <button
            type="button"
            className="event-drawer__close"
            onClick={() => requestClose("click")}
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
              <dd>
                {formatTimeLabel(start)}
                {event.confidence === "verified" && (
                  <span
                    className="event-drawer__verified"
                    title={`Confirmed against ${event.shop}'s own website`}
                  >
                    ✓ confirmed
                  </span>
                )}
              </dd>
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
            <div className="event-drawer__fact">
              <dt>Listing</dt>
              <dd>
                {event.pokemonUrl
                  ? "Officially sanctioned Play! Pokémon event"
                  : "Regular league night"}
              </dd>
            </div>
          </dl>

          {event.confidence === "unverified" && (
            <p className="event-drawer__unverified">
              <span aria-hidden="true">⚠️</span> This date and time may not be
              up to date. Please check with the store before travelling.
            </p>
          )}

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
                        className={`event-drawer__also-item event-pill--c${alsoColorIndex}`}
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
