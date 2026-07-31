import { refreshEventStore } from "../lib/event-store.js";

try {
  const store = await refreshEventStore();
  const summary = Object.entries(store.sources)
    .map(([venue, source]) => `${venue}: ${source.count}件${source.ok ? "" : " (前回キャッシュ)"}`)
    .join(", ");
  console.log(`Updated ${store.events.length} events at ${store.updatedAt}`);
  console.log(summary);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

