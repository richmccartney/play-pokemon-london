// Simple health/status endpoint so you can confirm the nightly sync is
// actually running and see when it last succeeded.

import { getMeta } from "../../src/lib/store.js";

export default async () => {
  const meta = await getMeta();
  return new Response(JSON.stringify(meta, null, 2), {
    headers: { "content-type": "application/json" },
  });
};
