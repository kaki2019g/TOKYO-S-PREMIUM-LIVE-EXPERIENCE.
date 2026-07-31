import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseClubMonth } from "../lib/scrapers.js";

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
