import { addDays, formatDayLabel, isSameDay, parseLocal } from "../lib/date";
import EventPill from "./EventPill";
import "./CalendarCell.css";
import "./WeekView.css";

export default function WeekView({ weekStart, events, onSelectEvent, today }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const eventsByDay = new Map();
  for (const event of events) {
    const key = parseLocal(event.startsAt).toDateString();
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key).push(event);
  }

  return (
    <div className="week-view" role="grid" aria-label="Week view">
      {days.map((day) => {
        const isToday = isSameDay(day, today);
        const dayEvents = (eventsByDay.get(day.toDateString()) || []).sort((a, b) =>
          a.startsAt.localeCompare(b.startsAt)
        );
        return (
          <div
            key={day.toISOString()}
            role="gridcell"
            className={`calendar-cell${isToday ? " calendar-cell--today" : ""}`}
          >
            <div className="calendar-cell__header">
              <span>{formatDayLabel(day)}</span>
            </div>
            <div className="calendar-cell__events">
              {dayEvents.length === 0 && (
                <p className="calendar-cell__empty">No events</p>
              )}
              {dayEvents.map((event) => (
                <EventPill key={event.id} event={event} onSelect={onSelectEvent} variant="week" />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
