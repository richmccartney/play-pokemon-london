import "./SupportCoffee.css";

// Sits directly under the Subscribe section (not the footer) so it reads as
// part of "what to do next" rather than fine-print, but deliberately isn't a
// card like Subscribe — plain text keeps it feeling like a friendly aside,
// not another action competing for attention.
export default function SupportCoffee() {
  return (
    <p className="support-coffee">
      <span className="support-coffee__emoji" aria-hidden="true">
        ☕
      </span>
      Enjoying the calendar?{" "}
      <a href="https://buymeacoffee.com/pokemacca" target="_blank" rel="noopener noreferrer">
        Buy me a coffee
      </a>{" "}
      to help keep it running.
    </p>
  );
}
