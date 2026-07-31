import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapers, venueDefinitions } from "./scrapers.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(rootDir, "data");
const cachePath = path.join(cacheDir, "events.json");
const temporaryCachePath = path.join(cacheDir, "events.json.tmp");

let refreshPromise = null;

function sortAndDedupe(events) {
  const unique = new Map();
  events.forEach((event) => unique.set(event.id, event));
  return [...unique.values()].sort(
    (left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title),
  );
}

export async function readEventStore() {
  try {
    return JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    return {
      updatedAt: null,
      events: [],
      venues: venueDefinitions,
      sources: {},
    };
  }
}

async function writeEventStore(store) {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(temporaryCachePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(temporaryCachePath, cachePath);
}

async function performRefresh() {
  const previous = await readEventStore();
  const results = await Promise.allSettled(
    Object.entries(scrapers).map(async ([venue, scrape]) => ({
      venue,
      events: await scrape(),
    })),
  );
  const sources = { ...previous.sources };
  const eventsByVenue = new Map(
    Object.keys(venueDefinitions).map((venue) => [
      venue,
      previous.events.filter((event) => event.venue === venue),
    ]),
  );
  const refreshedAt = new Date().toISOString();

  results.forEach((result, index) => {
    const venue = Object.keys(scrapers)[index];
    if (result.status === "fulfilled") {
      eventsByVenue.set(venue, result.value.events);
      sources[venue] = {
        ok: true,
        count: result.value.events.length,
        updatedAt: refreshedAt,
        error: null,
      };
      return;
    }

    sources[venue] = {
      ok: false,
      count: eventsByVenue.get(venue)?.length || 0,
      updatedAt: sources[venue]?.updatedAt || null,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    };
  });

  const store = {
    updatedAt: refreshedAt,
    events: sortAndDedupe([...eventsByVenue.values()].flat()),
    venues: venueDefinitions,
    sources,
  };
  await writeEventStore(store);
  return store;
}

export function refreshEventStore() {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

