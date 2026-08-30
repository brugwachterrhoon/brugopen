const AUTO_REFRESH_SECONDS = 300;
const bridgeCards = new Map([...document.querySelectorAll("[data-bridge]")].map((card) => [card.dataset.bridge, card]));
const refreshButton = document.querySelector("#refreshButton");
const dashboardMessage = document.querySelector("#dashboardMessage");
const lastCheck = document.querySelector("#lastCheck");
const nextRefresh = document.querySelector("#nextRefresh");
const liveIndicator = document.querySelector("#liveIndicator");
let countdown = AUTO_REFRESH_SECONDS;
let dashboardBusy = false;

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "full",
  timeStyle: "medium",
  timeZone: "Europe/Amsterdam"
});

function updateClock() {
  document.querySelector("#clock").textContent = new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Amsterdam"
  }).format(new Date());
}

function statusLabel(status) {
  return {
    beschikbaar: "Beschikbaar",
    beperkt: "Beperkt",
    gestremd: "Gestremd",
    "geen-bediening": "Geen bediening",
    onbekend: "Onbekend"
  }[status] || "Onbekend";
}

function setCardLoading(card, loading) {
  card.classList.toggle("is-loading", loading);
  card.setAttribute("aria-busy", String(loading));
}

function text(element, value, fallback = "—") {
  if (!element) return;
  element.textContent = value && String(value).trim() ? value : fallback;
}

function isPinBasText(value = "") {
  const textValue = String(value || "");
  return /\b(?:PIN|BAS)\b/i.test(textValue) || /pin\.portofrotterdam\.com/i.test(textValue);
}

function renderSources(container, sources) {
  if (!container) return;
  container.replaceChildren();
  const visibleSources = (sources || []).filter((source) => {
    return !isPinBasText(source.title) && !isPinBasText(source.url);
  });
  for (const source of visibleSources.slice(0, 4)) {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = source.information_time ? `${source.title} · ${source.information_time}` : source.title;
    link.textContent = source.title || "Officiële bron";
    container.append(link);
  }
}

function tidyConditionBoxes(card) {
  const conditions = card.querySelector(".conditions");
  if (!conditions) return;

  for (const box of [...conditions.children]) {
    const label = box.querySelector("small")?.textContent?.trim() || box.textContent?.trim() || "";
    if (/^stroming\b/i.test(label) || /\bstroming\b/i.test(label)) box.remove();
  }

  const count = conditions.children.length;
  if (count > 0) conditions.style.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
}

function renderBridge(data) {
  const card = bridgeCards.get(data.id);
  if (!card) return;
  setCardLoading(card, false);

  const badge = card.querySelector(".status");
  badge.className = `status ${data.status || "onbekend"}`;
  badge.textContent = statusLabel(data.status);
  badge.title = data.status_text || "";

  text(card.querySelector(".next-opening"), data.next_opening, "Niet officieel vast te stellen");
  text(card.querySelector(".opening-type"), data.next_opening_type, "Geen officiële live data");
  text(card.querySelector(".water-label"), data.water_label, "Waterstand");
  text(card.querySelector(".water-value"), data.water_value);
  text(card.querySelector(".water-time"), data.water_time, "");
  text(card.querySelector(".wind-label"), data.wind_label, "Wind");
  text(card.querySelector(".wind-speed"), data.wind_speed);
  text(card.querySelector(".wind-direction"), data.wind_direction, "");
  text(card.querySelector(".wind-time"), data.wind_time, "");
  text(card.querySelector(".card-update"), data.opening_updated_at ? `Broninformatie: ${data.opening_updated_at}` : "Broninformatie: tijdstip niet vermeld");

  const notes = card.querySelector(".notes");
  notes.replaceChildren();
  const items = [data.status_text, ...(data.notes || [])]
    .filter(Boolean)
    .filter((note) => !isPinBasText(note));
  for (const note of [...new Set(items)].slice(0, 4)) {
    const li = document.createElement("li");
    li.textContent = note;
    notes.append(li);
  }

  renderSources(card.querySelector(".card-sources"), data.sources);
  tidyConditionBoxes(card);
}

function showDashboardError(message, checkedAt) {
  dashboardMessage.hidden = false;
  dashboardMessage.className = "dashboard-message error";
  dashboardMessage.textContent = `${message} Er worden geen tijden, waterstanden of windgegevens verzonnen.`;
  lastCheck.textContent = checkedAt ? `Mislukte controle: ${dateFormatter.format(new Date(checkedAt))}` : "Live controle mislukt";
  for (const card of bridgeCards.values()) setCardLoading(card, false);
}

async function loadDashboard() {
  if (dashboardBusy) return;
  dashboardBusy = true;
  refreshButton.disabled = true;
  refreshButton.classList.add("spinning");
  dashboardMessage.hidden = true;
  for (const card of bridgeCards.values()) setCardLoading(card, true);

  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || "Live dashboard kon niet worden opgehaald."), { checkedAt: data.checkedAt });

    for (const bridge of data.bridges || []) renderBridge(bridge);
    lastCheck.textContent = `Live gecontroleerd: ${dateFormatter.format(new Date(data.checkedAt))}`;
    dashboardMessage.hidden = false;
    dashboardMessage.className = "dashboard-message success";
    dashboardMessage.textContent = data.summary || "Live controle afgerond.";
    countdown = AUTO_REFRESH_SECONDS;
  } catch (error) {
    showDashboardError(error.message, error.checkedAt);
  } finally {
    dashboardBusy = false;
    refreshButton.disabled = false;
    refreshButton.classList.remove("spinning");
  }
}

function tickCountdown() {
  if (!dashboardBusy && countdown > 0) countdown -= 1;
  const minutes = Math.floor(countdown / 60);
  const seconds = String(countdown % 60).padStart(2, "0");
  nextRefresh.textContent = `Automatisch vernieuwen over ${minutes}:${seconds}`;
  if (countdown <= 0 && !dashboardBusy) loadDashboard();
}

refreshButton.addEventListener("click", () => {
  countdown = AUTO_REFRESH_SECONDS;
  loadDashboard();
});

async function checkHealth() {
  try {
    const response = await fetch("/health", { cache: "no-store" });
    const data = await response.json();
    liveIndicator.classList.toggle("online", data.liveSearchConfigured);
    liveIndicator.classList.toggle("offline", !data.liveSearchConfigured);
    liveIndicator.querySelector("span").textContent = data.liveSearchConfigured ? "Live zoeken actief" : "Configuratie nodig";
    if (data.liveSearchConfigured) loadDashboard();
    else showDashboardError("Live zoeken is nog niet geconfigureerd. Voeg de API-sleutel toe in het .env-bestand.", data.checkedAt);
  } catch {
    liveIndicator.classList.add("offline");
    liveIndicator.querySelector("span").textContent = "Server niet bereikbaar";
    showDashboardError("De server is niet bereikbaar.");
  }
}

const form = document.querySelector("#questionForm");
const input = document.querySelector("#question");
const submitButton = document.querySelector("#submitButton");
const loading = document.querySelector("#loading");
const result = document.querySelector("#result");
const answer = document.querySelector("#answer");
const resultTime = document.querySelector("#resultTime");
const resultSources = document.querySelector("#resultSources");

function renderQuestionSources(sources = []) {
  resultSources.replaceChildren();
  for (const source of sources) {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.title || source.url;
    resultSources.append(link);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  loading.hidden = false;
  result.hidden = true;
  submitButton.disabled = true;
  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || "Live informatie kon niet worden opgehaald."), { checkedAt: data.checkedAt });
    result.hidden = false;
    result.classList.remove("error");
    resultTime.textContent = `Live gecontroleerd: ${dateFormatter.format(new Date(data.checkedAt))}`;
    answer.textContent = data.text;
    renderQuestionSources(data.sources);
  } catch (error) {
    result.hidden = false;
    result.classList.add("error");
    resultTime.textContent = error.checkedAt ? `Controle: ${dateFormatter.format(new Date(error.checkedAt))}` : "Live controle mislukt";
    answer.textContent = `• ${error.message}\n• Er worden geen niet-geverifieerde gegevens getoond.`;
    renderQuestionSources([]);
  } finally {
    loading.hidden = true;
    submitButton.disabled = false;
  }
});

updateClock();
setInterval(updateClock, 1000);
setInterval(tickCountdown, 1000);
checkHealth();
document.querySelector("#year").textContent = new Date().getFullYear();
