// Local smoke test: fetches live events, builds the .ics file, and writes
// it to disk so you can eyeball it or open it in a calendar app before
// deploying. Run with: node scripts/test-local.js

import { writeFileSync } from "node:fs";
import { fetchAllEvents } from "../src/lib/pokedata.js";
import { buildCalendar } from "../src/lib/calendar.js";

const events = await fetchAllEvents();
console.log(`Fetched ${events.length} events`);
console.log(events.slice(0, 3));

const ics = buildCalendar(events);
writeFileSync(new URL("../tmp-preview.ics", import.meta.url), ics);
console.log("Wrote tmp-preview.ics");
