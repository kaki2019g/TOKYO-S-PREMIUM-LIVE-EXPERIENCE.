import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeRefreshResults } from "../lib/event-store.js";
import { parseClubMonth, venueDefinitions } from "../lib/scrapers.js";

const store = JSON.parse(
  await readFile(new URL("../data/events.json", import.meta.url), "utf8"),
);

test("cached event store contains all three venues", () => {
  assert.deepEqual(Object.keys(store.venues).sort(), [
    "billboard",
    "blue-note",
    "cotton-club",
  ]);

  for (const venue of Object.keys(store.venues)) {
    assert.ok(store.events.some((event) => event.venue === venue));
  }
});

test("normalized events expose the fields required by the UI", () => {
  assert.ok(store.events.length > 0);

  for (const event of store.events) {
    assert.match(event.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(event.id);
    assert.ok(event.title);
    assert.ok(event.url.startsWith("https://"));
    assert.ok(Array.isArray(event.shows));
    assert.ok(event.venue in store.venues);
  }
});

test("event ids are unique", () => {
  const ids = store.events.map((event) => event.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("an empty scraper result keeps the previous venue cache", () => {
  const previous = {
    events: [
      {
        id: "blue-note-2026-09-01-cached",
        date: "2026-09-01",
        venue: "blue-note",
        title: "Cached event",
      },
    ],
    venues: venueDefinitions,
    sources: {
      "blue-note": {
        ok: true,
        count: 1,
        updatedAt: "2026-08-01T00:00:00.000Z",
        error: null,
      },
    },
  };
  const results = [
    {
      status: "fulfilled",
      value: { venue: "blue-note", events: [] },
    },
    {
      status: "fulfilled",
      value: { venue: "cotton-club", events: [] },
    },
    {
      status: "fulfilled",
      value: { venue: "billboard", events: [] },
    },
  ];

  const refreshed = mergeRefreshResults(previous, results, "2026-09-01T00:00:00.000Z");

  assert.deepEqual(refreshed.events, previous.events);
  assert.equal(refreshed.sources["blue-note"].ok, false);
  assert.match(refreshed.sources["blue-note"].error, /returned no events/);
});

test("classic club scraper keeps every show listed on the same date", () => {
  const html = `
    <div class="scheduleTable">
      <table>
        <tr><td>
          <div class="scheduleBox"><span class="title">Two Show Live</span></div>
          <div class="dayBox"><span class="day">1</span></div>
        </td></tr>
      </table>
      <div class="priceBox"><span class="price">8,500</span></div>
      <div class="detailsOpen">
        <div class="column"><span class="text">
          [1st.show] open 3:30pm / start 4:30pm<br>
          [2nd.show] open 6:30pm / start 7:30pm
        </span></div>
      </div>
    </div>`;

  const [event] = parseClubMonth(
    html,
    {
      venue: "cotton-club",
      venueUrl: "https://www.cottonclubjapan.co.jp/jp/",
      scheduleBase: "https://reserve.cottonclubjapan.co.jp/",
      detailUrlPattern: /cottonclubjapan\.co\.jp\/jp\/artists\//,
    },
    { year: 2026, month: 8 },
  );

  assert.deepEqual(event.shows, ["16:30", "19:30"]);
});

test("club scraper supports the current schedule card markup", () => {
  const html = `
    <div class="m-schedule-list__row">
      <div class="m-schedule-list__date">
        <span class="m-schedule-list__date-num">30</span>
        <span class="m-schedule-list__date-num">1</span>
      </div>
      <a class="c-schedule-list-card" href="/reserve/schedule/exec/123">
        <img src="/reserve/img/event/123.jpg" alt="">
        <p class="c-schedule-list-card__title">Modern Live<br>in Tokyo</p>
        <span class="c-schedule-list-card__charge-price">¥9,000</span>
      </a>
    </div>`;
  const events = parseClubMonth(
    html,
    {
      venue: "blue-note",
      venueUrl: "https://www.bluenote.co.jp/jp/",
      scheduleBase: "https://reserve.bluenote.co.jp/",
    },
    { year: 2026, month: 9 },
  );

  assert.deepEqual(
    events.map((event) => event.date),
    ["2026-09-30", "2026-10-01"],
  );
  assert.equal(events[0].title, "Modern Live in Tokyo");
  assert.equal(events[0].price, "¥9,000");
  assert.equal(events[0].url, "https://reserve.bluenote.co.jp/reserve/schedule/exec/123");
});
