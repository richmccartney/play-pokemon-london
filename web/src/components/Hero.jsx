import { useEffect, useState } from "react";
import "./Hero.css";

// Roughly how long the catch animation runs, and the window between plays.
const CATCH_DURATION_MS = 2600;
const MIN_GAP_MS = 6000;
const MAX_GAP_MS = 14000;

export default function Hero() {
  const [catching, setCatching] = useState(false);

  // Replay the catch animation at random intervals so the hero feels alive
  // without being predictable. Respects reduced-motion by never scheduling.
  useEffect(() => {
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let playTimer;
    let stopTimer;

    const schedule = () => {
      const delay = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
      playTimer = window.setTimeout(() => {
        setCatching(true);
        stopTimer = window.setTimeout(() => {
          setCatching(false);
          schedule();
        }, CATCH_DURATION_MS);
      }, delay);
    };

    schedule();
    return () => {
      window.clearTimeout(playTimer);
      window.clearTimeout(stopTimer);
    };
  }, []);

  return (
    <section className="hero">
      <div
        className={`hero__logo${catching ? " hero__logo--catching" : ""}`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="30" stroke="var(--text)" strokeWidth="3" fill="none" />
          <path d="M2 32 A30 30 0 0 1 62 32" fill="var(--accent-strong)" stroke="var(--text)" strokeWidth="3" />
          <path d="M2 32 A30 30 0 0 0 62 32" fill="var(--surface)" stroke="var(--text)" strokeWidth="3" />
          <line x1="2" y1="32" x2="62" y2="32" stroke="var(--text)" strokeWidth="3" />
          <circle cx="32" cy="32" r="10" fill="var(--surface)" stroke="var(--text)" strokeWidth="3" />
          <circle cx="32" cy="32" r="5" fill="var(--surface)" stroke="var(--text)" strokeWidth="2" />
        </svg>
      </div>
      <h1>
        The League calendar that <span className="hero__accent">stays in sync</span>
      </h1>
      <p className="hero__tagline">
        A subscribable calendar of nearby Pokemon TCG League Cups, Challenges,
        Friendlies and Pre-releases, refreshed nightly.
      </p>
      <a className="btn" href="#calendar">
        Browse the Calendar
      </a>
      <div className="hero__trust">
        Refreshed nightly · No sign-up required
      </div>
    </section>
  );
}
