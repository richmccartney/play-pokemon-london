import MultiSelect from "./MultiSelect";
import "./FilterBar.css";

export default function FilterBar({
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  venueFilter,
  onVenueFilterChange,
  venueOptions,
  hasFilters,
  onClear,
}) {
  return (
    <div className="filter-bar" role="group" aria-label="Filter events">
      <div className="filter-bar__group">
        <MultiSelect
          id="venue-select"
          label="Event venue"
          options={venueOptions}
          selected={venueFilter}
          onChange={onVenueFilterChange}
        />
      </div>

      <div className="filter-bar__group">
        <label className="filter-bar__label" htmlFor="type-select">
          Event type
        </label>
        <select
          id="type-select"
          className="filter-bar__select"
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value)}
        >
          <option value="all">All event types</option>
          {typeOptions.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {hasFilters && (
        <button type="button" className="filter-bar__clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
