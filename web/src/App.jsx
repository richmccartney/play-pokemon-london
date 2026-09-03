import { useTheme } from "./hooks/useTheme";
import { useEvents } from "./hooks/useEvents";
import { useApplePlatformClass } from "./hooks/useApplePlatformClass";
import Nav from "./components/Nav";
import Hero from "./components/Hero";
import CalendarView from "./components/CalendarView";
import SubscribeSection from "./components/SubscribeSection";
import StatusFooter from "./components/StatusFooter";
import "./App.css";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { events, status } = useEvents();
  useApplePlatformClass();

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Nav theme={theme} onToggleTheme={toggleTheme} />
      <main id="main-content">
        <Hero />
        <CalendarView events={events} status={status} />
        <div className="app__below-calendar">
          <SubscribeSection />
        </div>
      </main>
      <footer className="app__footer">
        <p>
          © 2026 PokeLeagues London — data refreshed nightly ·{" "}
          <a href="https://buymeacoffee.com/pokemacca" target="_blank" rel="noopener noreferrer">
            Buy Me a Coffee
          </a>
        </p>
        <StatusFooter />
      </footer>
    </>
  );
}
