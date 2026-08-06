import http from "node:http";
import { gunzipSync } from "node:zlib";

const PORT = Number(process.env.PORT || 3000);
const FEED_URL =
  process.env.NDW_FEED_URL ||
  "https://opendata.ndw.nu/planningsfeed_brugopeningen.xml.gz";
const WATER_API_URL =
  process.env.RWS_WATER_API_URL ||
  "https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenLaatsteWaarnemingen";
const WATER_SOURCE_URL = "https://waterinfo.rws.nl/";
const WIND_WFS_URL =
  process.env.RWS_WIND_WFS_URL ||
  "https://geo.rijkswaterstaat.nl/services/ogc/hws/DDAPI20/ows";
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 300000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 20000);
const REFRESH_SECRET = process.env.REFRESH_SECRET || "";
const TIME_ZONE = "Europe/Amsterdam";
const WIND_SOURCE_URL = WATER_SOURCE_URL;
const BAS_API_URL =
  process.env.BAS_API_URL ||
  "https://www.vaarweginformatie.nl/frp/api/messages/nts/messagesIncludingChildren/";
const BAS_SOURCE_URL = "https://www.vaarweginformatie.nl/frp/nts/list";

const WIND_LOCATION_FALLBACKS = {
  "botlekbrug": [
    "botlek.oudemaas.botlekbrug", "botlek.oudemaas", "hoogvliet",
    "spijkenisse.oudemaas.brug", "spijkenisse.oudemaas", "rotterdam.geulhaven"
  ],
  "spijkenisserbrug": [
    "spijkenisse.oudemaas.brug", "spijkenisse.oudemaas", "hoogvliet", "botlek.oudemaas.botlekbrug"
  ],
  "brug-over-de-noord": ["alblasserdam", "papendrecht", "dordrecht.wantij", "dordrecht.wantij.west"],
  "papendrechtsebrug": [
    "papendrecht", "papendrecht.benedenmerwede", "dordrecht.wantij",
    "dordrecht.wantij.west", "alblasserdam"
  ],
  "hartelbrug": [
    "europoort.hartelbrug", "hartelkanaal.vak81", "botlek.hartelkering.binnen",
    "botlek.oudemaas.botlekbrug", "hoogvliet"
  ],
  "wantijbrug": ["dordrecht.wantij", "dordrecht.wantij.west", "papendrecht", "alblasserdam"],
  "van-brienenoordbrug": [
    "rotterdam.vanbrienenoordbrug", "rotterdam.brienenoordbrug", "brienenoord", "rotterdam"
  ],
  "calandbrug": [
    "botlek.rozenburgsesluis.calandkanaal", "europoort.calandkanaal.3",
    "calandkanaal.vakc2", "calandkanaal.vak90"
  ],
  "merwedebrug-gorinchem": ["bovenmerwede", "gorinchem", "gorinchembinnen", "werkendam"]
};

const BRIDGES = [
  {
    id: "botlekbrug",
    windAlertAboveBft: 8,
    name: "Botlekbrug",
    short: "A15 · Oude Maas",
    isrs: "NLRTM001110888700281",
    vndsId: 17838816,
    scheduleType: "botlek",
    latitude: 51.867,
    longitude: 4.3428,
    waterLocations: ["botlek.oudemaas.botlekbrug", "botlek.oudemaas", "hoogvliet", "spijkenisse.oudemaas.brug", "spijkenisse.oudemaas"],
    waterLocationLabel: "Botlek Oude Maas",
    scheduleText: "Vaste mogelijkheden om :15 en :45. Op werkdagen niet voor pleziervaart tijdens 06:30–09:30 en 15:30–18:30.",
    professionalText: "Voor beroepsvaart kunnen andere voorwaarden gelden.",
    scheduleSource: "https://www.rijkswaterstaat.nl/wegen/projectenoverzicht/a15-botlekbrug-nieuwe-verbinding-weg-en-goederenspoorverkeer-scheepvaart-en-bromfietsers/hinder-en-maatregelen/scheepvaart"
  },
  {
    id: "spijkenisserbrug",
    windAlertAboveBft: 8,
    name: "Spijkenisserbrug",
    short: "S102 · Oude Maas",
    isrs: "NLSPI001110572700266",
    vndsId: 42792,
    scheduleType: "spijkenisse",
    latitude: 51.845,
    longitude: 4.331,
    waterLocations: ["spijkenisse.oudemaas.brug", "spijkenisse.oudemaas"],
    waterLocationLabel: "Spijkenisse Oude Maas",
    scheduleText: "Vaste mogelijkheid op het halve uur. Op werkdagen niet voor pleziervaart tijdens 06:30–09:30 en 15:30–18:30.",
    professionalText: "Voor beroepsvaart kunnen andere voorwaarden gelden.",
    scheduleSource: "https://www.rijkswaterstaat.nl/wegen/projectenoverzicht/a15-botlekbrug-nieuwe-verbinding-weg-en-goederenspoorverkeer-scheepvaart-en-bromfietsers/hinder-en-maatregelen/scheepvaart"
  },
  {
    id: "brug-over-de-noord",
    windAlertAboveBft: 5,
    name: "Brug over de Noord",
    short: "Alblasserdamsebrug · N915",
    isrs: "NLHIA001010577301210",
    vndsId: 43523,
    scheduleType: "alblasserdam",
    latitude: 51.8544,
    longitude: 4.6586,
    waterLocations: ["alblasserdam"],
    waterLocationLabel: "Alblasserdam",
    scheduleText: "Zomerregeling met vaste pleziervaartmomenten; de twee eerstvolgende worden hierboven getoond.",
    professionalText: "Beroepsvaart kan extra of afwijkende bediening hebben.",
    scheduleSource: "https://www.vaarweginformatie.nl/frp/geo/detail/BRIDGE/43523"
  },
  {
    id: "papendrechtsebrug",
    windAlertAboveBft: 6,
    name: "Papendrechtsebrug",
    short: "Merwedebrug · N3",
    isrs: "NLDOR001010577001143",
    vndsId: 47519,
    scheduleType: "papendrecht",
    latitude: 51.8174,
    longitude: 4.7041,
    waterLocations: ["papendrecht", "papendrecht.benedenmerwede", "dordrecht.oudemaas.benedenmerwede"],
    waterLocationLabel: "Beneden-Merwede bij Papendrecht",
    audienceLabel: "Gewijzigde bediening",
    displayMode: "notice",
    timingTitle: "Gewijzigde bedientijden",
    timingMain: "Geen reguliere bediening",
    timingSub: "Hoge scheepvaart: alleen aangekondigde maandelijkse passages · minimaal 5 dagen vooraf aanmelden",
    specialPassages: [
      { start: "2026-08-08T10:00:00+02:00", end: "2026-08-08T15:00:00+02:00" },
      { start: "2026-09-05T10:00:00+02:00", end: "2026-09-05T15:00:00+02:00" },
      { start: "2026-10-10T10:00:00+02:00", end: "2026-10-10T15:00:00+02:00" },
      { start: "2026-11-07T10:00:00+01:00", end: "2026-11-07T15:00:00+01:00" },
      { start: "2026-12-05T10:00:00+01:00", end: "2026-12-05T15:00:00+01:00" },
      { start: "2026-12-19T10:00:00+01:00", end: "2026-12-19T15:00:00+01:00" },
      { start: "2027-01-16T10:00:00+01:00", end: "2027-01-16T15:00:00+01:00" },
      { start: "2027-02-06T10:00:00+01:00", end: "2027-02-06T15:00:00+01:00" },
      { start: "2027-03-21T10:00:00+01:00", end: "2027-03-21T15:00:00+01:00" },
      { start: "2027-04-21T10:00:00+02:00", end: "2027-04-21T15:00:00+02:00" }
    ],
    scheduleText: "Geen reguliere bediening tijdens de renovatie. Lage scheepvaart kan onder het vaste deel door, behalve tijdens afzonderlijk gemelde stremmingen.",
    professionalText: "Hoge scheepvaart: gewijzigde bediening tot en met 31 augustus 2027; circa 1 aangekondigde passage per maand en minimaal 5 dagen vooraf aanmelden bij Verkeerspost Dordrecht.",
    scheduleSource: "https://www.vaarweginformatie.nl/frp/geo/detail/BRIDGE/47519"
  },
  {
    id: "hartelbrug",
    windAlertAboveBft: 7,
    name: "Hartelbrug",
    short: "N218 · Hartelkanaal",
    isrs: "NLRTM0115B5487800010",
    vndsId: 23888,
    scheduleType: "hartel",
    latitude: 51.8756,
    longitude: 4.2258,
    waterLocations: ["europoort.hartelbrug", "hartelkanaal.vak81", "botlek.hartelkering.binnen"],
    waterLocationLabel: "Hartelkanaal bij Hartelbrug",
    scheduleText: "24 uur op afroep, minimaal 2 uur vooraf. Werkdagen niet tijdens 06:45–08:30 en 16:00–18:30.",
    professionalText: "Dezelfde afroepregeling; geen afzonderlijke tweede mogelijkheid weergegeven.",
    scheduleSource: "https://www.vaarweginformatie.nl/"
  },
  {
    id: "wantijbrug",
    windAlertAboveBft: 6,
    name: "Wantijbrug",
    short: "N3 · Dordrecht",
    isrs: "NLDOR001100553200025",
    vndsId: 10519,
    scheduleType: "wantij",
    latitude: 51.8087,
    longitude: 4.6915,
    waterLocations: ["dordrecht.wantij", "dordrecht.wantij.west", "dordrecht.oudemaas.benedenmerwede"],
    waterLocationLabel: "Wantij nabij Dordrecht",
    scheduleText: "Zomer: werkdagen 09:30–15:30 en 18:30–22:00; weekend 09:30–22:00. Bij aanvraag of aanbod.",
    professionalText: "Beroepsvaart kan binnen dezelfde vensters voorrang hebben.",
    scheduleSource: "https://www.vaarweginformatie.nl/"
  },
  {
    id: "van-brienenoordbrug",
    windAlertAboveBft: 5,
    name: "Van Brienenoordbrug",
    short: "A16 · Nieuwe Maas",
    isrs: "NLRTM001020374200058",
    vndsId: 4308,
    scheduleType: "brienenoord",
    latitude: 51.902828,
    longitude: 4.542261,
    waterLocations: [
      "rotterdam.vanbrienenoordbrug",
      "rotterdam.brienenoordbrug",
      "brienenoord",
      "rotterdam.nieuwemaas.boompjes",
      "rotterdam.nieuwemaas.boerengat",
      "oudijsselmonde.oost.nieuwemaas",
      "oudijsselmonde.west.nieuwemaas",
      "beverwaard.nieuwemaas"
    ],
    waterLocationLabel: "Nieuwe Maas bij Brienenoord",
    audienceLabel: "Geen pleziervaart",
    showNightPassage: false,
    displayMode: "notice",
    timingTitle: "Pleziervaart",
    timingMain: "Geen bediening",
    timingSub: "De Van Brienenoordbrug wordt niet geopend voor pleziervaart",
    scheduleText: "Geen bediening voor pleziervaart.",
    professionalText: "Op afroep 11:00–11:10, 14:00–14:10 en 19:30–19:40. Nacht 00:00–06:00 alleen na minimaal 12 uur vooraf aanvragen en goedkeuring; tussen 21:00–06:00 minimaal 1 uur tussen openingen.",
    scheduleSource: "https://www.vaarweginformatie.nl/"
  },
  {
    id: "calandbrug",
    windAlertAboveBft: 8,
    name: "Calandbrug",
    short: "N15 · Calandkanaal",
    isrs: "NLRTM001164917000018",
    vndsId: 61127240,
    scheduleType: "caland",
    latitude: 51.9013,
    longitude: 4.2269,
    waterLocations: [
      "botlek.rozenburgsesluis.calandkanaal",
      "rozenburgsesluis.noordzijde",
      "rozenburgsesluis.zuidzijde",
      "europoort.calandkanaal.3",
      "europoort.calandkanaal.2",
      "calandkanaal.vakc2",
      "calandkanaal.vak90",
      "botlek.rozenburgsesluis.hartelkanaal"
    ],
    waterLocationLabel: "Calandkanaal bij Calandbrug",
    audienceLabel: "Geen pleziervaart",
    showNightPassage: false,
    displayMode: "notice",
    timingTitle: "Pleziervaart",
    timingMain: "Geen bediening",
    timingSub: "De Calandbrug wordt niet geopend voor pleziervaart",
    scheduleText: "Geen bediening voor pleziervaart.",
    professionalText: "Dagelijks 00:00–23:59 op afroep. Verzoek circa 20 minuten vóór passage via VHF 22. Bediening tot en met gemiddeld 20,7 m/s wind (indicatief 8 Bft).",
    scheduleSource: "https://www.vaarweginformatie.nl/"
  },
  {
    id: "merwedebrug-gorinchem",
    windAlertAboveBft: 5,
    name: "Merwedebrug Gorinchem",
    short: "A27 · Boven-Merwede",
    isrs: "NLGOR001010576200973",
    vndsId: 23300,
    scheduleType: "gorinchem",
    latitude: 51.823736,
    longitude: 4.96924,
    waterLocations: ["bovenmerwede", "gorinchem", "gorinchembinnen", "werkendam"],
    waterLocationLabel: "Boven-Merwede bij Gorinchem",
    scheduleText: "Tot 17 augustus 2026 20:00 geen bediening. Daarna: werkdagen 20:00; weekend 11:00, 13:00 en in juli/augustus ook 14:00.",
    professionalText: "Nachtvensters zijn bij aanbod; op werkdagen minimaal 24 uur vooraf melden. Niet als vaste pleziervaarttijd getoond.",
    scheduleSource: "https://www.vaarweginformatie.nl/frp/geo/detail/BRIDGE/23300"
  }
];

let state = {
  data: null,
  lastSuccessAt: null,
  lastAttemptAt: null,
  error: null,
  refreshing: null
};

const zoneFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23"
});

function zonedParts(date) {
  const values = Object.fromEntries(
    zoneFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: values.weekday
  };
}

function timeZoneOffsetMs(date) {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function localDateToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  let result = wallClock - timeZoneOffsetMs(new Date(wallClock));
  result = wallClock - timeZoneOffsetMs(new Date(result));
  return new Date(result);
}

function addLocalDays(parts, days) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function dayOfWeek(localDate) {
  return new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day)).getUTCDay();
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function dateKey(date) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function shiftedDate(date, days) {
  return addLocalDays(date, days);
}

function isDutchHoliday(date) {
  const key = dateKey(date);
  const easter = easterSunday(date.year);
  const dates = new Set([
    `${date.year}-01-01`,
    `${date.year}-04-27`,
    `${date.year}-05-05`,
    `${date.year}-12-25`,
    `${date.year}-12-26`,
    dateKey(shiftedDate(easter, -2)),
    dateKey(easter),
    dateKey(shiftedDate(easter, 1)),
    dateKey(shiftedDate(easter, 39)),
    dateKey(shiftedDate(easter, 49)),
    dateKey(shiftedDate(easter, 50))
  ]);
  return dates.has(key);
}

function isWeekendOrHoliday(date) {
  const dow = dayOfWeek(date);
  return dow === 0 || dow === 6 || isDutchHoliday(date);
}

function candidate(localDate, hour, minute) {
  return localDateToUtc({ ...localDate, hour, minute, second: 0 });
}

function futureCandidates(now, builder, days = 14) {
  const current = zonedParts(now);
  const values = [];
  for (let offset = 0; offset < days; offset += 1) {
    const localDate = addLocalDays(current, offset);
    for (const [hour, minute] of builder(localDate)) {
      const instant = candidate(localDate, hour, minute);
      if (instant.getTime() > now.getTime() + 15000) values.push(instant);
    }
  }
  values.sort((a, b) => a - b);
  return values;
}

function fixedQuarterTimes(localDate) {
  const weekend = isWeekendOrHoliday(localDate);
  const values = [];
  for (let hour = 6; hour < 22; hour += 1) {
    for (const minute of [15, 45]) {
      const total = hour * 60 + minute;
      if (total < 6 * 60 + 30 || total >= 22 * 60) continue;
      if (!weekend) {
        const morningBan = total >= 6 * 60 + 30 && total < 9 * 60 + 30;
        const eveningBan = total >= 15 * 60 + 30 && total < 18 * 60 + 30;
        if (morningBan || eveningBan) continue;
      }
      values.push([hour, minute]);
    }
  }
  return values;
}

function spijkenisseTimes(localDate) {
  const weekend = isWeekendOrHoliday(localDate);
  const values = [];
  for (let hour = 6; hour < 22; hour += 1) {
    const minute = 30;
    if (!weekend) {
      const total = hour * 60 + minute;
      const morningBan = total >= 6 * 60 + 30 && total < 9 * 60 + 30;
      const eveningBan = total >= 15 * 60 + 30 && total < 18 * 60 + 30;
      if (morningBan || eveningBan) continue;
    }
    values.push([hour, minute]);
  }
  return values;
}

function alblasserdamTimes(localDate) {
  const summer = localDate.month >= 6 && localDate.month <= 10;
  if (!summer) return [];
  const weekend = isWeekendOrHoliday(localDate);
  const base = [[10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [16, 0]];
  return weekend
    ? [[9, 0], ...base, [15, 0], [18, 0]]
    : [[9, 15], ...base, [18, 15]];
}

function gorinchemTimes(localDate) {
  const key = dateKey(localDate);
  if (key < "2026-08-17" || key > "2027-12-31") return [];
  const weekend = isWeekendOrHoliday(localDate);
  if (!weekend) return [[20, 0]];
  const values = [[11, 0], [13, 0]];
  if (localDate.month === 7 || localDate.month === 8) values.push([14, 0]);
  return values;
}

function calandOpportunity(now) {
  return new Date(now.getTime() + 20 * 60 * 1000);
}

function nextWindowOpportunity(now, windowsBuilder, labelWhenOpen = "Nu binnen bedientijd") {
  const current = zonedParts(now);
  for (let offset = 0; offset < 14; offset += 1) {
    const localDate = addLocalDays(current, offset);
    const windows = windowsBuilder(localDate);
    for (const [startHour, startMinute, endHour, endMinute] of windows) {
      const start = candidate(localDate, startHour, startMinute);
      const end = candidate(localDate, endHour, endMinute);
      if (now >= start && now < end) {
        return { instant: now, nowPossible: true, label: labelWhenOpen };
      }
      if (start > now) return { instant: start, nowPossible: false, label: "Volgende bedienmogelijkheid" };
    }
  }
  return null;
}

function hartelOpportunity(now) {
  const minimum = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const parts = zonedParts(minimum);
  const localDate = { year: parts.year, month: parts.month, day: parts.day };
  if (isWeekendOrHoliday(localDate)) {
    return { instant: minimum, nowPossible: false, label: "Mogelijk na 2 uur voormelding" };
  }
  const total = parts.hour * 60 + parts.minute;
  if (total >= 6 * 60 + 45 && total < 8 * 60 + 30) {
    return { instant: candidate(localDate, 8, 30), nowPossible: false, label: "Na spits en 2 uur voormelding" };
  }
  if (total >= 16 * 60 && total < 18 * 60 + 30) {
    return { instant: candidate(localDate, 18, 30), nowPossible: false, label: "Na spits en 2 uur voormelding" };
  }
  return { instant: minimum, nowPossible: false, label: "Mogelijk na 2 uur voormelding" };
}

function scheduleOpportunity(bridge, now = new Date()) {
  if (bridge.scheduleType === "botlek") {
    const instant = futureCandidates(now, fixedQuarterTimes)[0] ?? null;
    return { instant, label: "Volgende vaste mogelijkheid", state: "fixed" };
  }
  if (bridge.scheduleType === "spijkenisse") {
    const instant = futureCandidates(now, spijkenisseTimes)[0] ?? null;
    return { instant, label: "Volgende vaste mogelijkheid", state: "fixed" };
  }
  if (bridge.scheduleType === "alblasserdam") {
    const instant = futureCandidates(now, alblasserdamTimes, 370)[0] ?? null;
    return {
      instant,
      label: instant ? "Volgende vaste mogelijkheid" : "Geen vaste zomertijd gevonden",
      state: instant ? "fixed" : "none"
    };
  }
  if (bridge.scheduleType === "brienenoord") {
    return { instant: null, label: "Pleziervaart: minimaal 12 uur vooraf aanvragen", state: "request" };
  }
  if (bridge.scheduleType === "caland") {
    return { instant: calandOpportunity(now), label: "Op afroep na circa 20 minuten", state: "request" };
  }
  if (bridge.scheduleType === "gorinchem") {
    const instant = futureCandidates(now, gorinchemTimes, 550)[0] ?? null;
    return {
      instant,
      label: instant ? "Eerstvolgende dagmogelijkheid" : "Geen dagmogelijkheid in de huidige regeling",
      state: instant ? "fixed" : "closed"
    };
  }
  if (bridge.scheduleType === "papendrecht") {
    return { instant: null, label: "Geen vaste bediening", state: "closed" };
  }
  if (bridge.scheduleType === "hartel") {
    return { ...hartelOpportunity(now), state: "request" };
  }
  if (bridge.scheduleType === "wantij") {
    const result = nextWindowOpportunity(now, (localDate) => {
      const weekend = isWeekendOrHoliday(localDate);
      return weekend
        ? [[9, 30, 22, 0]]
        : [[9, 30, 15, 30], [18, 30, 22, 0]];
    }, "Nu mogelijk bij aanvraag/aanbod");
    return result
      ? { ...result, state: "window" }
      : { instant: null, label: "Geen bedientijd gevonden", state: "none" };
  }
  return { instant: null, label: "Onbekend", state: "none" };
}


function windowOpportunityList(now, windowsBuilder, days = 14) {
  const current = zonedParts(now);
  const values = [];
  let currentWindow = null;
  for (let offset = 0; offset < days; offset += 1) {
    const localDate = addLocalDays(current, offset);
    for (const [startHour, startMinute, endHour, endMinute] of windowsBuilder(localDate)) {
      const start = candidate(localDate, startHour, startMinute);
      const end = candidate(localDate, endHour, endMinute);
      if (!currentWindow && now >= start && now < end) currentWindow = now;
      if (start > now) values.push(start);
    }
  }
  values.sort((a, b) => a - b);
  return currentWindow ? [currentWindow, ...values] : values;
}

function scheduleOpportunities(bridge, now = new Date()) {
  if (bridge.scheduleType === "botlek") {
    const values = futureCandidates(now, fixedQuarterTimes);
    return {
      first: values[0] ?? null,
      following: values[1] ?? null,
      label: "Vaste bedienmogelijkheid",
      state: "fixed"
    };
  }
  if (bridge.scheduleType === "spijkenisse") {
    const values = futureCandidates(now, spijkenisseTimes);
    return {
      first: values[0] ?? null,
      following: values[1] ?? null,
      label: "Vaste bedienmogelijkheid",
      state: "fixed"
    };
  }
  if (bridge.scheduleType === "alblasserdam") {
    const values = futureCandidates(now, alblasserdamTimes, 370);
    return {
      first: values[0] ?? null,
      following: values[1] ?? null,
      label: values[0] ? "Vaste bedienmogelijkheid" : "Geen vaste zomertijd gevonden",
      state: values[0] ? "fixed" : "none"
    };
  }
  if (bridge.scheduleType === "brienenoord") {
    return {
      first: null,
      following: null,
      followingText: "Na aanvraag en goedkeuring",
      label: "Minimaal 12 uur vooraf aanvragen",
      state: "request"
    };
  }
  if (bridge.scheduleType === "caland") {
    return {
      first: calandOpportunity(now),
      following: null,
      followingText: "Daarna doorlopend op afroep",
      label: "Verzoek circa 20 minuten vooraf",
      state: "request"
    };
  }
  if (bridge.scheduleType === "gorinchem") {
    const values = futureCandidates(now, gorinchemTimes, 550);
    return {
      first: values[0] ?? null,
      following: values[1] ?? null,
      label: values[0] ? "Eerstvolgende dagmogelijkheid" : "Geen dagmogelijkheid in de huidige regeling",
      state: values[0] ? "fixed" : "closed"
    };
  }
  if (bridge.scheduleType === "papendrecht") {
    return {
      first: null,
      following: null,
      label: "Geen vaste bediening",
      state: "closed"
    };
  }
  if (bridge.scheduleType === "hartel") {
    const opportunity = hartelOpportunity(now);
    return {
      first: opportunity.instant ?? null,
      following: null,
      label: opportunity.label,
      state: "request"
    };
  }
  if (bridge.scheduleType === "wantij") {
    const values = windowOpportunityList(now, (localDate) => {
      const weekend = isWeekendOrHoliday(localDate);
      return weekend
        ? [[9, 30, 22, 0]]
        : [[9, 30, 15, 30], [18, 30, 22, 0]];
    });
    const firstIsNow = values[0] && Math.abs(values[0].getTime() - now.getTime()) < 60000;
    return {
      first: values[0] ?? null,
      following: values[1] ?? null,
      label: firstIsNow ? "Nu mogelijk bij aanvraag/aanbod" : "Bedienmogelijkheid bij aanvraag/aanbod",
      state: "window"
    };
  }
  const opportunity = scheduleOpportunity(bridge, now);
  return {
    first: opportunity.instant ?? null,
    following: null,
    label: opportunity.label,
    state: opportunity.state
  };
}

function decodeXml(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .trim();
}

function tagValue(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<(?:[\\w.-]+:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escaped}>`,
    "i"
  );
  const match = regex.exec(xml);
  return match
    ? decodeXml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "))
    : null;
}

function attributeValue(openingTag, attribute) {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, "i").exec(openingTag);
  return match ? decodeXml(match[1]) : null;
}

function chunks(xml, element) {
  const escaped = element.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<(?:[\\w.-]+:)?${escaped}\\b[^>]*>[\\s\\S]*?<\\/(?:[\\w.-]+:)?${escaped}>`,
    "gi"
  );
  return xml.match(regex) ?? [];
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timestamp(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function containsBridge(situationXml, bridge) {
  return situationXml.toLowerCase().includes(bridge.isrs.toLowerCase());
}

function parseRecord(recordXml, situationXml) {
  if (!/bridgeSwingInOperation/i.test(recordXml)) return null;
  const openingTag = recordXml.match(/<(?:[\w.-]+:)?situationRecord\b[^>]*>/i)?.[0] ?? "";
  const situationTag = situationXml.match(/<(?:[\w.-]+:)?situation\b[^>]*>/i)?.[0] ?? "";
  return {
    id: attributeValue(openingTag, "id") ?? attributeValue(situationTag, "id"),
    start: toIsoOrNull(tagValue(recordXml, "overallStartTime")),
    end: toIsoOrNull(tagValue(recordXml, "overallEndTime")),
    operatorActionStatus: tagValue(recordXml, "operatorActionStatus") ?? "unknown",
    probability: tagValue(recordXml, "probabilityOfOccurrence") ?? "unknown",
    ended: /<(?:[\w.-]+:)?(?:end|cancel)\b[^>]*>\s*true\s*<\//i.test(recordXml),
    versionTime:
      toIsoOrNull(tagValue(recordXml, "situationRecordVersionTime")) ??
      toIsoOrNull(tagValue(situationXml, "situationVersionTime"))
  };
}

function selectEvent(records, nowMs) {
  const usable = records.filter((record) => !record.ended && record.start);
  const active = usable
    .filter((record) => {
      const startMs = timestamp(record.start);
      const endMs = timestamp(record.end);
      const activeStatus = ["beingImplemented", "implemented"].includes(record.operatorActionStatus);
      return activeStatus && startMs !== null && startMs <= nowMs && (endMs === null || endMs > nowMs);
    })
    .sort((a, b) => timestamp(b.start) - timestamp(a.start))[0];

  if (active) {
    return {
      liveStatus: "open",
      liveLabel: "NDW: NU OPEN",
      liveStart: active.start,
      liveEnd: active.end,
      liveMessage: "Concrete opening actief volgens NDW."
    };
  }

  const upcoming = usable
    .filter((record) => timestamp(record.start) > nowMs)
    .sort((a, b) => timestamp(a.start) - timestamp(b.start))[0];

  if (upcoming) {
    return {
      liveStatus: upcoming.operatorActionStatus === "requested" ? "requested" : "planned",
      liveLabel: upcoming.operatorActionStatus === "requested" ? "NDW: AANGEVRAAGD" : "NDW: GEPLAND",
      liveStart: upcoming.start,
      liveEnd: upcoming.end,
      liveMessage: "Concrete opening gemeld in de NDW-feed."
    };
  }

  return {
    liveStatus: "none",
    liveLabel: "NDW: GEEN MELDING",
    liveStart: null,
    liveEnd: null,
    liveMessage: "Geen concrete opening gemeld."
  };
}

function parseNdwBridgeFeed(xml) {
  if (typeof xml !== "string" || !xml.includes("<")) {
    throw new TypeError("De NDW-feed bevat geen geldige XML.");
  }
  const now = new Date();
  const situations = chunks(xml, "situation");
  const publicationTime =
    toIsoOrNull(tagValue(xml, "publicationTime")) ??
    toIsoOrNull(tagValue(xml, "situationVersionTime"));

  const bridges = BRIDGES.map((bridge) => {
    const matchingSituations = situations.filter((situation) => containsBridge(situation, bridge));
    const records = matchingSituations.flatMap((situation) =>
      chunks(situation, "situationRecord")
        .map((record) => parseRecord(record, situation))
        .filter(Boolean)
    );
    const opportunities = scheduleOpportunities(bridge, now);
    return {
      ...bridge,
      nextOpportunity: opportunities.first?.toISOString() ?? null,
      followingOpportunity: opportunities.following?.toISOString() ?? null,
      followingOpportunityText: opportunities.followingText ?? null,
      opportunityLabel: opportunities.label,
      opportunityState: opportunities.state,
      ...selectEvent(records, now.getTime())
    };
  });

  return {
    source: "NDW Open Data · Planningsfeed Brugopeningen",
    sourceUrl: FEED_URL,
    publicationTime,
    processedAt: now.toISOString(),
    bridges
  };
}

function basNumber(summary) {
  const number = summary?.ntsNumber;
  if (!number) return null;
  return [number.organisation, number.year, number.number]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join("-");
}

function basLimitation(limitationCode) {
  const code = String(limitationCode ?? "").toUpperCase();
  if (code === "NOSERV") {
    return { status: "no-service", label: "GEEN BEDIENING", priority: 100 };
  }
  if (code === "OBSTRU") {
    return { status: "obstruction", label: "STREMMING", priority: 90 };
  }
  if (code === "SERVIC") {
    return { status: "restricted-service", label: "BEPERKTE BEDIENING", priority: 80 };
  }
  return { status: "restriction", label: "BEPERKING", priority: 60 };
}

function normalizeBasSummary(summary) {
  const startMs = summary?.startDate === null || summary?.startDate === undefined
    ? null
    : Number(summary.startDate);
  const endMs = summary?.endDate === null || summary?.endDate === undefined
    ? null
    : Number(summary.endDate);
  const limitation = basLimitation(summary?.limitationCode);
  return {
    id: summary?.ntsSummaryId ?? null,
    number: basNumber(summary),
    type: summary?.ntsType ?? null,
    limitationCode: summary?.limitationCode ?? null,
    limitationStatus: limitation.status,
    limitationLabel: limitation.label,
    priority: limitation.priority,
    fairwayName: summary?.fairwayName ?? null,
    locationName: summary?.locationName ?? null,
    start: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
    end: Number.isFinite(endMs) ? new Date(endMs).toISOString() : null
  };
}

function selectBasMessage(messages, nowMs = Date.now()) {
  const current = messages
    .filter((message) => {
      const startMs = timestamp(message.start);
      const endMs = timestamp(message.end);
      return (startMs === null || startMs <= nowMs) && (endMs === null || endMs > nowMs);
    })
    .sort((a, b) => b.priority - a.priority || (timestamp(b.end) ?? Infinity) - (timestamp(a.end) ?? Infinity))[0];

  if (current) return { message: current, active: true };

  const upcoming = messages
    .filter((message) => (timestamp(message.start) ?? -Infinity) > nowMs)
    .sort((a, b) => timestamp(a.start) - timestamp(b.start) || b.priority - a.priority)[0];
  return upcoming ? { message: upcoming, active: false } : null;
}

function basInterimPassage(messages, selectedMessage) {
  if (!selectedMessage?.number) return null;
  const mainStart = timestamp(selectedMessage.start);
  const mainEnd = timestamp(selectedMessage.end);
  if (mainStart === null || mainEnd === null) return null;

  const sibling = messages.find((message) => {
    if (message.id === selectedMessage.id || message.number !== selectedMessage.number) return false;
    const startMs = timestamp(message.start);
    const endMs = timestamp(message.end);
    if (startMs === null || endMs === null || endMs <= startMs) return false;

    const start = new Date(startMs);
    const end = new Date(endMs);
    const startMinutes = Number(new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(start).replace(":", ""));
    const endMinutes = Number(new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(end).replace(":", ""));
    const startClock = Math.floor(startMinutes / 100) * 60 + (startMinutes % 100);
    const endClock = Math.floor(endMinutes / 100) * 60 + (endMinutes % 100);
    const clockDuration = (endClock - startClock + 1440) % 1440;

    return endMs - startMs >= 12 * 60 * 60 * 1000 && clockDuration > 0 && clockDuration <= 180;
  });

  return sibling ? { start: sibling.start, end: sibling.end } : null;
}

async function downloadBasMessages(bridge) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BAS_API_URL}${bridge.vndsId}`, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "BrugwachterDashboard/7.0"
      }
    });
    if (!response.ok) throw new Error(`Vaarweginformatie antwoordde met HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new TypeError("Vaarweginformatie gaf geen berichtenlijst terug");
    return payload.map(normalizeBasSummary);
  } finally {
    clearTimeout(timer);
  }
}

function mergeBasData(data, results, now = new Date()) {
  const byId = new Map(results.map((result) => [result.bridgeId, result]));
  return {
    ...data,
    basSource: "Vaarweginformatie · BAS/scheepvaartberichten",
    basSourceUrl: BAS_SOURCE_URL,
    bridges: data.bridges.map((bridge) => {
      const result = byId.get(bridge.id);
      if (!result || result.error) {
        return {
          ...bridge,
          basStatus: "unavailable",
          basMessage: result?.error ?? "BAS-controle niet beschikbaar"
        };
      }

      const messages = result.messages.filter((message) => {
        const endMs = timestamp(message.end);
        return endMs === null || endMs > now.getTime();
      });
      const selected = selectBasMessage(messages, now.getTime());
      if (!selected) {
        return {
          ...bridge,
          basStatus: "none",
          basMessages: [],
          basMessage: "Alle BAS-berichten gecontroleerd; geen actieve of komende beperking."
        };
      }

      const { message, active } = selected;
      const interimPassage = basInterimPassage(messages, message);
      const liveLabel = `BAS: ${active ? message.limitationLabel : `AANKOMEND ${message.limitationLabel}`}`;
      return {
        ...bridge,
        basStatus: active ? "active" : "upcoming",
        basMessages: messages,
        basMessage: message.number,
        basSourceUrl: `https://www.vaarweginformatie.nl/frp/geo/detail/BRIDGE/${bridge.vndsId}`,
        liveStatus: active ? message.limitationStatus : "planned-restriction",
        liveLabel,
        liveStart: message.start,
        liveEnd: message.end,
        liveInterimStart: interimPassage?.start ?? null,
        liveInterimEnd: interimPassage?.end ?? null,
        liveSource: "BAS",
        liveMessage: message.number
          ? `${message.number} · ${message.locationName || bridge.name}`
          : message.locationName || bridge.name
      };
    })
  };
}

async function downloadAllBasMessages() {
  return Promise.all(BRIDGES.map(async (bridge) => {
    try {
      return { bridgeId: bridge.id, messages: await downloadBasMessages(bridge), error: null };
    } catch (error) {
      return {
        bridgeId: bridge.id,
        messages: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }));
}


function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".").replace(/[^0-9+-.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function observationLists(payload) {
  return firstValue(
    payload?.WaarnemingenLijst,
    payload?.waarnemingenLijst,
    payload?.Observations,
    payload?.observations
  ) ?? [];
}

function measurementLists(observation) {
  return firstValue(
    observation?.MetingenLijst,
    observation?.metingenLijst,
    observation?.Measurements,
    observation?.measurements
  ) ?? [];
}

function observationLocationCode(observation) {
  return String(firstValue(
    observation?.Locatie?.Code,
    observation?.locatie?.code,
    observation?.Location?.Code,
    observation?.location?.code,
    observation?.Fenomeenlocatie?.Code,
    observation?.fenomeenlocatie?.code
  ) ?? "").toLowerCase();
}

function observationLocationName(observation, fallback) {
  return String(firstValue(
    observation?.Locatie?.Naam,
    observation?.Locatie?.Omschrijving,
    observation?.locatie?.naam,
    observation?.Location?.Name,
    observation?.location?.name,
    fallback
  ));
}

function observationUnit(observation, measurement, fallback = "") {
  return String(firstValue(
    measurement?.AquoMetadata?.Eenheid?.Code,
    measurement?.aquoMetadata?.eenheid?.code,
    observation?.AquoMetadata?.Eenheid?.Code,
    observation?.aquoMetadata?.eenheid?.code,
    fallback
  ));
}

function observationQuantityCode(observation) {
  return String(firstValue(
    observation?.AquoMetadata?.Grootheid?.Code,
    observation?.aquoMetadata?.grootheid?.code,
    observation?.AquoPlusWaarnemingMetadata?.AquoMetadata?.Grootheid?.Code,
    observation?.aquoPlusWaarnemingMetadata?.aquoMetadata?.grootheid?.code,
    ""
  )).toUpperCase();
}

function observationDescription(observation) {
  return String(firstValue(
    observation?.AquoMetadata?.Parameter_Wat_Omschrijving,
    observation?.aquoMetadata?.parameter_Wat_Omschrijving,
    observation?.AquoPlusWaarnemingMetadata?.AquoMetadata?.Parameter_Wat_Omschrijving,
    observation?.aquoPlusWaarnemingMetadata?.aquoMetadata?.parameter_Wat_Omschrijving,
    ""
  ));
}

function observationMethodText(observation) {
  const metadata = firstValue(
    observation?.AquoMetadata,
    observation?.aquoMetadata,
    observation?.AquoPlusWaarnemingMetadata?.AquoMetadata,
    observation?.aquoPlusWaarnemingMetadata?.aquoMetadata,
    {}
  );
  return JSON.stringify(metadata);
}

function windSeriesScore(observation) {
  const text = `${observationDescription(observation)} ${observationMethodText(observation)}`.toLowerCase();
  let score = 0;
  if (/gemiddeld|average|mean|10.?min/.test(text)) score += 6;
  if (/maximum|maximaal|windstoot|stoot|gust/.test(text)) score -= 20;
  return score;
}

function measurementTime(measurement) {
  return toIsoOrNull(firstValue(
    measurement?.Tijdstip,
    measurement?.tijdstip,
    measurement?.Datumtijd,
    measurement?.datumtijd,
    measurement?.DateTime,
    measurement?.dateTime,
    measurement?.Waarnemingdatumtijd,
    measurement?.waarnemingdatumtijd
  ));
}

function measurementNumber(measurement) {
  return numericValue(firstValue(
    measurement?.Meetwaarde?.Waarde_Numeriek,
    measurement?.Meetwaarde?.Waarde_Alfanumeriek,
    measurement?.meetwaarde?.waarde_Numeriek,
    measurement?.meetwaarde?.waarde_Alfanumeriek,
    measurement?.Value?.Numeric,
    measurement?.value?.numeric,
    measurement?.Waarde_Numeriek,
    measurement?.Waarde_Alfanumeriek
  ));
}

function measurementQuality(measurement) {
  return String(firstValue(
    measurement?.WaarnemingMetadata?.Kwaliteitswaardecode,
    measurement?.waarnemingMetadata?.kwaliteitswaardecode,
    measurement?.QualityCode,
    measurement?.qualityCode,
    ""
  ));
}

function waterValueInMetres(value, unit) {
  const normalized = unit.toLowerCase();
  if (normalized === "cm") return value / 100;
  if (normalized === "mm") return value / 1000;
  return value;
}

function putLatest(map, key, candidate, score = 0) {
  const current = map.get(key);
  if (
    !current ||
    score > (current.score ?? 0) ||
    (score === (current.score ?? 0) &&
      timestamp(candidate.measuredAt) > timestamp(current.measuredAt))
  ) {
    map.set(key, { ...candidate, score });
  }
}

function windValueInMetresPerSecond(value, unit) {
  const normalized = String(unit).toLowerCase().replace(/\s+/g, "");
  if (normalized === "km/h" || normalized === "kmh") return value / 3.6;
  if (normalized === "kn" || normalized === "knot" || normalized === "knopen") {
    return value * 0.514444;
  }
  return value;
}

function normalizeWindDirection(value) {
  if (!Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

function parseEnvironmentalResponse(payload) {
  const waterByLocation = new Map();
  const speedByLocation = new Map();
  const directionByLocation = new Map();

  for (const observation of observationLists(payload)) {
    const locationCode = observationLocationCode(observation);
    if (!locationCode) continue;

    const locationName = observationLocationName(observation, locationCode);
    const quantity = observationQuantityCode(observation);
    const seriesScore = quantity === "WINDSHD" ? windSeriesScore(observation) : 0;

    for (const measurement of measurementLists(observation)) {
      const time = measurementTime(measurement);
      const value = measurementNumber(measurement);
      const quality = measurementQuality(measurement);
      if (!time || value === null || quality === "99") continue;

      if (quantity === "WATHTE") {
        const unit = observationUnit(observation, measurement, "cm");
        putLatest(waterByLocation, locationCode, {
          locationCode,
          locationName,
          valueMetres: waterValueInMetres(value, unit),
          measuredAt: time,
          qualityCode: quality,
          originalUnit: unit
        });
      }

      if (quantity === "WINDSHD" && seriesScore > -10) {
        const unit = observationUnit(observation, measurement, "m/s");
        const valueMps = windValueInMetresPerSecond(value, unit);
        if (Number.isFinite(valueMps) && valueMps >= 0 && valueMps < 100) {
          putLatest(speedByLocation, locationCode, {
            locationCode,
            locationName,
            valueMps,
            measuredAt: time,
            qualityCode: quality,
            originalUnit: unit
          }, seriesScore);
        }
      }

      if (quantity === "WINDRTG") {
        const directionDegrees = normalizeWindDirection(value);
        if (directionDegrees !== null) {
          putLatest(directionByLocation, locationCode, {
            locationCode,
            locationName,
            directionDegrees,
            measuredAt: time,
            qualityCode: quality,
            originalUnit: observationUnit(observation, measurement, "graad")
          });
        }
      }
    }
  }

  const windByLocation = new Map();
  const allWindLocations = new Set([
    ...speedByLocation.keys(),
    ...directionByLocation.keys()
  ]);

  for (const locationCode of allWindLocations) {
    const speed = speedByLocation.get(locationCode);
    const direction = directionByLocation.get(locationCode);
    if (!speed && !direction) continue;

    windByLocation.set(locationCode, {
      locationCode,
      locationName: speed?.locationName || direction?.locationName || locationCode,
      valueMps: speed?.valueMps ?? null,
      directionDegrees: direction?.directionDegrees ?? null,
      measuredAt: speed?.measuredAt || direction?.measuredAt || null,
      directionMeasuredAt: direction?.measuredAt || null,
      speedMeasuredAt: speed?.measuredAt || null
    });
  }

  return { waterByLocation, windByLocation };
}

async function downloadEnvironmentalData() {
  const allLocations = [
    ...new Set([
      ...BRIDGES.flatMap((bridge) => bridge.waterLocations),
      ...Object.values(WIND_LOCATION_FALLBACKS).flat()
    ])
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(WATER_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-api-key": "brugwachter-live",
        "user-agent": "BrugwachterDashboard/5.0"
      },
      body: JSON.stringify({
        LocatieLijst: allLocations.map((Code) => ({ Code })),
        AquoPlusWaarnemingMetadataLijst: [
          {
            AquoMetadata: {
              Compartiment: { Code: "OW" },
              Grootheid: { Code: "WATHTE" }
            }
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Waterinfo antwoordde met HTTP ${response.status}`);
    }

    return parseEnvironmentalResponse(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

function unavailableWater(bridge, message = "Geen actuele meting ontvangen") {
  return {
    waterLevelMetres: null,
    waterMeasuredAt: null,
    waterLocationCode: null,
    waterLocationName: bridge.waterLocationLabel,
    waterStatus: "unavailable",
    waterMessage: message,
    waterSourceUrl: WATER_SOURCE_URL
  };
}

function waterForBridge(bridge, measurements, stations = []) {
  for (const location of bridge.waterLocations) {
    const measurement = measurements.get(location.toLowerCase());
    if (!measurement) continue;
    const ageMs = Date.now() - timestamp(measurement.measuredAt);
    return {
      waterLevelMetres: measurement.valueMetres,
      waterMeasuredAt: measurement.measuredAt,
      waterLocationCode: measurement.locationCode,
      waterLocationName: measurement.locationName || bridge.waterLocationLabel,
      waterDistanceKm: 0,
      waterStatus: ageMs > 6 * 60 * 60 * 1000 ? "stale" : "current",
      waterMessage: ageMs > 6 * 60 * 60 * 1000 ? "Laatste meting is ouder dan 6 uur" : "Actuele RWS-meting",
      waterSourceUrl: WATER_SOURCE_URL
    };
  }

  let best = null;
  for (const station of stations) {
    if (
      !Number.isFinite(station.valueMetres) ||
      !Number.isFinite(station.latitude) ||
      !Number.isFinite(station.longitude)
    ) continue;
    const distanceKm = haversineKm(
      bridge.latitude,
      bridge.longitude,
      station.latitude,
      station.longitude
    );
    if (!best || distanceKm < best.distanceKm) best = { station, distanceKm };
  }

  if (best && best.distanceKm <= 25) {
    const { station, distanceKm } = best;
    const ageMs = Date.now() - timestamp(station.measuredAt);
    return {
      waterLevelMetres: station.valueMetres,
      waterMeasuredAt: station.measuredAt,
      waterLocationCode: station.locationCode,
      waterLocationName: station.locationName || bridge.waterLocationLabel,
      waterDistanceKm: Math.round(distanceKm * 10) / 10,
      waterStatus: ageMs > 6 * 60 * 60 * 1000 ? "stale" : "current",
      waterMessage: ageMs > 6 * 60 * 60 * 1000
        ? "Dichtstbijzijnde watermeting is ouder dan 6 uur"
        : "Dichtstbijzijnde actuele RWS-watermeting",
      waterSourceUrl: WATER_SOURCE_URL
    };
  }

  return unavailableWater(bridge);
}

function mergeWaterData(data, measurements, previousData = null, stations = []) {
  const previousById = new Map((previousData?.bridges ?? []).map((bridge) => [bridge.id, bridge]));
  return {
    ...data,
    waterSource: "Rijkswaterstaat Waterinfo",
    waterSourceUrl: WATER_SOURCE_URL,
    bridges: data.bridges.map((bridge) => {
      const fresh = waterForBridge(bridge, measurements, stations);
      if (fresh.waterLevelMetres !== null) return { ...bridge, ...fresh };
      const previous = previousById.get(bridge.id);
      if (previous?.waterLevelMetres !== null && previous?.waterLevelMetres !== undefined) {
        return {
          ...bridge,
          waterLevelMetres: previous.waterLevelMetres,
          waterMeasuredAt: previous.waterMeasuredAt,
          waterLocationCode: previous.waterLocationCode,
          waterLocationName: previous.waterLocationName,
          waterDistanceKm: previous.waterDistanceKm,
          waterStatus: "stale",
          waterMessage: "Laatste succesvolle RWS-meting",
          waterSourceUrl: WATER_SOURCE_URL
        };
      }
      return { ...bridge, ...fresh };
    })
  };
}


function parseDelimited(text) {
  const firstLine = String(text).split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g) ?? []).length >= (firstLine.match(/,/g) ?? []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

function normalizedHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function rowValue(row, names) {
  for (const name of names) {
    const value = row[normalizedHeader(name)];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function geometryLatLon(value) {
  const match = /POINT(?:\s+Z)?\s*\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)/i.exec(String(value ?? ""));
  if (!match) return { latitude: null, longitude: null };
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return { latitude: null, longitude: null };

  if (first >= 2 && first <= 8 && second >= 50 && second <= 55) {
    return { longitude: first, latitude: second };
  }
  if (second >= 2 && second <= 8 && first >= 50 && first <= 55) {
    return { longitude: second, latitude: first };
  }
  return { latitude: null, longitude: null };
}

function parseWfsSeriesCsv(text, expectedQuantity) {
  const rows = parseDelimited(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizedHeader);
  const results = [];

  for (const values of rows.slice(1)) {
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const quantity = String(rowValue(row, ["GROOTHEIDCODE", "GROOTHEID_CODE"]) ?? "").toUpperCase();
    if (quantity && quantity !== expectedQuantity) continue;

    const rawValue = numericValue(rowValue(row, [
      "WAARDE_LAATSTE_METING", "MEETWAARDE", "WAARDE_NUMERIEK", "VALUE"
    ]));
    if (rawValue === null) continue;

    const locationCode = String(rowValue(row, ["CODE", "LOCATIECODE", "LOCATIE_CODE"]) ?? "").toLowerCase();
    if (!locationCode) continue;

    const geometry = geometryLatLon(rowValue(row, ["WKT", "THE_GEOM", "GEOMETRY", "MSGEOMETRY"]));
    const latitude = numericValue(rowValue(row, ["LAT", "LATITUDE", "BREEDTEGRAAD"])) ?? geometry.latitude;
    const longitude = numericValue(rowValue(row, ["LON", "LONGITUDE", "LENGTEGRAAD"])) ?? geometry.longitude;
    const defaultUnit =
      expectedQuantity === "WINDSHD" ? "m/s" :
      expectedQuantity === "WINDRTG" ? "graad" : "cm";
    const unit = String(rowValue(row, ["EENHEIDCODE", "EENHEID_CODE", "UNIT"]) ?? defaultUnit);
    const measuredAt = toIsoOrNull(rowValue(row, [
      "TIJDSTIP_LAATSTE_METING", "TIJDSTIP", "DATUMTIJD", "DATE_TIME"
    ]));
    if (!measuredAt) continue;

    results.push({
      locationCode,
      locationName: String(rowValue(row, ["NAAM", "LOCATIENAAM", "LOCATIE_NAAM"]) ?? locationCode),
      latitude,
      longitude,
      measuredAt,
      value: rawValue,
      unit
    });
  }
  return results;
}

function wfsSeriesUrl(quantity) {
  const filter = `<Filter xmlns="http://www.opengis.net/ogc"><PropertyIsEqualTo><PropertyName>GROOTHEIDCODE</PropertyName><Literal>${quantity}</Literal></PropertyIsEqualTo></Filter>`;
  const url = new URL(WIND_WFS_URL);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "1.1.0");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAME", "locatiesmetlaatstewaarneming");
  url.searchParams.set("SRSNAME", "EPSG:4326");
  url.searchParams.set("FILTER", filter);
  url.searchParams.set("outputFormat", "csv");
  url.searchParams.set("format_options", "csvseparator:semicolon");
  return url;
}

async function fetchWfsSeries(quantity) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(wfsSeriesUrl(quantity), {
      signal: controller.signal,
      headers: {
        accept: "text/csv, text/plain;q=0.9, */*;q=0.8",
        "user-agent": "BrugwachterDashboard/6.0"
      }
    });
    if (!response.ok) throw new Error(`RWS WFS ${quantity} antwoordde met HTTP ${response.status}`);
    const text = await response.text();
    const rows = parseWfsSeriesCsv(text, quantity);
    if (!rows.length) throw new Error(`RWS WFS gaf geen ${quantity}-metingen terug`);
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function combineWindSeries(speedRows, directionRows) {
  const directionByCode = new Map();
  for (const row of directionRows) {
    const current = directionByCode.get(row.locationCode);
    if (!current || timestamp(row.measuredAt) > timestamp(current.measuredAt)) {
      directionByCode.set(row.locationCode, row);
    }
  }

  const stations = [];
  for (const speed of speedRows) {
    const valueMps = windValueInMetresPerSecond(speed.value, speed.unit);
    if (!Number.isFinite(valueMps) || valueMps < 0 || valueMps >= 100) continue;
    const direction = directionByCode.get(speed.locationCode);
    stations.push({
      locationCode: speed.locationCode,
      locationName: speed.locationName,
      latitude: speed.latitude,
      longitude: speed.longitude,
      valueMps,
      directionDegrees: direction ? normalizeWindDirection(direction.value) : null,
      measuredAt: speed.measuredAt,
      directionMeasuredAt: direction?.measuredAt ?? null
    });
  }
  return stations;
}

async function downloadWindStations() {
  const [speedRows, directionRows] = await Promise.all([
    fetchWfsSeries("WINDSHD"),
    fetchWfsSeries("WINDRTG").catch(() => [])
  ]);
  return combineWindSeries(speedRows, directionRows);
}

async function downloadWaterStations() {
  const rows = await fetchWfsSeries("WATHTE");
  return rows
    .map((row) => ({
      locationCode: row.locationCode,
      locationName: row.locationName,
      latitude: row.latitude,
      longitude: row.longitude,
      valueMetres: waterValueInMetres(row.value, row.unit),
      measuredAt: row.measuredAt,
      originalUnit: row.unit
    }))
    .filter((row) =>
      Number.isFinite(row.valueMetres) &&
      Number.isFinite(row.latitude) &&
      Number.isFinite(row.longitude)
    );
}

function unavailableWind(bridge, message = "Geen actuele windmeting ontvangen") {
  return {
    windSpeedMps: null,
    windDirectionDegrees: null,
    windMeasuredAt: null,
    windLocationCode: null,
    windLocationName: "RWS windmeetpunt",
    windStatus: "unavailable",
    windMessage: message,
    windSourceUrl: WIND_SOURCE_URL
  };
}

function windForBridge(bridge, stations) {
  let best = null;
  for (const station of stations) {
    if (
      typeof station.valueMps !== "number" ||
      !Number.isFinite(station.latitude) ||
      !Number.isFinite(station.longitude)
    ) continue;
    const distanceKm = haversineKm(
      bridge.latitude,
      bridge.longitude,
      station.latitude,
      station.longitude
    );
    if (!best || distanceKm < best.distanceKm) best = { station, distanceKm };
  }

  if (!best) return unavailableWind(bridge, "Geen nabijgelegen officiële windmeting ontvangen");
  const { station, distanceKm } = best;
  const ageMs = Date.now() - timestamp(station.measuredAt);
  return {
    windSpeedMps: station.valueMps,
    windDirectionDegrees: station.directionDegrees,
    windMeasuredAt: station.measuredAt,
    windLocationCode: station.locationCode,
    windLocationName: station.locationName || "RWS windmeetpunt",
    windDistanceKm: Math.round(distanceKm * 10) / 10,
    windStatus: ageMs > 6 * 60 * 60 * 1000 ? "stale" : "current",
    windMessage: ageMs > 6 * 60 * 60 * 1000
      ? "Dichtstbijzijnde windmeting is ouder dan 6 uur"
      : "Dichtstbijzijnde actuele RWS-windmeting",
    windSourceUrl: WIND_SOURCE_URL
  };
}

function mergeWindData(data, measurements, previousData = null) {
  const previousById = new Map(
    (previousData?.bridges ?? []).map((bridge) => [bridge.id, bridge])
  );

  return {
    ...data,
    windSource: "Rijkswaterstaat Waterinfo",
    windSourceUrl: WIND_SOURCE_URL,
    bridges: data.bridges.map((bridge) => {
      const fresh = windForBridge(bridge, measurements);
      if (fresh.windSpeedMps !== null) return { ...bridge, ...fresh };

      const previous = previousById.get(bridge.id);
      if (previous?.windSpeedMps !== null && previous?.windSpeedMps !== undefined) {
        return {
          ...bridge,
          windSpeedMps: previous.windSpeedMps,
          windDirectionDegrees: previous.windDirectionDegrees,
          windMeasuredAt: previous.windMeasuredAt,
          windLocationCode: previous.windLocationCode,
          windLocationName: previous.windLocationName,
          windDistanceKm: previous.windDistanceKm,
          windStatus: "stale",
          windMessage: "Laatste succesvolle RWS-windmeting",
          windSourceUrl: WIND_SOURCE_URL
        };
      }

      return { ...bridge, ...fresh };
    })
  };
}

function fallbackData() {
  const now = new Date();
  return {
    source: "Vaste bedientijden; NDW tijdelijk niet bereikbaar",
    sourceUrl: FEED_URL,
    publicationTime: null,
    processedAt: now.toISOString(),
    bridges: BRIDGES.map((bridge) => {
      const opportunities = scheduleOpportunities(bridge, now);
      return {
        ...bridge,
        nextOpportunity: opportunities.first?.toISOString() ?? null,
        followingOpportunity: opportunities.following?.toISOString() ?? null,
        followingOpportunityText: opportunities.followingText ?? null,
        opportunityLabel: opportunities.label,
        opportunityState: opportunities.state,
        liveStatus: "unavailable",
        liveLabel: "NDW: ONBEREIKBAAR",
        liveStart: null,
        liveEnd: null,
        liveMessage: "Vaste bedientijden blijven zichtbaar."
      };
    })
  };
}

function decodeFeed(buffer) {
  const bytes = new Uint8Array(buffer);
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  return isGzip ? gunzipSync(bytes).toString("utf8") : Buffer.from(bytes).toString("utf8");
}

async function downloadFeed() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(FEED_URL, {
      signal: controller.signal,
      headers: {
        accept: "application/xml, application/gzip;q=0.9, */*;q=0.8",
        "user-agent": "BrugwachterDashboard/3.0"
      }
    });
    if (!response.ok) throw new Error(`NDW antwoordde met HTTP ${response.status}`);
    return decodeFeed(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function refreshData({ force = false } = {}) {
  const age = state.lastSuccessAt ? Date.now() - new Date(state.lastSuccessAt).getTime() : Infinity;
  if (!force && state.data && age < REFRESH_INTERVAL_MS) return state.data;
  if (state.refreshing) return state.refreshing;

  state.refreshing = (async () => {
    state.lastAttemptAt = new Date().toISOString();
    const previousData = state.data;
    const errors = [];
    let dashboardData;

    try {
      const xml = await downloadFeed();
      dashboardData = parseNdwBridgeFeed(xml);
    } catch (error) {
      errors.push(`NDW: ${error instanceof Error ? error.message : String(error)}`);
      dashboardData = fallbackData();
    }

    try {
      const basResults = await downloadAllBasMessages();
      dashboardData = mergeBasData(dashboardData, basResults);
      const failed = basResults.filter((result) => result.error);
      if (failed.length) {
        errors.push(`BAS: ${failed.length} van ${BRIDGES.length} brugcontroles mislukt`);
      }
    } catch (error) {
      errors.push(`BAS: ${error instanceof Error ? error.message : String(error)}`);
    }

    let waterMeasurements = new Map();
    let waterStations = [];

    try {
      const environment = await downloadEnvironmentalData();
      waterMeasurements = environment.waterByLocation;
    } catch (error) {
      errors.push(`Waterinfo gericht: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      waterStations = await downloadWaterStations();
    } catch (error) {
      errors.push(`RWS water WFS: ${error instanceof Error ? error.message : String(error)}`);
    }

    dashboardData = mergeWaterData(
      dashboardData,
      waterMeasurements,
      previousData,
      waterStations
    );

    try {
      const windStations = await downloadWindStations();
      dashboardData = mergeWindData(dashboardData, windStations, previousData);
    } catch (error) {
      errors.push(`RWS wind: ${error instanceof Error ? error.message : String(error)}`);
      dashboardData = mergeWindData(dashboardData, [], previousData);
    }

    state.data = dashboardData;
    state.lastSuccessAt = new Date().toISOString();
    state.error = errors.length ? errors.join(" · ") : null;
    state.refreshing = null;
    return state.data;
  })().catch((error) => {
    state.refreshing = null;
    throw error;
  });
  return state.refreshing;
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

function requestHasRefreshAccess(req, url) {
  if (!REFRESH_SECRET) return false;
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const headerSecret = req.headers["x-refresh-secret"] ?? "";
  const querySecret = url.searchParams.get("secret") ?? "";
  return [bearer, headerSecret, querySecret].includes(REFRESH_SECRET);
}

const HTML = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>Brugwachter Live</title>
<style>
:root{--bg:#171819;--card:#232526;--ink:#f7f4ee;--muted:#aaa49c;--line:#3d3f41;--orange:#ff8a1c;--orange2:#f36f13;--pale:#2b2d2f;--warm:#342619;--red:#ff5d50;--shadow:0 6px 18px rgba(0,0,0,.35)}
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--bg);font-family:Arial,sans-serif;color:var(--ink)}
main{height:100dvh;padding:6px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:6px}
.card{min-height:0;background:var(--card);border:1px solid var(--line);border-top:3px solid var(--orange);border-radius:11px;box-shadow:var(--shadow);padding:7px 8px;display:flex;flex-direction:column;gap:4px;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;min-height:34px}
h2{margin:0;font-size:clamp(20px,1.55vw,30px);line-height:.98;letter-spacing:-.025em;color:#fff}.short{font-size:9px;color:var(--muted);margin-top:3px;font-weight:700}.badge{border:1px solid #5b4632;background:#30271f;color:var(--orange);border-radius:999px;padding:3px 6px;font-size:7px;font-weight:900;white-space:nowrap;text-transform:uppercase;letter-spacing:.05em}
.audience{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.pleasure{color:#fff;background:#343638;border:1px solid #4b4e50;border-radius:5px;padding:3px 6px}.night{color:var(--orange);background:#2e251d;border:1px solid #65411f;border-radius:5px;padding:3px 6px;white-space:nowrap}
.timing{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,.85fr);gap:5px;background:var(--warm);border:1px solid #5d4028;border-radius:9px;padding:5px 7px}.timing.single{grid-template-columns:1fr}.timing-part{min-width:0}.timing-part+.timing-part{border-left:1px solid #61452f;padding-left:7px}.next-label{font-size:8px;text-transform:uppercase;letter-spacing:.075em;color:#d7a679;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.next-time{font-size:clamp(31px,3vw,53px);font-weight:900;line-height:.9;margin-top:3px;letter-spacing:-.045em;color:var(--orange);white-space:nowrap}.next-day{font-size:8px;color:#d5cec6;margin-top:4px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.notice-main{font-size:clamp(20px,1.8vw,32px);font-weight:950;line-height:1;color:var(--orange);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.notice-sub{font-size:8px;color:#eee5dc;margin-top:5px;font-weight:750;line-height:1.2;white-space:normal}.following-time{font-size:clamp(22px,2vw,34px);font-weight:900;line-height:.95;margin-top:6px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.following-day{font-size:8px;color:#bfb7ae;margin-top:4px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.data-row{display:grid;grid-template-columns:minmax(68px,.48fr) minmax(68px,.48fr) minmax(0,2.04fr);gap:4px}.data-box{min-width:0;border-radius:8px;padding:5px 6px;background:var(--pale);border:1px solid var(--line)}.data-label{font-size:7px;text-transform:uppercase;letter-spacing:.065em;color:#ff8a1c;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}.water-value,.wind-value{font-size:clamp(18px,1.45vw,26px);font-weight:950;line-height:.95;margin-top:4px;color:var(--orange);white-space:nowrap}.wind-value{text-align:center}.data-unit{font-size:clamp(11px,.85vw,15px);font-weight:900;line-height:1;color:#fff;margin-top:2px;text-align:center}.water-datum{font-size:clamp(10px,.78vw,14px);font-weight:950;line-height:1;color:#ddd6ce;margin-top:4px}.data-detail{font-size:clamp(8px,.62vw,11px);font-weight:800;line-height:1.18;color:var(--muted);margin-top:3px;white-space:normal;overflow-wrap:anywhere;text-align:center}.message-box{background:#30271f;border-color:#6b4726}.message-head{display:flex;align-items:center;justify-content:space-between;gap:5px}.message-source{font-size:7px;font-weight:950;letter-spacing:.08em;color:#fff;background:var(--orange2);border-radius:4px;padding:2px 5px;white-space:nowrap}.live-value{max-width:58%;font-size:7px;font-weight:900;line-height:1;color:#ff8a1c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}.restriction-period{margin-top:5px}.restriction-label,.interim-label{font-size:6.5px;text-transform:uppercase;color:#c8b5a4;font-weight:900;letter-spacing:.05em}.restriction-value{font-size:clamp(12px,1.05vw,18px);font-weight:950;color:#fff;margin-top:2px;line-height:1.05;white-space:nowrap}.restriction-arrow{color:var(--orange);padding:0 3px}.interim-row{display:flex;align-items:baseline;justify-content:space-between;gap:6px;border-top:1px solid #76502e;margin-top:5px;padding-top:4px}.interim-value{font-size:clamp(12px,1.05vw,18px);font-weight:950;color:var(--orange);white-space:nowrap}.live-detail{font-size:6.5px;color:var(--muted);margin-top:3px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wind-alert{background:#f90707;border-color:#f90707;color:#fff}.wind-alert .data-label,.wind-alert .data-detail,.wind-alert .wind-value,.wind-alert .data-unit{color:#fff}.wind-alert .data-label{font-size:clamp(5px,.42vw,6px);letter-spacing:0;overflow:visible;text-overflow:clip}
.schedule{background:#292b2d;border:1px solid #3c3e40;border-radius:7px;padding:4px 6px;font-size:8px;line-height:1.15;color:#c9c3bc;overflow:hidden;min-height:35px}.schedule-row{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.schedule-row+ .schedule-row{margin-top:2px}.schedule strong{color:var(--orange)}.schedule .professional strong{color:#fff}
.foot{display:flex;justify-content:space-between;align-items:center;gap:5px;padding-top:3px;border-top:1px solid var(--line);font-size:6.5px;color:var(--muted);min-height:12px}.foot>span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.links{display:flex;gap:6px;flex:0 0 auto}.foot a{color:var(--orange);font-weight:900;text-decoration:none}.status{position:fixed;right:7px;bottom:2px;font-size:7px;color:#b7afa7;background:rgba(27,28,29,.94);border:1px solid #3b3d3f;padding:2px 5px;border-radius:5px;pointer-events:none}
@media(min-width:1600px) and (min-aspect-ratio:16/10){main{padding:8px;gap:8px}.card{padding:9px 10px;gap:5px}.top{min-height:39px}.short{font-size:10px}.audience{font-size:9px}.next-label{font-size:9px}.next-day,.following-day{font-size:9px}.data-label{font-size:8px}.data-detail,.live-detail{font-size:8px}.schedule{font-size:9px;min-height:39px}.foot{font-size:7px}}
@media(max-width:900px){html,body{height:auto;min-height:100%;overflow:auto}main{height:auto;min-height:100dvh;grid-template-columns:1fr;grid-template-rows:none;padding:6px}.card{min-height:285px}.schedule-row{white-space:normal}}
</style>
</head>
<body>
<main id="cards"></main>
<div class="status" id="status">laden…</div>
<script>
const cards=document.querySelector('#cards');
const statusEl=document.querySelector('#status');
const dayFmt=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',weekday:'short',day:'2-digit',month:'short'});
const timeFmt=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'});
const stampFmt=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function opportunity(b){
  if(!b.nextOpportunity)return {time:'—',day:b.opportunityLabel};
  const d=new Date(b.nextOpportunity);const diff=d.getTime()-Date.now();
  if(b.opportunityState==='window'&&Math.abs(diff)<60000)return {time:'NU',day:'Mogelijk bij aanvraag of aanbod'};
  return {time:timeFmt.format(d),day:dayFmt.format(d)+' · niet gegarandeerd'};
}
function followingOpportunity(b){
  if(b.id==='hartelbrug')return null;
  if(b.followingOpportunityText)return {time:b.followingOpportunityText,day:'Geen afzonderlijk vast tijdstip'};
  if(!b.followingOpportunity)return null;
  const d=new Date(b.followingOpportunity);return {time:timeFmt.format(d),day:dayFmt.format(d)+' · niet gegarandeerd'};
}
function water(b){
  if(typeof b.waterLevelMetres!=='number')return {value:'—',unit:'m',datum:'NAP',detail:b.waterMessage||'Geen actuele meting'};
  const sign=b.waterLevelMetres>0?'+':'';
  const bits=[];
  if(typeof b.waterDistanceKm==='number'&&b.waterDistanceKm>0)bits.push(b.waterDistanceKm.toLocaleString('nl-NL',{maximumFractionDigits:1})+' km');
  bits.push(b.waterMeasuredAt?timeFmt.format(new Date(b.waterMeasuredAt)):'tijd onbekend');
  return {value:sign+b.waterLevelMetres.toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2}),unit:'m',datum:'NAP',detail:bits.join(' · ')};
}
function compassDirection(degrees){if(typeof degrees!=='number'||!Number.isFinite(degrees))return '';const names=['N','NNO','NO','ONO','O','OZO','ZO','ZZO','Z','ZZW','ZW','WZW','W','WNW','NW','NNW'];return names[Math.round((((degrees%360)+360)%360)/22.5)%16];}
function beaufort(mps){const limits=[0.3,1.6,3.4,5.5,8.0,10.8,13.9,17.2,20.8,24.5,28.5,32.7];let force=0;while(force<limits.length&&mps>=limits[force])force+=1;return force;}
function wind(b){
  if(typeof b.windSpeedMps!=='number')return {value:'—',unit:'m/s',detail:b.windMessage||'Geen actuele meting',bft:null};
  const dir=compassDirection(b.windDirectionDegrees),bft=beaufort(b.windSpeedMps),bits=[bft+' Bft'];
  if(dir)bits.push(dir);if(typeof b.windDistanceKm==='number')bits.push(b.windDistanceKm.toLocaleString('nl-NL',{maximumFractionDigits:1})+' km');if(b.windMeasuredAt)bits.push(timeFmt.format(new Date(b.windMeasuredAt)));
  return {value:b.windSpeedMps.toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1}),unit:'m/s',detail:bits.join(' · '),bft};
}
function live(b){
  const value=b.liveLabel.replace(/^(?:NDW|BAS):\\s*/,"");
  const formatMoment=iso=>{if(!iso)return '—';const d=new Date(iso);return dayFmt.format(d)+' '+timeFmt.format(d)};
  const formatClock=iso=>iso?timeFmt.format(new Date(iso)):'—';
  const interim=b.liveInterimStart&&b.liveInterimEnd
    ? formatClock(b.liveInterimStart)+'–'+formatClock(b.liveInterimEnd)
    : null;
  return {
    source:b.liveSource==='PIN'?'PIN-BERICHT':b.liveSource==='BAS'?'BAS-BERICHT':'NDW',
    value,
    start:formatMoment(b.liveStart),
    end:formatMoment(b.liveEnd),
    interim,
    detail:b.liveMessage||''
  };
}
function noticeContent(b){
  if(Array.isArray(b.specialPassages)&&b.specialPassages.length){
    const now=Date.now();
    const next=b.specialPassages.find(p=>new Date(p.end).getTime()>now);
    if(next){
      const start=new Date(next.start),end=new Date(next.end);
      const active=start.getTime()<=now&&end.getTime()>now;
      return {
        title:b.timingTitle||'Gewijzigde bedientijden',
        main:(active?'NU · ':'')+dayFmt.format(start)+' · '+timeFmt.format(start)+'–'+timeFmt.format(end),
        sub:'Voorlopige maandelijkse passage hoge scheepvaart · minimaal 5 dagen vooraf aanmelden'
      };
    }
    return {title:b.timingTitle||'Gewijzigde bedientijden',main:'Zie actuele bekendmaking',sub:'Nieuwe passagemomenten worden via Vaarweginformatie bekendgemaakt'};
  }
  return {title:b.timingTitle||'Bediening',main:b.timingMain||'Zie Vaarweginformatie',sub:b.timingSub||'Controleer de actuele officiële regeling'};
}
function render(data){
  cards.innerHTML='';
  for(const b of data.bridges){
    const o=opportunity(b),f=followingOpportunity(b),w=water(b),v=wind(b),l=live(b);
    const audienceLabel=b.audienceLabel||'Tijden hieronder: pleziervaart';
    const nightPassage=b.showNightPassage===false?'':'<span class="night">Vrije doorvaart 22:00–06:30</span>';
    const notice=noticeContent(b);
    const timingHtml=b.displayMode==='notice'
      ? '<div class="timing single notice-timing"><div class="timing-part"><div class="next-label">'+escapeHtml(notice.title)+'</div><div class="notice-main">'+escapeHtml(notice.main)+'</div><div class="notice-sub">'+escapeHtml(notice.sub)+'</div></div></div>'
      : '<div class="timing '+(f?'':'single')+'"><div class="timing-part"><div class="next-label">Eerste mogelijke bediening</div><div class="next-time">'+escapeHtml(o.time)+'</div><div class="next-day">'+escapeHtml(o.day)+'</div></div>'+(f?'<div class="timing-part"><div class="next-label">Daarna: volgende mogelijkheid</div><div class="following-time">'+escapeHtml(f.time)+'</div><div class="following-day">'+escapeHtml(f.day)+'</div></div>':'')+'</div>';
    const windAlert=typeof v.bft==='number'&&typeof b.windAlertAboveBft==='number'&&v.bft>=b.windAlertAboveBft;
    const interimHtml=l.interim?'<div class="interim-row"><span class="interim-label">Tussentijdse opening</span><span class="interim-value">'+escapeHtml(l.interim)+'</span></div>':'';
    const windBoxClass=windAlert?'data-box wind-alert':'data-box';
    const windLabel=windAlert?'Wind waarschuwing':'Wind';
    const windTitle=windAlert?'Windwaarschuwing: '+v.bft+' Bft heeft de bedieningsgrens van '+b.windAlertAboveBft+' Bft bereikt':'Actuele wind';
    const article=document.createElement('article');article.className='card';article.dataset.live=b.liveStatus;
    article.innerHTML=
      '<div class="top"><div><h2>'+escapeHtml(b.name)+'</h2><div class="short">'+escapeHtml(b.short)+'</div></div><span class="badge">'+escapeHtml(b.liveSource==='PIN'?'PIN':b.liveSource==='BAS'?'BAS':'LIVE')+'</span></div>'+
      '<div class="audience"><span class="pleasure">'+escapeHtml(audienceLabel)+'</span>'+nightPassage+'</div>'+ 
      timingHtml+ 
      '<div class="data-row"><div class="data-box"><div class="data-label">Waterstand</div><div class="water-value">'+escapeHtml(w.value)+'</div><div class="data-unit water-unit">'+escapeHtml(w.unit)+' '+escapeHtml(w.datum)+'</div><div class="data-detail" title="'+escapeHtml(b.waterLocationName||'')+'">'+escapeHtml(w.detail)+'</div></div><div class="'+windBoxClass+'" title="'+escapeHtml(windTitle)+'"><div class="data-label">'+escapeHtml(windLabel)+'</div><div class="wind-value">'+escapeHtml(v.value)+'</div><div class="data-unit">'+escapeHtml(v.unit)+'</div><div class="data-detail" title="'+escapeHtml(b.windLocationName||'')+'">'+escapeHtml(v.detail)+'</div></div><div class="data-box message-box"><div class="message-head"><span class="message-source">'+escapeHtml(l.source)+'</span><span class="live-value">'+escapeHtml(l.value)+'</span></div><div class="restriction-period"><div class="restriction-label">Stremming</div><div class="restriction-value">'+escapeHtml(l.start)+'<span class="restriction-arrow">→</span>'+escapeHtml(l.end)+'</div></div>'+interimHtml+'<div class="live-detail">'+escapeHtml(l.detail)+'</div></div></div>'+
      '<div class="schedule"><div class="schedule-row"><strong>Pleziervaart:</strong> '+escapeHtml(b.scheduleText)+'</div><div class="schedule-row professional"><strong>Beroepsvaart:</strong> '+escapeHtml(b.professionalText||'Afwijkende voorwaarden mogelijk; controleer Vaarweginformatie.')+'</div></div>'+ 
      '<div class="foot"><span title="Water: '+escapeHtml(b.waterLocationName||'RWS meetpunt')+' · Wind: '+escapeHtml(b.windLocationName||'RWS windmeetpunt')+'">RWS water · wind: '+escapeHtml(b.windLocationName||'onbekend')+'</span><span class="links">'+(b.liveSource==='BAS'?'<a href="'+escapeHtml(b.basSourceUrl)+'" target="_blank" rel="noopener">BAS</a>':'')+'<a href="'+escapeHtml(b.scheduleSource)+'" target="_blank" rel="noopener">tijden</a><a href="'+escapeHtml(b.waterSourceUrl||'https://waterinfo.rws.nl/')+'" target="_blank" rel="noopener">metingen</a></span></div>';
    cards.appendChild(article);
  }
}
async function load(){try{const response=await fetch('/api/dashboard',{cache:'no-store'});const payload=await response.json();if(!payload.data)throw new Error(payload.error||'Geen gegevens');render(payload.data);const stamp=payload.data.publicationTime||payload.lastSuccessAt||payload.data.processedAt;statusEl.textContent=(payload.error?'laatste gegevens · ':'live · ')+(stamp?stampFmt.format(new Date(stamp)):'tijd onbekend');}catch(error){statusEl.textContent='fout: '+(error.message||error);}}
load();setInterval(load,60000);
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/health") {
      json(res, 200, { status: "ok", lastSuccessAt: state.lastSuccessAt, error: state.error });
      return;
    }
    if (url.pathname === "/api/dashboard") {
      await refreshData();
      json(res, 200, {
        ok: true,
        lastSuccessAt: state.lastSuccessAt,
        lastAttemptAt: state.lastAttemptAt,
        error: state.error,
        data: state.data
      });
      return;
    }
    if (url.pathname === "/api/refresh") {
      if (!requestHasRefreshAccess(req, url)) {
        json(res, 403, { ok: false, error: "Ongeldig refresh-geheim." });
        return;
      }
      await refreshData({ force: true });
      json(res, 200, { ok: true, error: state.error, data: state.data });
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff"
      });
      res.end(HTML);
      return;
    }
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Niet gevonden");
  } catch (error) {
    json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Brugwachter Live draait op poort ${PORT}`);
  refreshData({ force: true }).catch(() => {});
});

const interval = setInterval(() => {
  refreshData({ force: true }).catch(() => {});
}, REFRESH_INTERVAL_MS);
interval.unref();
