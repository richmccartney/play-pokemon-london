// Generates the static fixtures served by the Vite site when it is built
// without the Netlify Functions runtime (local preview and the plain static
// deploy). Both artifacts are written together on purpose: previously only
// the events fixture was regenerated, so /status kept reporting the event
// count from an older sync run and the two silently drifted apart.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fetchAllEvents } from "../src/lib/pokedata.js";
import { verifyAgainstStoreSites } from "../src/lib/store-sites.js";
import { buildCalendar } from "../src/lib/calendar.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Write the events fixture, the subscribable calendar and the matching
 * status/meta artifact into a single web target directory (web/public during
 * generation, web/dist after a build has wiped it).
 */
export function writeFixtures(events, targetDir) {
  mkdirSync(join(targetDir, "api"), { recursive: true });
  writeFileSync(
    join(targetDir, "api", "events"),
    JSON.stringify(events, null, 2)
  );
  // The subscribe feed. Generated here rather than served from a function so
  // subscribers get the same verified times as the site, from one source.
  writeFileSync(join(targetDir, "calendar.ics"), buildCalendar(events));
  // Consumed by the site's status display.
  writeFileSync(
    join(targetDir, "status"),
    JSON.stringify({
      lastSyncAt: new Date().toISOString(),
      eventCount: events.length,
      freshCount: events.length,
      verifiedCount: events.filter((e) => e.confidence === "verified").length,
    })
  );
}

const venueRegistry = {};
const scraped = await fetchAllEvents({ venueRegistry });
const { events, corrections } = await verifyAgainstStoreSites(scraped);

for (const c of corrections) {
  console.log(
    `  ${c.shop} ${c.date} ${c.from} -> ${c.to} (${c.exact ? "exact" : "weekly"})`
  );
}

const verified = events.filter((e) => e.confidence === "verified").length;
console.log(
  `\n${events.length} events, ${corrections.length} corrections, ${verified} verified / ${
    events.length - verified
  } unverified (${Math.round((verified / events.length) * 100)}%)`
);

// Guard the nightly job against publishing a bad run. If a store site is
// down, or we get rate limited, verification quietly degrades to pokedata's
// stale times rather than failing loudly, and committing that would undo
// corrections we already have. Compare against the fixture we are replacing
// and refuse to regress badly.
const MIN_EVENTS = 50;
const MAX_VERIFIED_DROP = 0.2;

if (events.length < MIN_EVENTS) {
  console.error(
    `\nRefusing to write: only ${events.length} events fetched (expected at least ${MIN_EVENTS}). The source is probably having a bad day.`
  );
  process.exit(1);
}

const previousPath = join(repoRoot, "web", "public", "api", "events");
if (existsSync(previousPath)) {
  const previous = JSON.parse(readFileSync(previousPath, "utf8"));
  const previousVerified = previous.filter(
    (e) => e.confidence === "verified"
  ).length;
  if (previousVerified > 0) {
    const drop = (previousVerified - verified) / previousVerified;
    if (drop > MAX_VERIFIED_DROP) {
      console.error(
        `\nRefusing to write: verified events fell from ${previousVerified} to ${verified} ` +
          `(${Math.round(drop * 100)}% drop, limit ${MAX_VERIFIED_DROP * 100}%). ` +
          `Keeping the existing data.`
      );
      process.exit(1);
    }
  }
}

writeFixtures(events, join(repoRoot, "web", "public"));
console.log(`Wrote web/public/api/events, calendar.ics and status`);
