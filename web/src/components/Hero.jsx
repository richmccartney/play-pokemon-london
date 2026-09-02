import "./Hero.css";

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero__logo" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="30" stroke="var(--text)" strokeWidth="3" fill="none" />
          <path d="M2 32 A30 30 0 0 1 62 32" fill="var(--accent)" stroke="var(--text)" strokeWidth="3" />
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
        📅 Browse the Calendar
      </a>
      <div className="hero__trust">
        Refreshed nightly · Cleaned venue data · No sign-up required
      </div>
    </section>
  );
}
