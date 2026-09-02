import "./FilterBar.css";

const RADIUS_OPTIONS = [10, 20, 40, 999];

export default function FilterBar({
  origin,
  radiusKm,
  onRadiusChange,
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  cityFilter,
  onCityFilterChange,
  cityOptions,
}) {
  return (
    <div className="filter-bar" role="group" aria-label="Filter events">
      <div className="filter-bar__group">
        <span className="filter-bar__label" id="location-label">
          Location
        </span>
        <p className="filter-bar__location-value" aria-labelledby="location-label">
          {origin.label}
        </p>
      </div>

      <div className="filter-bar__group">
        <label className="filter-bar__label" htmlFor="city-select">
          Event location
        </label>
        <select
          id="city-select"
          className="filter-bar__select"
          value={cityFilter}
          onChange={(e) => onCityFilterChange(e.target.value)}
        >
          <option value="all">All locations</option>
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-bar__group">
        <label className="filter-bar__label" htmlFor="radius-select">
          Distance
        </label>
        <select
          id="radius-select"
          className="filter-bar__select"
          value={radiusKm}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
        >
          {RADIUS_OPTIONS.map((km) => (
            <option key={km} value={km}>
              {km >= 999 ? "Any distance" : `Within ${km} km`}
            </option>
          ))}
        </select>
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
    </div>
  );
}
