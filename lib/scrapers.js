import * as cheerio from "cheerio";

const USER_AGENT =
  "JAZZ-THREE/1.0 (+schedule aggregator; contact the site operator)";
const REQUEST_TIMEOUT_MS = 20_000;

export const venueDefinitions = {
  "blue-note": {
    name: "Blue Note Tokyo",
    shortName: "Blue Note",
    color: "#244f88",
    url: "https://www.bluenote.co.jp/jp/",
  },
  "cotton-club": {
    name: "Cotton Club",
    shortName: "Cotton Club",
    color: "#a42722",
    url: "https://www.cottonclubjapan.co.jp/jp/",
  },
  billboard: {
    name: "Billboard Live Tokyo",
    shortName: "Billboard Live",
    color: "#111111",
    url: "https://www.billboard-live.com/tokyo",
  },
};

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value, base) {
  if (!value) return "";
  try {
    const url = new URL(value, base);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.href;
  } catch {
    return "";
  }
}

function localDateString(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function to24Hour(hour, minute, period) {
  let normalizedHour = Number(hour);
  if (period.toLowerCase() === "pm" && normalizedHour !== 12) normalizedHour += 12;
  if (period.toLowerCase() === "am" && normalizedHour === 12) normalizedHour = 0;
  return `${String(normalizedHour).padStart(2, "0")}:${minute}`;
}

function extractStartTimes(text) {
  const times = [];
  const pattern = /start\s*([0-9]{1,2}):([0-9]{2})\s*(am|pm)/gi;

  for (const match of text.matchAll(pattern)) {
    const time = to24Hour(match[1], match[2], match[3]);
    if (!times.includes(time)) times.push(time);
  }

  return times;
}

function extractDatedShows($, details, eventDates) {
  const showsByDate = new Map();
  const scheduleSpans = details
    .find(".column .text")
    .filter((_, element) => /start\s*[0-9]/i.test($(element).text()));

  if (!scheduleSpans.length) return showsByDate;

  scheduleSpans.each((_, element) => {
    const html = $(element).html() || "";
    const lines = html
      .replace(/<br\s*\/?>/gi, "\n")
      .split("\n")
      .map((line) => cleanText(cheerio.load(`<span>${line}</span>`).text()))
      .filter(Boolean);
    let activeDates = eventDates;

    lines.forEach((line) => {
      const dateMatches = [...line.matchAll(/(?:^|[^\d])([0-9]{1,2})\.([0-9]{1,2})(?:[^\d]|$)/g)];
      const matchedDates = dateMatches
        .map((match) => {
          const month = Number(match[1]);
          const day = Number(match[2]);
          return eventDates.find((date) => {
            const [, eventMonth, eventDay] = date.split("-").map(Number);
            return eventMonth === month && eventDay === day;
          });
        })
        .filter(Boolean);
      if (matchedDates.length) activeDates = matchedDates;

      const times = extractStartTimes(line);
      if (times.length) {
        activeDates.forEach((date) => {
          const existingTimes = showsByDate.get(date) || [];
          const mergedTimes = [...existingTimes];
          times.forEach((time) => {
            if (!mergedTimes.includes(time)) mergedTimes.push(time);
          });
          showsByDate.set(date, mergedTimes);
        });
      }
    });
  });

  return showsByDate;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        ...options.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}: ${url}`);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function monthSequence(count = 6) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  });
  const [year, month] = formatter.format(now).split("-").map(Number);

  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(year, month - 1 + offset, 1);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      key: `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`,
    };
  });
}

export function parseClubMonth(html, config, targetMonth) {
  const $ = cheerio.load(html);
  const events = [];

  $(".scheduleTable table").each((_, tableElement) => {
    const table = $(tableElement);
    const title = cleanText(table.find(".scheduleBox .title").text());
    if (!title) return;

    let priceBox = table.next();
    while (priceBox.length && !priceBox.hasClass("priceBox")) {
      if (priceBox.is("table")) return;
      priceBox = priceBox.next();
    }
    if (!priceBox.length) return;

    const details = priceBox.nextAll(".detailsOpen").first();
    const detailsText = cleanText(details.text());
    const subtitle = cleanText(details.find(".intro").first().text());
    const priceValue = cleanText(priceBox.find(".price").first().text());
    const image = absoluteUrl(table.find(".columnImg img").attr("src"), config.scheduleBase);
    const links = details
      .find("a[href]")
      .map((__, link) => absoluteUrl($(link).attr("href"), config.scheduleBase))
      .get();
    const officialUrl =
      links.find((link) => config.detailUrlPattern.test(link)) ||
      links.find((link) => link.startsWith("http")) ||
      config.venueUrl;
    const reservable = links.some((link) => /\/schedule\/exec\//.test(link));
    const dayValues = table
      .find(".dayBox .day")
      .map((__, day) => Number(cleanText($(day).text())))
      .get()
      .filter(Number.isFinite);

    let eventMonth = targetMonth.month;
    let eventYear = targetMonth.year;
    let previousDay = 0;

    const eventDates = [];
    dayValues.forEach((day) => {
      if (previousDay && day < previousDay) {
        eventMonth += 1;
        if (eventMonth === 13) {
          eventMonth = 1;
          eventYear += 1;
        }
      }
      previousDay = day;

      const date = localDateString(eventYear, eventMonth, day);
      eventDates.push(date);
    });
    const fallbackShows = extractStartTimes(detailsText);
    const showsByDate = extractDatedShows($, details, eventDates);

    eventDates.forEach((date) => {
      events.push({
        id: `${config.venue}-${date}-${title}`.toLowerCase(),
        date,
        venue: config.venue,
        title,
        subtitle,
        genre: "",
        shows: showsByDate.get(date) || fallbackShows,
        price: priceValue ? `¥${priceValue}〜` : "公式サイトで確認",
        availability: reservable ? "予約受付中" : "公式サイトで確認",
        availabilityType: reservable ? "available" : "unknown",
        image,
        url: officialUrl,
        source: config.venueUrl,
      });
    });
  });

  return events;
}

async function scrapeClassicClub(config) {
  const months = monthSequence();
  const results = [];

  for (const month of months) {
    const response = await fetchWithTimeout(`${config.scheduleBase}${month.key}/`);
    const html = await response.text();
    results.push(...parseClubMonth(html, config, month));
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return results;
}

export function scrapeBlueNote() {
  return scrapeClassicClub({
    venue: "blue-note",
    venueUrl: venueDefinitions["blue-note"].url,
    scheduleBase: "https://reserve.bluenote.co.jp/reserve/schedule/move/",
    detailUrlPattern: /bluenote\.co\.jp\/jp\/artists\//,
  });
}

export function scrapeCottonClub() {
  return scrapeClassicClub({
    venue: "cotton-club",
    venueUrl: venueDefinitions["cotton-club"].url,
    scheduleBase: "https://reserve.cottonclubjapan.co.jp/reserve/schedule/move/",
    detailUrlPattern: /cottonclubjapan\.co\.jp\/jp\/(?:sp\/)?artists\//,
  });
}

function billboardStatus(status) {
  if (status === "soldOut") {
    return { availability: "SOLD OUT", availabilityType: "sold-out" };
  }
  if (status === "before_the_sales_begin") {
    return { availability: "販売開始前", availabilityType: "upcoming" };
  }
  if (status === "sale_end") {
    return { availability: "販売終了", availabilityType: "sold-out" };
  }
  return { availability: "予約受付中", availabilityType: "available" };
}

function billboardImage(event) {
  const image = event.images?.find((item) => item.image_type === 2) || event.images?.[0];
  if (!image) return "";
  return `https://www.billboard-live.com/public/event_img/${event.event_id}/top/${image.image_name}`;
}

function billboardPrice(event) {
  const prices = (event.block_settings || [])
    .map((item) => Number(item.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  if (!prices.length) return "公式サイトで確認";
  return `¥${Math.min(...prices).toLocaleString("ja-JP")}〜`;
}

export async function scrapeBillboard() {
  const firstMonth = monthSequence(1)[0];
  const startDate = localDateString(firstMonth.year, firstMonth.month, 1);
  const authResponse = await fetchWithTimeout(
    "https://www.billboard-live.com/api-proxy/auth/getencoded",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ public: 1080 }),
    },
  );
  const { encode } = await authResponse.json();
  if (!encode) throw new Error("Billboard authentication token was not returned");

  const scheduleResponse = await fetchWithTimeout(
    "https://www.billboard-live.com/api-front/v4/get_all_calendar_schedules",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: encode,
      },
      body: JSON.stringify({
        start_date: startDate,
        locations: ["tokyo"],
        response_type: 1,
        days: 184,
      }),
    },
  );
  const payload = await scheduleResponse.json();
  const scheduleGroups = payload.location_schedules?.[0]?.schedules || [];
  const events = [];

  scheduleGroups.forEach((group) => {
    (group.schedules || []).forEach((stages) => {
      if (!Array.isArray(stages) || !stages.length) return;
      const firstStage = stages[0];
      if (firstStage.holiday || !firstStage.play_date) return;

      const status = billboardStatus(firstStage.result_status);
      const shows = stages
        .map((stage) => cleanText(stage.play_start))
        .filter((time, index, all) => time && all.indexOf(time) === index);
      const subtitle = cleanText(
        (firstStage.event_names || []).slice(1).filter(Boolean).join(" "),
      );

      events.push({
        id: `billboard-${firstStage.event_id}-${firstStage.play_date}`,
        date: firstStage.play_date,
        venue: "billboard",
        title: cleanText(firstStage.event_names?.[0] || firstStage.title_name),
        subtitle,
        genre: cleanText(firstStage.event_genre),
        shows,
        price: billboardPrice(firstStage),
        ...status,
        image: billboardImage(firstStage),
        url: `https://www.billboard-live.com/tokyo/show?event_id=${encodeURIComponent(firstStage.event_id)}&date=${encodeURIComponent(firstStage.play_date)}`,
        source: venueDefinitions.billboard.url,
      });
    });
  });

  return events;
}

export const scrapers = {
  "blue-note": scrapeBlueNote,
  "cotton-club": scrapeCottonClub,
  billboard: scrapeBillboard,
};
