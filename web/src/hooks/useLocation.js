// Location is intentionally fixed to Central London — the calendar does not
// support user-supplied or geolocated origins, so this is the single source
// of truth for the distance filter's reference point.
export const DEFAULT_ORIGIN = {
  label: "Central London",
  latitude: 51.5074,
  longitude: -0.1278,
};
