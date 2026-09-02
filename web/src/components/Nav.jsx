import "./Nav.css";

export default function Nav({ theme, onToggleTheme }) {
  return (
    <nav className="nav" aria-label="Primary">
      <a className="nav__brand" href="/">
        <svg
          width="26"
          height="26"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="32" cy="32" r="30" stroke="var(--text)" strokeWidth="3" fill="none" />
          <path d="M2 32 A30 30 0 0 1 62 32" fill="var(--accent-strong)" stroke="var(--text)" strokeWidth="3" />
          <path d="M2 32 A30 30 0 0 0 62 32" fill="var(--surface)" stroke="var(--text)" strokeWidth="3" />
          <line x1="2" y1="32" x2="62" y2="32" stroke="var(--text)" strokeWidth="3" />
          <circle cx="32" cy="32" r="10" fill="var(--surface)" stroke="var(--text)" strokeWidth="3" />
          <circle cx="32" cy="32" r="5" fill="var(--surface)" stroke="var(--text)" strokeWidth="2" />
        </svg>
        PokeLeagues London
      </a>
      <div className="nav__links">
        <a className="nav__cta" href="#subscribe">
          Subscribe
        </a>
        <button
          type="button"
          className="nav__theme-toggle"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
        </button>
      </div>
    </nav>
  );
}
