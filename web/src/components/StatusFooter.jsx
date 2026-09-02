import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export default function StatusFooter() {
  const [statusText, setStatusText] = useState("Checking when the data was last refreshed…");

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/status`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.lastSyncAt) {
          setStatusText("No sync has run yet.");
          return;
        }
        const lastSync = new Date(data.lastSyncAt);
        setStatusText(
          `Last updated: ${lastSync.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })} (${data.eventCount} events tracked)`
        );
      })
      .catch(() => {
        if (!cancelled) setStatusText("Unable to check status right now.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="status-block">
      <h2>Status</h2>
      <p role="status">{statusText}</p>
    </div>
  );
}
