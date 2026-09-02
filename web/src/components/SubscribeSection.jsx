import { useState } from "react";
import "./SubscribeSection.css";

export default function SubscribeSection() {
  const [copyHint, setCopyHint] = useState("");
  const host = typeof window !== "undefined" ? window.location.host : "";
  const httpsUrl = `https://${host}/calendar.ics`;
  const webcalUrl = `webcal://${host}/calendar.ics`;
  const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(httpsUrl)}`;
  const outlookUrl = `https://outlook.live.com/calendar/0/addcalendar?url=${encodeURIComponent(
    httpsUrl
  )}&name=${encodeURIComponent("PokeLeagues London")}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopyHint("✅ Copied! Paste it into your calendar app's \"Subscribe by URL\" option.");
    } catch {
      setCopyHint("Couldn't copy automatically — please select and copy the link above.");
    }
  };

  return (
    <section className="subscribe-block" id="subscribe" aria-labelledby="subscribe-heading">
      <h2 id="subscribe-heading">Subscribe</h2>
      <p>Pick your platform for one-tap setup, or copy the link manually below.</p>

      <div className="platform-buttons">
        <a className="btn btn-outline" href={webcalUrl} target="_blank" rel="noopener noreferrer">
          🍏 Apple Calendar (Mac/iPhone)
        </a>
        <a className="btn btn-outline" href={googleUrl} target="_blank" rel="noopener noreferrer">
          🟢 Google Calendar
        </a>
        <a className="btn btn-outline" href={outlookUrl} target="_blank" rel="noopener noreferrer">
          🟦 Outlook
        </a>
      </div>

      <p className="copy-label">Or copy this link and add it manually (Settings → Add calendar → From URL):</p>
      <div className="copy-row">
        <code>{httpsUrl}</code>
        <button type="button" className="copy-btn" onClick={handleCopy}>
          Copy
        </button>
      </div>
      <p className="copy-hint" role="status" aria-live="polite">
        {copyHint}
      </p>
    </section>
  );
}
