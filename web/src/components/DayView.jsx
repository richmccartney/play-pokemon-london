import { formatDayLabel, isSameDay, parseLocal } from "../lib/date";
import EventPill from "./EventPill";
import "./CalendarCell.css";
import "./DayView.css";

export default function DayView({ day, events, onSelectEvent, today }) {
  const isToday = isSameDay(day, today);
  const dayEvents = events
    .filter((e) => parseLocal(e.startsAt).toDateString() === day.toDateString())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <div className="day-view" role="grid" aria-label="Day view">
      <div
        role="gridcell"
        className={`calendar-cell${isToday ? " calendar-cell--today" : ""}`}
      >
        <div className="calendar-cell__header">
          <span>{formatDayLabel(day)}</span>
        </div>
        <div className="calendar-cell__events">
          {dayEvents.length === 0 ? (
            <p className="calendar-cell__empty">No events on this day.</p>
          ) : (
            dayEvents.map((event) => (
              <EventPill key={event.id} event={event} onSelect={onSelectEvent} variant="week" />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
