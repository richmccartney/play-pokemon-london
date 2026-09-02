import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  formatMonthLabel,
  formatWeekRangeLabel,
  parseLocal,
  startOfDay,
  startOfWeek,
} from "../lib/date";
import { distanceKm } from "../lib/geo";
import { DEFAULT_ORIGIN } from "../hooks/useLocation";
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
const origin = DEFAULT_ORIGIN;

export default function CalendarView({ events, status }) {
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(TODAY);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [radiusKm, setRadiusKm] = useState(40);
  const [typeFilter, setTypeFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");

  const typeOptions = useMemo(() => {
    const labels = new Set(events.map((e) => e.typeLabel).filter(Boolean));
    return Array.from(labels).sort();
  }, [events]);

  const cityOptions = useMemo(() => {
    const cities = new Set(events.map((e) => e.city).filter(Boolean));
    return Array.from(cities).sort();
  }, [events]);

  const venueOptions = useMemo(() => {
    const venues = new Set(events.map((e) => e.shop).filter(Boolean));
    return Array.from(venues).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (typeFilter !== "all" && event.typeLabel !== typeFilter) return false;
      if (cityFilter !== "all" && event.city !== cityFilter) return false;
      if (venueFilter !== "all" && event.shop !== venueFilter) return false;
      if (radiusKm >= 999) return true;
      const km = distanceKm(origin.latitude, origin.longitude, event.latitude, event.longitude);
      return km <= radiusKm;
    });
  }, [events, typeFilter, cityFilter, venueFilter, radiusKm]);

  const weekStart = startOfWeek(cursor);

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
      <h2 id="calendar-heading" className="visually-hidden">
        League Events Calendar
      </h2>

      <FilterBar
        origin={origin}
        radiusKm={radiusKm}
        onRadiusChange={setRadiusKm}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        typeOptions={typeOptions}
        cityFilter={cityFilter}
        onCityFilterChange={setCityFilter}
        cityOptions={cityOptions}
        venueFilter={venueFilter}
        onVenueFilterChange={setVenueFilter}
        venueOptions={venueOptions}
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
