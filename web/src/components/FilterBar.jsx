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
        <MultiSelect
          id="type-select"
          label="Event type"
          options={typeOptions}
          selected={typeFilter}
          onChange={onTypeFilterChange}
        />
      </div>
      {hasFilters && (
        <button type="button" className="filter-bar__clear" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
