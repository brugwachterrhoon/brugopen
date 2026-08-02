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
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 300000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 20000);
const REFRESH_SECRET = process.env.REFRESH_SECRET || "";
const TIME_ZONE = "Europe/Amsterdam";

const BRIDGES = [
  {
    id: "botlekbrug",
    name: "Botlekbrug",
    short: "A15 · Oude Maas",
    isrs: "NLRTM001110888700281",
    scheduleType: "botlek",
    waterLocations: ["botlek.oudemaas.botlekbrug", "botlek.oudemaas", "hoogvliet", "spijkenisse.oudemaas.brug", "spijkenisse.oudemaas"],
    waterLocationLabel: "Botlek Oude Maas",
    scheduleText: "Vaste tijden: :15 en :45 tussen 06:00–22:00. Werkdagen geen recreatievaart 06:30–09:30 en 15:30–18:30.",
    scheduleSource: "https://www.rijkswaterstaat.nl/wegen/projectenoverzicht/a15-botlekbrug-nieuwe-verbinding-weg-en-goederenspoorverkeer-scheepvaart-en-bromfietsers/hinder-en-maatregelen/scheepvaart"
  },
  {
    id: "spijkenisserbrug",
    name: "Spijkenisserbrug",
    short: "S102 · Oude Maas",
    isrs: "NLSPI001110572700266",
    scheduleType: "spijkenisse",
    waterLocations: ["spijkenisse.oudemaas.brug", "spijkenisse.oudemaas"],
    waterLocationLabel: "Spijkenisse Oude Maas",
    scheduleText: "Vaste tijd: op het halve uur tussen 06:00–22:00. Werkdagen geen recreatievaart 06:30–09:30 en 15:30–18:30.",
    scheduleSource: "https://www.rijkswaterstaat.nl/wegen/projectenoverzicht/a15-botlekbrug-nieuwe-verbinding-weg-en-goederenspoorverkeer-scheepvaart-en-bromfietsers/hinder-en-maatregelen/scheepvaart"
  },
  {
    id: "brug-over-de-noord",
    name: "Brug over de Noord",
    short: "Alblasserdamsebrug · N915",
    isrs: "NLHIA001010577301210",
    scheduleType: "alblasserdam",
    waterLocations: ["alblasserdam"],
    waterLocationLabel: "Alblasserdam",
    scheduleText: "Zomer: dagelijks 10:00, 11:00, 12:00, 13:00, 14:00 en 16:00; weekend ook 09:00, 15:00 en 18:00; werkdagen 09:15 en 18:15.",
    scheduleSource: "https://www.vaarweginformatie.nl/frp/geo/detail/BRIDGE/43523"
  },
  {
    id: "papendrechtsebrug",
    name: "Papendrechtsebrug",
    short: "Merwedebrug · N3",
    isrs: "NLDOR001010577001143",
    scheduleType: "papendrecht",
    waterLocations: ["papendrecht", "papendrecht.benedenmerwede", "dordrecht.oudemaas.benedenmerwede"],
    waterLocationLabel: "Beneden Merwede nabij Papendrecht",
    scheduleText: "Geen vaste bediening wegens renovatie. Een bijzondere maandelijkse opening kan alleen na aanmelding en wordt als concrete melding getoond.",
    scheduleSource: "https://www.vaarweginformatie.nl/frp/geo/detail/BRIDGE/47519"
  },
  {
    id: "hartelbrug",
    name: "Hartelbrug",
    short: "N218 · Hartelkanaal",
    isrs: "NLRTM0115B5487800010",
    scheduleType: "hartel",
    waterLocations: ["europoort.hartelbrug", "hartelkanaal.vak81", "botlek.hartelkering.binnen"],
    waterLocationLabel: "Hartelkanaal bij Hartelbrug",
    scheduleText: "24 uur op afroep, minimaal 2 uur vooraf. Werkdagen niet tijdens 06:45–08:30 en 16:00–18:30.",
    scheduleSource: "https://www.vaarweginformatie.nl/"
  },
  {
    id: "wantijbrug",
    name: "Wantijbrug",
    short: "N3 · Dordrecht",
    isrs: "NLDOR001100553200025",
    scheduleType: "wantij",
    waterLocations: ["dordrecht.wantij", "dordrecht.wantij.west", "dordrecht.oudemaas.benedenmerwede"],
    waterLocationLabel: "Wantij nabij Dordrecht",
    scheduleText: "Zomer: werkdagen 09:30–15:30 en 18:30–22:00; weekend 09:30–22:00. Bediening bij aanvraag/aanbod.",
    scheduleSource: "https://www.vaarweginformatie.nl/"
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
      if (!weekend) {
        const total = hour * 60 + minute;
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
    const opportunity = scheduleOpportunity(bridge, now);
    return {
      ...bridge,
      nextOpportunity: opportunity.instant?.toISOString() ?? null,
      opportunityLabel: opportunity.label,
      opportunityState: opportunity.state,
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

function observationUnit(observation, measurement) {
  return String(firstValue(
    measurement?.AquoMetadata?.Eenheid?.Code,
    measurement?.aquoMetadata?.eenheid?.code,
    observation?.AquoMetadata?.Eenheid?.Code,
    observation?.aquoMetadata?.eenheid?.code,
    "cm"
  ));
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

function parseWaterResponse(payload) {
  const byLocation = new Map();
  for (const observation of observationLists(payload)) {
    const locationCode = observationLocationCode(observation);
    if (!locationCode) continue;
    const locationName = observationLocationName(observation, locationCode);
    for (const measurement of measurementLists(observation)) {
      const time = measurementTime(measurement);
      const value = measurementNumber(measurement);
      const quality = measurementQuality(measurement);
      if (!time || value === null || quality === "99") continue;
      const unit = observationUnit(observation, measurement);
      const candidate = {
        locationCode,
        locationName,
        valueMetres: waterValueInMetres(value, unit),
        measuredAt: time,
        qualityCode: quality,
        originalUnit: unit
      };
      const current = byLocation.get(locationCode);
      if (!current || timestamp(candidate.measuredAt) > timestamp(current.measuredAt)) {
        byLocation.set(locationCode, candidate);
      }
    }
  }
  return byLocation;
}

async function downloadWaterLevels() {
  const allLocations = [...new Set(BRIDGES.flatMap((bridge) => bridge.waterLocations))];
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
        "user-agent": "BrugwachterDashboard/4.0"
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
    if (!response.ok) throw new Error(`Waterinfo antwoordde met HTTP ${response.status}`);
    return parseWaterResponse(await response.json());
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

function waterForBridge(bridge, measurements) {
  for (const location of bridge.waterLocations) {
    const measurement = measurements.get(location.toLowerCase());
    if (!measurement) continue;
    const ageMs = Date.now() - timestamp(measurement.measuredAt);
    return {
      waterLevelMetres: measurement.valueMetres,
      waterMeasuredAt: measurement.measuredAt,
      waterLocationCode: measurement.locationCode,
      waterLocationName: measurement.locationName || bridge.waterLocationLabel,
      waterStatus: ageMs > 6 * 60 * 60 * 1000 ? "stale" : "current",
      waterMessage: ageMs > 6 * 60 * 60 * 1000 ? "Laatste meting is ouder dan 6 uur" : "Actuele RWS-meting",
      waterSourceUrl: WATER_SOURCE_URL
    };
  }
  return unavailableWater(bridge);
}

function mergeWaterData(data, measurements, previousData = null) {
  const previousById = new Map((previousData?.bridges ?? []).map((bridge) => [bridge.id, bridge]));
  return {
    ...data,
    waterSource: "Rijkswaterstaat Waterinfo",
    waterSourceUrl: WATER_SOURCE_URL,
    bridges: data.bridges.map((bridge) => {
      const fresh = waterForBridge(bridge, measurements);
      if (fresh.waterLevelMetres !== null) return { ...bridge, ...fresh };
      const previous = previousById.get(bridge.id);
      if (previous?.waterLevelMetres !== null && previous?.waterLevelMetres !== undefined) {
        return {
          ...bridge,
          waterLevelMetres: previous.waterLevelMetres,
          waterMeasuredAt: previous.waterMeasuredAt,
          waterLocationCode: previous.waterLocationCode,
          waterLocationName: previous.waterLocationName,
          waterStatus: "stale",
          waterMessage: "Laatste succesvolle RWS-meting",
          waterSourceUrl: WATER_SOURCE_URL
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
      const opportunity = scheduleOpportunity(bridge, now);
      return {
        ...bridge,
        nextOpportunity: opportunity.instant?.toISOString() ?? null,
        opportunityLabel: opportunity.label,
        opportunityState: opportunity.state,
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
      const measurements = await downloadWaterLevels();
      dashboardData = mergeWaterData(dashboardData, measurements, previousData);
    } catch (error) {
      errors.push(`Waterinfo: ${error instanceof Error ? error.message : String(error)}`);
      dashboardData = mergeWaterData(dashboardData, new Map(), previousData);
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
:root{--bg:#e7eef1;--card:#fff;--ink:#102f40;--muted:#5a707b;--line:#d5e1e6;--navy:#0b3d54;--teal:#087e82;--pale:#eef5f6;--warm:#fff4e5;--red:#b83d38;--shadow:0 5px 18px rgba(24,52,67,.12)}
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--bg);font-family:Arial,sans-serif;color:var(--ink)}
main{height:100dvh;padding:8px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:8px}
.card{min-height:0;background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:11px;display:flex;flex-direction:column;gap:7px;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
h2{font-size:clamp(22px,2.15vw,34px);line-height:1;margin:0;font-weight:900;letter-spacing:-.035em}.short{font-size:11px;color:var(--muted);margin-top:4px;font-weight:700}.badge{font-size:9px;font-weight:900;letter-spacing:.04em;border-radius:999px;padding:5px 7px;background:#edf1f3;color:#566a74;white-space:nowrap}.card[data-live="open"] .badge{background:#ffe2df;color:var(--red)}.card[data-live="planned"] .badge,.card[data-live="requested"] .badge{background:#dff3f1;color:#08716f}.card[data-live="unavailable"] .badge{background:#fff0dc;color:#8c561d}
.next{background:linear-gradient(135deg,#0b3d54,#095b68);color:#fff;border-radius:11px;padding:9px 12px}.next-label{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#b7e0e5;font-weight:900}.next-time{font-size:clamp(40px,4.6vw,70px);font-weight:900;line-height:.93;margin-top:4px;letter-spacing:-.045em}.next-day{font-size:11px;color:#d9ebef;margin-top:5px;font-weight:700}
.data-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.data-box{min-width:0;border-radius:10px;padding:8px 9px;background:var(--pale);border:1px solid #d9e9eb}.data-label{font-size:9px;text-transform:uppercase;letter-spacing:.075em;color:#51717a;font-weight:900}.water-value{font-size:clamp(22px,2.3vw,34px);font-weight:900;line-height:1;margin-top:4px;color:#075d68}.data-detail{font-size:9px;line-height:1.2;color:var(--muted);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.live-value{font-size:clamp(14px,1.35vw,20px);font-weight:900;line-height:1.05;margin-top:5px}.live-detail{font-size:9px;color:var(--muted);margin-top:5px;line-height:1.2}
.schedule{flex:1;background:#f5f8f9;border-radius:9px;padding:7px 9px;font-size:10px;line-height:1.25;color:#344f5b;overflow:hidden}.schedule strong{color:var(--ink)}
.foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding-top:5px;border-top:1px solid var(--line);font-size:8px;color:var(--muted)}.links{display:flex;gap:8px}.foot a{color:var(--teal);font-weight:900;text-decoration:none}.status{position:fixed;right:10px;bottom:3px;font-size:8px;color:#718993;background:rgba(231,238,241,.92);padding:2px 5px;border-radius:5px;pointer-events:none}
@media(max-width:850px){main{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:5px;padding:5px}.card{padding:7px;gap:4px;border-radius:9px}h2{font-size:18px}.short{font-size:8px}.next{padding:6px 8px}.next-time{font-size:31px}.next-label,.next-day{font-size:8px}.data-row{gap:4px}.data-box{padding:5px}.water-value{font-size:20px}.live-value{font-size:12px}.data-detail,.live-detail{font-size:7px}.schedule{font-size:8px;padding:5px}.badge{font-size:7px;padding:3px 5px}.foot{font-size:6px}}
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
  return {time:timeFmt.format(d),day:dayFmt.format(d)+' · opening niet gegarandeerd'};
}
function water(b){
  if(typeof b.waterLevelMetres!=='number')return {value:'—',detail:b.waterMessage||'Geen actuele meting'};
  const sign=b.waterLevelMetres>0?'+':'';
  return {value:sign+b.waterLevelMetres.toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2})+' m',detail:'t.o.v. NAP · '+(b.waterMeasuredAt?timeFmt.format(new Date(b.waterMeasuredAt)):'tijd onbekend')};
}
function live(b){
  if(b.liveStart){const d=new Date(b.liveStart);return {value:b.liveLabel.replace('NDW: ',''),detail:dayFmt.format(d)+' '+timeFmt.format(d)};}
  return {value:b.liveLabel.replace('NDW: ',''),detail:b.liveMessage};
}
function render(data){
  cards.innerHTML='';
  for(const b of data.bridges){
    const o=opportunity(b),w=water(b),l=live(b);
    const article=document.createElement('article');article.className='card';article.dataset.live=b.liveStatus;
    article.innerHTML=
      '<div class="top"><div><h2>'+escapeHtml(b.name)+'</h2><div class="short">'+escapeHtml(b.short)+'</div></div><span class="badge">'+escapeHtml(b.liveLabel.replace('NDW: ',''))+'</span></div>'+ 
      '<div class="next"><div class="next-label">'+escapeHtml(b.opportunityLabel)+'</div><div class="next-time">'+escapeHtml(o.time)+'</div><div class="next-day">'+escapeHtml(o.day)+'</div></div>'+ 
      '<div class="data-row"><div class="data-box"><div class="data-label">Actuele waterstand</div><div class="water-value">'+escapeHtml(w.value)+'</div><div class="data-detail" title="'+escapeHtml(b.waterLocationName||'')+'">'+escapeHtml(w.detail)+'</div></div><div class="data-box"><div class="data-label">Concrete opening NDW</div><div class="live-value">'+escapeHtml(l.value)+'</div><div class="live-detail">'+escapeHtml(l.detail)+'</div></div></div>'+ 
      '<div class="schedule"><strong>Bediening pleziervaart:</strong> '+escapeHtml(b.scheduleText)+'</div>'+ 
      '<div class="foot"><span>'+escapeHtml(b.waterLocationName||'RWS meetpunt')+'</span><span class="links"><a href="'+escapeHtml(b.scheduleSource)+'" target="_blank" rel="noopener">tijden</a><a href="'+escapeHtml(b.waterSourceUrl||'https://waterinfo.rws.nl/')+'" target="_blank" rel="noopener">water</a></span></div>';
    cards.appendChild(article);
  }
}
async function load(){
  try{
    const response=await fetch('/api/dashboard',{cache:'no-store'});const payload=await response.json();
    if(!payload.data)throw new Error(payload.error||'Geen gegevens');render(payload.data);
    const stamp=payload.data.publicationTime||payload.lastSuccessAt||payload.data.processedAt;
    statusEl.textContent=(payload.error?'laatste gegevens · ':'live · ')+(stamp?stampFmt.format(new Date(stamp)):'tijd onbekend');
  }catch(error){statusEl.textContent='fout: '+(error.message||error);}
}
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
