import "./ViewSwitcher.css";

const VIEWS = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

export default function ViewSwitcher({ view, onChange }) {
  return (
    <div className="view-switcher" role="group" aria-label="Calendar view">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          className={`view-switcher__btn${view === v.id ? " view-switcher__btn--active" : ""}`}
          aria-pressed={view === v.id}
          onClick={() => onChange(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
