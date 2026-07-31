import { writeFile } from "node:fs/promises";

const response = await fetch("http://127.0.0.1:9222/json/list");
const [target] = await response.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
const browserErrors = [];

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }

  if (message.method === "Runtime.exceptionThrown") {
    browserErrors.push(message.params.exceptionDetails.text);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result.value;
}

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});

const loaded = new Promise((resolve) => {
  const listener = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Page.loadEventFired") {
      socket.removeEventListener("message", listener);
      resolve();
    }
  };
  socket.addEventListener("message", listener);
});

await send("Page.navigate", { url: "http://127.0.0.1:4173/" });
await loaded;
await new Promise((resolve) => setTimeout(resolve, 500));

const initial = await evaluate(`(() => ({
  title: document.title,
  cards: document.querySelectorAll(".event-card").length,
  resultCount: document.querySelector("#result-count").textContent,
  viewportWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
  menuButtonVisible: getComputedStyle(document.querySelector(".menu-button")).display !== "none",
  monthButtonVisible:
    getComputedStyle(document.querySelector("#show-month")).display !== "none",
  todayCards: document.querySelectorAll(".today-card").length,
  sourceStatus: document.querySelector("#source-status").textContent
}))()`);

const menu = await evaluate(`(() => {
  const button = document.querySelector(".menu-button");
  button.click();
  return {
    expanded: button.getAttribute("aria-expanded"),
    navDisplay: getComputedStyle(document.querySelector(".header-nav")).display
  };
})()`);

const monthView = await evaluate(`(() => {
  const selectedDate = document.querySelector(".date-button.is-active").dataset.date;
  document.querySelector("#show-month").click();
  const result = {
    heading: document.querySelector("#results-date").textContent,
    cards: document.querySelectorAll(".event-card").length
  };
  document.querySelector('.date-button[data-date="' + selectedDate + '"]').click();
  return result;
})()`);

const cottonClub = await evaluate(`(() => {
  document.querySelector('[data-venue="cotton-club"]').click();
  return {
    cards: document.querySelectorAll(".event-card").length,
    resultCount: document.querySelector("#result-count").textContent
  };
})()`);

const search = await evaluate(`(() => {
  const input = document.querySelector("#search-input");
  input.value = "相田翔子";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return {
    cards: document.querySelectorAll(".event-card").length,
    title: document.querySelector(".event-title")?.textContent
  };
})()`);

const nextMonth = await evaluate(`(() => {
  document.querySelector('[data-venue="all"]').click();
  const input = document.querySelector("#search-input");
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("#next-month").click();
  return {
    month: document.querySelector("#month-display").textContent,
    cards: document.querySelectorAll(".event-card").length,
    resultCount: document.querySelector("#result-count").textContent
  };
})()`);

await evaluate(`(() => {
  if (document.querySelector(".menu-button").getAttribute("aria-expanded") === "true") {
    document.querySelector(".menu-button").click();
  }
  document.querySelector("#prev-month").click();
  window.scrollTo(0, 0);
})()`);

const screenshot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
});
await writeFile("mobile.png", Buffer.from(screenshot.data, "base64"));

await send("Emulation.setDeviceMetricsOverride", {
  width: 1200,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

const desktop = await evaluate(`(() => ({
  menuButtonVisible: getComputedStyle(document.querySelector(".menu-button")).display !== "none",
  monthButtonVisible: getComputedStyle(document.querySelector("#show-month")).display !== "none"
}))()`);

const results = { initial, menu, monthView, cottonClub, search, nextMonth, desktop, browserErrors };
console.log(JSON.stringify(results, null, 2));

const passed =
  initial.title.includes("LIVE SCHEDULE") &&
  initial.cards === 3 &&
  initial.resultCount === "3 performances" &&
  initial.viewportWidth === 390 &&
  initial.scrollWidth === 390 &&
  initial.menuButtonVisible &&
  initial.monthButtonVisible &&
  initial.todayCards === 3 &&
  initial.sourceStatus.includes("Blue Note: OK") &&
  menu.expanded === "true" &&
  menu.navDisplay === "flex" &&
  monthView.heading.endsWith("/ ALL DATES") &&
  monthView.cards >= initial.cards &&
  cottonClub.cards === 1 &&
  cottonClub.resultCount === "1 performances" &&
  search.cards === 1 &&
  search.title.includes("相田翔子") &&
  nextMonth.month === "2026.07" &&
  nextMonth.cards > 0 &&
  nextMonth.resultCount.endsWith("performances") &&
  !desktop.menuButtonVisible &&
  desktop.monthButtonVisible &&
  browserErrors.length === 0;

socket.close();
if (!passed) process.exitCode = 1;
