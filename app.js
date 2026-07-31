const weekdayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const monthNames = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

const state = {
  events: [],
  venues: {},
  sources: {},
  updatedAt: null,
  activeVenue: "all",
  searchTerm: "",
  selectedDate: todayInTokyo(),
  visibleMonth: startOfMonth(todayInTokyo()),
  showWholeMonth: false,
};

const elements = {
  eventList: document.querySelector("#event-list"),
  eventTemplate: document.querySelector("#event-template"),
  todayGrid: document.querySelector("#today-grid"),
  todayTemplate: document.querySelector("#today-card-template"),
  dateStrip: document.querySelector("#date-strip"),
  miniCalendar: document.querySelector("#mini-calendar"),
  resultCount: document.querySelector("#result-count"),
  resultsDate: document.querySelector("#results-date"),
  monthDisplay: document.querySelector("#month-display"),
  searchInput: document.querySelector("#search-input"),
  filterButtons: [...document.querySelectorAll(".venue-filter")],
};

function todayInTokyo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function startOfMonth(value) {
  const date = parseLocalDate(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(value, amount) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount);
  return dateString(date);
}

function formatShortDate(value) {
  const date = parseLocalDate(value);
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")} ${weekdayNames[date.getDay()]}`;
}

function eventMatchesMonth(event) {
  const date = parseLocalDate(event.date);
  return (
    date.getFullYear() === state.visibleMonth.getFullYear() &&
    date.getMonth() === state.visibleMonth.getMonth()
  );
}

function filteredEvents() {
  const search = state.searchTerm.trim().toLocaleLowerCase("ja");

  return state.events
    .filter(eventMatchesMonth)
    .filter((event) => state.showWholeMonth || event.date === state.selectedDate)
    .filter((event) => state.activeVenue === "all" || event.venue === state.activeVenue)
    .filter((event) => {
      if (!search) return true;
      return [event.title, event.subtitle, event.genre, state.venues[event.venue]?.name]
        .join(" ")
        .toLocaleLowerCase("ja")
        .includes(search);
    })
    .sort((left, right) => {
      return (
        left.date.localeCompare(right.date) ||
        (left.shows?.[0] || "").localeCompare(right.shows?.[0] || "") ||
        left.title.localeCompare(right.title)
      );
    });
}

function setShowcaseImages() {
  const today = todayInTokyo();
  Object.entries(state.venues).forEach(([venueId, venue]) => {
    const panel = document.querySelector(`[data-showcase="${venueId}"]`);
    if (!panel) return;
    const event =
      state.events.find((item) => item.venue === venueId && item.date >= today && item.image) ||
      state.events.find((item) => item.venue === venueId && item.image);
    panel.href = venue.url;
    const image = panel.querySelector("img");
    if (event?.image) {
      image.src = event.image;
      image.alt = `${venue.name}の公演イメージ`;
    }
  });
}

function renderToday() {
  const today = todayInTokyo();
  const date = parseLocalDate(today);
  document.querySelector("#today-label").textContent = formatShortDate(today);
  elements.todayGrid.replaceChildren();

  const todayEvents = state.events.filter((event) => event.date === today);
  const featured = Object.keys(state.venues)
    .map((venue) => todayEvents.find((event) => event.venue === venue))
    .filter(Boolean);

  if (!featured.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = `${date.getMonth() + 1}月${date.getDate()}日の公演は登録されていません。`;
    elements.todayGrid.append(empty);
    return;
  }

  featured.forEach((event) => {
    const venue = state.venues[event.venue];
    const fragment = elements.todayTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".today-card");
    card.style.setProperty("--venue-color", venue.color);
    card.querySelector(".today-venue").textContent = venue.name;
    card.querySelector(".today-title").textContent = event.title;
    card.querySelector(".today-shows").textContent =
      event.shows?.map((time, index) => `${time} ${index + 1}${ordinal(index + 1)}`).join(" / ") ||
      "開演時刻は公式サイトで確認";

    const imageLink = card.querySelector(".today-image");
    imageLink.href = event.url;
    const image = imageLink.querySelector("img");
    image.src = event.image;
    image.alt = event.title;
    card.querySelector(".card-arrow").href = event.url;
    elements.todayGrid.append(fragment);
  });
}

function ordinal(number) {
  if (number === 1) return "st Stage";
  if (number === 2) return "nd Stage";
  if (number === 3) return "rd Stage";
  return "th Stage";
}

function renderDateStrip() {
  elements.dateStrip.replaceChildren();
  const centerDate = state.selectedDate;
  const start = addDays(centerDate, -3);

  for (let index = 0; index < 7; index += 1) {
    const value = addDays(start, index);
    const date = parseLocalDate(value);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-button";
    button.dataset.date = value;
    if (!state.showWholeMonth && value === state.selectedDate) button.classList.add("is-active");
    if (date.getDay() === 0 || date.getDay() === 6) button.classList.add("is-weekend");
    button.innerHTML = `<span>${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}</span>${weekdayNames[date.getDay()]}`;
    button.addEventListener("click", () => selectDate(value));
    elements.dateStrip.append(button);
  }
}

function renderCalendar() {
  elements.miniCalendar.replaceChildren();
  elements.monthDisplay.textContent = `${state.visibleMonth.getFullYear()}.${String(
    state.visibleMonth.getMonth() + 1,
  ).padStart(2, "0")}`;

  ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].forEach((weekday) => {
    const label = document.createElement("span");
    label.className = "calendar-weekday";
    label.textContent = weekday;
    elements.miniCalendar.append(label);
  });

  const firstWeekday = state.visibleMonth.getDay();
  const daysInMonth = new Date(
    state.visibleMonth.getFullYear(),
    state.visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const eventDates = new Set(state.events.filter(eventMatchesMonth).map((event) => event.date));

  for (let blank = 0; blank < firstWeekday; blank += 1) {
    const placeholder = document.createElement("button");
    placeholder.className = "calendar-day";
    placeholder.disabled = true;
    elements.miniCalendar.append(placeholder);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = dateString(
      new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth(), day),
    );
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.textContent = day;
    button.dataset.date = value;
    if (!state.showWholeMonth && value === state.selectedDate) button.classList.add("is-active");
    if (eventDates.has(value)) button.classList.add("has-events");
    button.addEventListener("click", () => selectDate(value));
    elements.miniCalendar.append(button);
  }
}

function updateCounts() {
  const scopeEvents = state.events
    .filter(eventMatchesMonth)
    .filter((event) => state.showWholeMonth || event.date === state.selectedDate);
  document.querySelector("#count-all").textContent = scopeEvents.length;

  Object.keys(state.venues).forEach((venueId) => {
    const count = scopeEvents.filter((event) => event.venue === venueId).length;
    const element = document.querySelector(`#count-${venueId}`);
    if (element) element.textContent = count;
  });
}

function createEventRow(event) {
  const venue = state.venues[event.venue];
  const fragment = elements.eventTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".event-row");
  row.style.setProperty("--venue-color", venue.color);
  const eventTime = row.querySelector(".event-time");
  const shows = event.shows?.filter(Boolean) || [];
  if (shows.length) {
    shows.forEach((time, index) => {
      const show = document.createElement("span");
      show.className = "event-show";

      if (shows.length > 1) {
        const label = document.createElement("small");
        label.className = "event-show-label";
        label.textContent = `${index + 1}${ordinal(index + 1).split(" ")[0]}`;
        show.append(label);
      }

      show.append(document.createTextNode(time));
      eventTime.append(show);
    });
  } else {
    eventTime.textContent = "--:--";
  }
  row.querySelector(".venue-name").textContent = venue.shortName;
  row.querySelector(".event-title").textContent = event.title;
  row.querySelector(".event-subtitle").textContent = event.subtitle || event.genre;
  row.querySelector(".event-price").textContent = event.price;

  const availability = row.querySelector(".availability");
  availability.textContent = event.availability;
  availability.classList.add(`is-${event.availabilityType}`);

  const imageLink = row.querySelector(".event-image");
  imageLink.href = event.url;
  const image = imageLink.querySelector("img");
  image.src = event.image;
  image.alt = event.title;

  const detailLink = row.querySelector(".event-link");
  detailLink.href = event.url;
  detailLink.setAttribute("aria-label", `${event.title}の公式詳細を見る`);
  return fragment;
}

function renderEvents() {
  const events = filteredEvents();
  elements.eventList.replaceChildren();
  elements.resultCount.textContent = `${events.length} performances`;

  if (state.showWholeMonth) {
    elements.resultsDate.textContent = `${state.visibleMonth.getFullYear()}.${String(
      state.visibleMonth.getMonth() + 1,
    ).padStart(2, "0")} / ALL DATES`;
  } else {
    const date = parseLocalDate(state.selectedDate);
    elements.resultsDate.textContent = `${state.selectedDate.replaceAll("-", ".")} ${
      weekdayNames[date.getDay()]
    }`;
  }

  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "条件に一致する公演がありません。";
    elements.eventList.append(empty);
    return;
  }

  let currentDate = "";
  events.forEach((event) => {
    if (state.showWholeMonth && currentDate !== event.date) {
      currentDate = event.date;
      const heading = document.createElement("div");
      heading.className = "event-date-heading";
      heading.textContent = formatShortDate(event.date);
      elements.eventList.append(heading);
    }
    elements.eventList.append(createEventRow(event));
  });
}

function renderStatus() {
  const updated = state.updatedAt
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(state.updatedAt))
    : "未取得";
  document.querySelector("#data-status-text").textContent = `最終更新 ${updated}`;

  document.querySelector("#source-status").textContent = Object.entries(state.sources)
    .map(([venue, source]) => `${state.venues[venue]?.shortName}: ${source.ok ? "OK" : "CACHE"}`)
    .join(" / ");
}

function render() {
  renderDateStrip();
  renderCalendar();
  updateCounts();
  renderEvents();
}

function selectDate(value) {
  state.selectedDate = value;
  state.visibleMonth = startOfMonth(value);
  state.showWholeMonth = false;
  render();
}

function changeMonth(amount) {
  state.visibleMonth = new Date(
    state.visibleMonth.getFullYear(),
    state.visibleMonth.getMonth() + amount,
    1,
  );
  state.selectedDate = dateString(state.visibleMonth);
  state.showWholeMonth = true;
  render();
}

async function loadSchedule() {
  try {
    const response = await fetch("./data/events.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Schedule request failed: ${response.status}`);
    const payload = await response.json();
    state.events = payload.events || [];
    state.venues = payload.venues || {};
    state.sources = payload.sources || {};
    state.updatedAt = payload.updatedAt;

    const today = todayInTokyo();
    const hasCurrentMonth = state.events.some((event) => event.date.slice(0, 7) === today.slice(0, 7));
    if (!hasCurrentMonth && state.events.length) {
      state.selectedDate = state.events[0].date;
      state.visibleMonth = startOfMonth(state.selectedDate);
    }

    setShowcaseImages();
    renderToday();
    renderStatus();
    render();
  } catch (error) {
    console.error(error);
    elements.todayGrid.innerHTML =
      '<div class="empty-state">公演データを読み込めませんでした。</div>';
    elements.eventList.innerHTML =
      '<div class="empty-state">サーバーを起動して再度お試しください。</div>';
    document.querySelector("#data-status-text").textContent = "データ取得エラー";
  }
}

document.querySelector("#prev-month").addEventListener("click", () => changeMonth(-1));
document.querySelector("#next-month").addEventListener("click", () => changeMonth(1));
document.querySelector("#previous-day").addEventListener("click", () =>
  selectDate(addDays(state.selectedDate, -1)),
);
document.querySelector("#next-day").addEventListener("click", () =>
  selectDate(addDays(state.selectedDate, 1)),
);
document.querySelector("#show-month").addEventListener("click", () => {
  state.showWholeMonth = true;
  render();
});

elements.filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.activeVenue = button.dataset.venue;
    elements.filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  });
});

elements.searchInput.addEventListener("input", (event) => {
  state.searchTerm = event.target.value;
  renderEvents();
});

const siteHeader = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-button");
menuButton.addEventListener("click", () => {
  const isOpen = siteHeader.classList.toggle("is-menu-open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", isOpen ? "メニューを閉じる" : "メニューを開く");
});

document.querySelectorAll(".header-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    siteHeader.classList.remove("is-menu-open");
    menuButton.setAttribute("aria-expanded", "false");
  });
});

document.querySelector("#copyright-year").textContent = new Date().getFullYear();
loadSchedule();
