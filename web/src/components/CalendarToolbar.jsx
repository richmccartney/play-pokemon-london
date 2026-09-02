import "./CalendarToolbar.css";

export default function CalendarToolbar({ label, onPrev, onNext, onToday }) {
  return (
    <div className="calendar-toolbar">
      <div className="calendar-toolbar__nav">
        <button type="button" className="calendar-toolbar__icon-btn" onClick={onPrev} aria-label="Previous">
          ‹
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onToday}>
          Today
        </button>
        <button type="button" className="calendar-toolbar__icon-btn" onClick={onNext} aria-label="Next">
          ›
        </button>
      </div>
      <h2 className="calendar-toolbar__label">{label}</h2>
    </div>
  );
}
