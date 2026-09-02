import { useEffect, useState } from "react";

// Points at /api/events in production (redirected to the Netlify Function),
// or falls back to a same-origin path in dev if VITE_API_BASE isn't set.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export function useEvents() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE}/api/events`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setEvents(Array.isArray(data) ? data : []);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load events:", err);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { events, status };
}
