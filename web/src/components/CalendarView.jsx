import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  formatMonthLabel,
  formatWeekRangeLabel,
  parseLocal,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "../lib/date";
import FilterBar from "./FilterBar";
import ViewSwitcher from "./ViewSwitcher";
import CalendarToolbar from "./CalendarToolbar";
import MonthView from "./MonthView";
import WeekView from "./WeekView";
import DayView from "./DayView";
import EventDrawer from "./EventDrawer";
import "./CalendarView.css";

const TODAY = startOfDay(new Date());

// Location is fixed to Central London — not user-changeable.

export default function CalendarView({ events, status }) {
  // Week is the default: it's dense enough to show each event's venue and
  // type inline, which the month grid has no room for.
  const [view, setView] = useState("week");
  const [cursor, setCursor] = useState(TODAY);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState([]);

  const typeOptions = useMemo(() => {
    const labels = new Set(events.map((e) => e.typeLabel).filter(Boolean));
    return Array.from(labels).sort();
  }, [events]);

  const venueOptions = useMemo(() => {
    const venues = new Set(events.map((e) => e.shop).filter(Boolean));
    return Array.from(venues).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (typeFilter !== "all" && event.typeLabel !== typeFilter) return false;
      if (venueFilter.length > 0 && !venueFilter.includes(event.shop)) return false;
      return true;
    });
  }, [events, typeFilter, venueFilter]);

  const hasFilters = typeFilter !== "all" || venueFilter.length > 0;

  const weekStart = startOfWeek(cursor);

  // The count reflects only the period currently on screen (the visible
  // month, week or day), so it updates both when filters change and when
  // the user navigates between periods.
  const visibleEvents = useMemo(() => {
    const rangeStart =
      view === "month" ? startOfMonth(cursor) : view === "week" ? weekStart : startOfDay(cursor);
    const rangeEnd =
      view === "month"
        ? addDays(endOfMonth(cursor), 1)
        : view === "week"
        ? addDays(weekStart, 7)
        : addDays(startOfDay(cursor), 1);

    return filteredEvents.filter((event) => {
      const when = parseLocal(event.startsAt);
      return when >= rangeStart && when < rangeEnd;
    });
  }, [filteredEvents, view, cursor, weekStart]);

  const handlePrev = () => {
    if (view === "month") setCursor((c) => addMonths(c, -1));
    else if (view === "week") setCursor((c) => addDays(c, -7));
    else setCursor((c) => addDays(c, -1));
  };
  const handleNext = () => {
    if (view === "month") setCursor((c) => addMonths(c, 1));
    else if (view === "week") setCursor((c) => addDays(c, 7));
    else setCursor((c) => addDays(c, 1));
  };
  const handleToday = () => setCursor(TODAY);

  const toolbarLabel =
    view === "month"
      ? formatMonthLabel(cursor)
      : view === "week"
      ? formatWeekRangeLabel(weekStart)
      : cursor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  const handleSelectDay = (day) => {
    setCursor(day);
    setView("day");
  };

  return (
    <section className="calendar-view" id="calendar" aria-labelledby="calendar-heading">
      <div className="calendar-view__intro">
        <div>
          <p className="calendar-view__eyebrow">Plan your next match</p>
          <h2 id="calendar-heading">London league events</h2>
          <p className="calendar-view__description">
            Find a nearby event, then open it for venue details and directions.
          </p>
        </div>
        <p className="calendar-view__count" aria-live="polite">
          <strong>{visibleEvents.length}</strong>
          <span>{visibleEvents.length === 1 ? "event" : "events"} shown</span>
        </p>
      </div>

      <FilterBar
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        typeOptions={typeOptions}
        venueFilter={venueFilter}
        onVenueFilterChange={setVenueFilter}
        venueOptions={venueOptions}
        hasFilters={hasFilters}
        onClear={() => {
          setTypeFilter("all");
          setVenueFilter([]);
        }}
      />

      <div className="calendar-view__header">
        <CalendarToolbar label={toolbarLabel} onPrev={handlePrev} onNext={handleNext} onToday={handleToday} />
        <ViewSwitcher view={view} onChange={setView} />
      </div>

      {status === "loading" && <p className="calendar-view__message">Loading events…</p>}
      {status === "error" && (
        <p className="calendar-view__message calendar-view__message--error" role="alert">
          Couldn't load events right now. Please try again shortly.
        </p>
      )}
      {status === "ready" && filteredEvents.length === 0 && (
        <p className="calendar-view__message">No events match your filters. Try widening the distance.</p>
      )}

      {status === "ready" && filteredEvents.length > 0 && (
        <>
          {view === "month" && (
            <MonthView
              cursor={cursor}
              events={filteredEvents}
              onSelectEvent={setSelectedEvent}
              onSelectDay={handleSelectDay}
              today={TODAY}
            />
          )}
          {view === "week" && (
            <WeekView
              weekStart={weekStart}
              events={filteredEvents}
              onSelectEvent={setSelectedEvent}
              today={TODAY}
              selectedDay={cursor}
            />
          )}
          {view === "day" && (
            <DayView day={cursor} events={filteredEvents} onSelectEvent={setSelectedEvent} today={TODAY} />
          )}
        </>
      )}

      <EventDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </section>
  );
}

// Re-export for consumers that only need date parsing alongside this view.
export { parseLocal };
