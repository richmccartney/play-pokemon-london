import { getMonthGrid, isSameDay, parseLocal } from "../lib/date";
import EventPill from "./EventPill";
import "./CalendarCell.css";
import "./MonthView.css";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE_PER_DAY = 3;

export default function MonthView({ cursor, events, onSelectEvent, onSelectDay, today }) {
  const days = getMonthGrid(cursor);
  const eventsByDay = new Map();
  for (const event of events) {
    const key = parseLocal(event.startsAt).toDateString();
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key).push(event);
  }

  return (
    <div className="month-view">
      <div className="month-view__weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="month-view__weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="month-view__grid" role="grid" aria-label="Month view">
        {days.map((day) => {
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = isSameDay(day, today);
          const dayEvents = (eventsByDay.get(day.toDateString()) || []).sort((a, b) =>
            a.startsAt.localeCompare(b.startsAt)
          );
          const visible = dayEvents.slice(0, MAX_VISIBLE_PER_DAY);
          const overflow = dayEvents.length - visible.length;

          return (
            <div
              key={day.toISOString()}
              role="gridcell"
              className={`calendar-cell month-view__cell${inMonth ? "" : " calendar-cell--muted"}${
                isToday ? " calendar-cell--today" : ""
              }`}
            >
              <div className="calendar-cell__header">
                <button
                  type="button"
                  className="calendar-cell__header-btn"
                  onClick={() => onSelectDay(day)}
                  aria-label={`View ${day.toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}${dayEvents.length ? `, ${dayEvents.length} events` : ", no events"}`}
                >
                  {day.getDate()}
                </button>
              </div>
              <div className="calendar-cell__events">
                {visible.map((event) => (
                  <EventPill key={event.id} event={event} onSelect={onSelectEvent} variant="month" />
                ))}
                {overflow > 0 && (
                  <button type="button" className="month-view__more" onClick={() => onSelectDay(day)}>
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
