import http from "node:http";
import { gunzipSync } from "node:zlib";

const PORT = Number(process.env.PORT || 3000);
const FEED_URL =
  process.env.NDW_FEED_URL ||
  "https://opendata.ndw.nu/planningsfeed_brugopeningen.xml.gz";
const REFRESH_INTERVAL_MS = Number(process.env.REFRESH_INTERVAL_MS || 300000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 20000);
const REFRESH_SECRET = process.env.REFRESH_SECRET || "";

const BRIDGES = [
  {
    id: "botlekbrug",
    name: "Botlekbrug",
    subtitle: "Nieuwe Botlekbrug · A15",
    isrs: "NLRTM001110888700281"
  },
  {
    id: "spijkenisserbrug",
    name: "Spijkenisserbrug",
    subtitle: "S102 · Oude Maas",
    isrs: "NLSPI001110572700266"
  },
  {
    id: "brug-over-de-noord",
    name: "Brug over de Noord",
    subtitle: "Alblasserdamsebrug · N915",
    isrs: "NLHIA001010577301210"
  },
  {
    id: "papendrechtsebrug",
    name: "Papendrechtsebrug",
    subtitle: "Merwedebrug Papendrecht · N3",
    isrs: "NLDOR001010577001143"
  },
  {
    id: "hartelbrug",
    name: "Hartelbrug",
    subtitle: "N218 · Hartelkanaal",
    isrs: "NLRTM0115B5487800010"
  },
  {
    id: "wantijbrug",
    name: "Wantijbrug",
    subtitle: "N3 · Dordrecht",
    isrs: "NLDOR001100553200025"
  }
];

let state = {
  data: null,
  lastSuccessAt: null,
  lastAttemptAt: null,
  error: null,
  refreshing: null
};

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
  const match = new RegExp(
    `${escaped}\\s*=\\s*["']([^"']+)["']`,
    "i"
  ).exec(openingTag);
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

  const openingTag =
    recordXml.match(/<(?:[\w.-]+:)?situationRecord\b[^>]*>/i)?.[0] ?? "";
  const situationTag =
    situationXml.match(/<(?:[\w.-]+:)?situation\b[^>]*>/i)?.[0] ?? "";

  return {
    id:
      attributeValue(openingTag, "id") ??
      attributeValue(situationTag, "id"),
    start: toIsoOrNull(tagValue(recordXml, "overallStartTime")),
    end: toIsoOrNull(tagValue(recordXml, "overallEndTime")),
    operatorActionStatus:
      tagValue(recordXml, "operatorActionStatus") ?? "unknown",
    probability:
      tagValue(recordXml, "probabilityOfOccurrence") ?? "unknown",
    ended:
      /<(?:[\w.-]+:)?(?:end|cancel)\b[^>]*>\s*true\s*<\//i.test(
        recordXml
      ),
    versionTime:
      toIsoOrNull(tagValue(recordXml, "situationRecordVersionTime")) ??
      toIsoOrNull(tagValue(situationXml, "situationVersionTime"))
  };
}

function durationMinutes(start, end) {
  const startMs = timestamp(start);
  const endMs = timestamp(end);
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return Math.round((endMs - startMs) / 60000);
}

function selectEvent(records, nowMs) {
  const usable = records.filter((record) => !record.ended && record.start);

  const active = usable
    .filter((record) => {
      const startMs = timestamp(record.start);
      const endMs = timestamp(record.end);
      const activeStatus = ["beingImplemented", "implemented"].includes(
        record.operatorActionStatus
      );
      return (
        activeStatus &&
        startMs !== null &&
        startMs <= nowMs &&
        (endMs === null || endMs > nowMs)
      );
    })
    .sort((a, b) => timestamp(b.start) - timestamp(a.start))[0];

  if (active) {
    return {
      status: "open",
      statusLabel: "Nu open",
      message: "De brugopening is volgens NDW momenteel actief.",
      start: active.start,
      end: active.end,
      durationMinutes: durationMinutes(active.start, active.end),
      operatorActionStatus: active.operatorActionStatus,
      probability: active.probability,
      eventId: active.id,
      eventVersionTime: active.versionTime
    };
  }

  const upcoming = usable
    .filter((record) => {
      const startMs = timestamp(record.start);
      return startMs !== null && startMs > nowMs;
    })
    .sort((a, b) => timestamp(a.start) - timestamp(b.start))[0];

  if (upcoming) {
    const requested = upcoming.operatorActionStatus === "requested";
    return {
      status: requested ? "requested" : "expected",
      statusLabel: requested ? "Aangevraagd" : "Gepland",
      message: requested
        ? "De opening is gemeld, maar nog niet als goedgekeurd aangeduid."
        : "Dit is de eerstvolgende opening in de actuele NDW-planningsfeed.",
      start: upcoming.start,
      end: upcoming.end,
      durationMinutes: durationMinutes(upcoming.start, upcoming.end),
      operatorActionStatus: upcoming.operatorActionStatus,
      probability: upcoming.probability,
      eventId: upcoming.id,
      eventVersionTime: upcoming.versionTime
    };
  }

  return {
    status: "none",
    statusLabel: "Geen melding",
    message:
      "De huidige NDW-feed bevat geen actieve of toekomstige opening voor deze brug.",
    start: null,
    end: null,
    durationMinutes: null,
    operatorActionStatus: null,
    probability: null,
    eventId: null,
    eventVersionTime: null
  };
}

function parseNdwBridgeFeed(xml) {
  if (typeof xml !== "string" || !xml.includes("<")) {
    throw new TypeError("De NDW-feed bevat geen geldige XML.");
  }

  const nowMs = Date.now();
  const publicationTime =
    toIsoOrNull(tagValue(xml, "publicationTime")) ??
    toIsoOrNull(tagValue(xml, "situationVersionTime"));
  const situations = chunks(xml, "situation");

  const bridges = BRIDGES.map((bridge) => {
    const matchingSituations = situations.filter((situation) =>
      containsBridge(situation, bridge)
    );
    const records = matchingSituations.flatMap((situation) =>
      chunks(situation, "situationRecord")
        .map((record) => parseRecord(record, situation))
        .filter(Boolean)
    );

    return {
      ...bridge,
      sourceUrl: FEED_URL,
      matchedSituations: matchingSituations.length,
      ...selectEvent(records, nowMs)
    };
  });

  return {
    source: "NDW Open Data · Planningsfeed Brugopeningen",
    sourceUrl: FEED_URL,
    publicationTime,
    processedAt: new Date().toISOString(),
    situationCount: situations.length,
    bridges
  };
}

function decodeFeed(buffer) {
  const bytes = new Uint8Array(buffer);
  const isGzip =
    bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  return isGzip
    ? gunzipSync(bytes).toString("utf8")
    : Buffer.from(bytes).toString("utf8");
}

async function downloadFeed() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(FEED_URL, {
      signal: controller.signal,
      headers: {
        accept: "application/xml, application/gzip;q=0.9, */*;q=0.8",
        "user-agent": "BrugwachterDashboard/2.0"
      }
    });

    if (!response.ok) {
      throw new Error(`NDW antwoordde met HTTP ${response.status}`);
    }

    return decodeFeed(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function refreshData({ force = false } = {}) {
  const age = state.lastSuccessAt
    ? Date.now() - new Date(state.lastSuccessAt).getTime()
    : Infinity;

  if (!force && state.data && age < REFRESH_INTERVAL_MS) return state.data;
  if (state.refreshing) return state.refreshing;

  state.refreshing = (async () => {
    state.lastAttemptAt = new Date().toISOString();

    try {
      const xml = await downloadFeed();
      state.data = parseNdwBridgeFeed(xml);
      state.lastSuccessAt = new Date().toISOString();
      state.error = null;
      console.log(
        `NDW-feed verwerkt: ${state.data.situationCount} situaties`
      );
      return state.data;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      console.error("NDW-feed ophalen mislukt:", state.error);
      if (!state.data) throw error;
      return state.data;
    } finally {
      state.refreshing = null;
    }
  })();

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
  const bearer =
    req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const headerSecret = req.headers["x-refresh-secret"] ?? "";
  const querySecret = url.searchParams.get("secret") ?? "";
  return [bearer, headerSecret, querySecret].includes(REFRESH_SECRET);
}

function dashboardPayload() {
  const staleMs = state.lastSuccessAt
    ? Date.now() - new Date(state.lastSuccessAt).getTime()
    : Infinity;

  return {
    ok: Boolean(state.data),
    stale: staleMs > REFRESH_INTERVAL_MS * 3,
    lastSuccessAt: state.lastSuccessAt,
    lastAttemptAt: state.lastAttemptAt,
    error: state.error,
    refreshIntervalSeconds: Math.round(REFRESH_INTERVAL_MS / 1000),
    data: state.data
  };
}

const HTML = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brugwachter Live</title>
<meta name="description" content="Actuele en geplande brugopeningen uit de officiële NDW-planningsfeed.">
<style>
:root{
  --bg:#eef3f6;--ink:#142b3a;--muted:#607582;--card:#fff;
  --blue:#0b6674;--teal:#0d9b9c;--orange:#ef9b45;--red:#c84a45;
  --line:#d8e2e7;--shadow:0 12px 35px rgba(28,53,68,.10)
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,Arial,sans-serif}
.hero{padding:42px 24px;background:linear-gradient(135deg,#102f43,#0b6271);color:#fff}
.hero-inner{max-width:1180px;margin:auto}
.eyebrow{font-weight:800;letter-spacing:.13em;text-transform:uppercase;font-size:.75rem;color:#86e1dd}
h1{font-size:clamp(2rem,5vw,4.2rem);line-height:1.02;margin:.4rem 0 1rem;max-width:800px}
.hero p{max-width:740px;margin:0;color:#d9ecef;font-size:1.05rem;line-height:1.6}
main{max-width:1180px;margin:auto;padding:30px 20px 60px}
.toolbar{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:18px}
.toolbar h2{margin:0;font-size:1.8rem}
.meta{color:var(--muted);font-size:.9rem;margin-top:6px}
button{border:0;border-radius:12px;background:var(--teal);color:white;font-weight:800;padding:12px 18px;cursor:pointer}
button:disabled{opacity:.55;cursor:wait}
.notice{padding:13px 16px;border-radius:12px;margin:0 0 18px;background:#fff5e8;border:1px solid #f3d3a8;color:#7c511f}
.notice[hidden]{display:none}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:22px;box-shadow:var(--shadow)}
.card-head{display:flex;justify-content:space-between;gap:14px;align-items:start}
.card h3{margin:0;font-size:1.45rem}
.subtitle{margin:.35rem 0 0;color:var(--muted)}
.badge{font-size:.76rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;border-radius:999px;padding:7px 10px;background:#edf1f3;color:#52656f;white-space:nowrap}
.card[data-status="open"] .badge{background:#ffe7e5;color:var(--red)}
.card[data-status="expected"] .badge{background:#e3f4f2;color:#087572}
.card[data-status="requested"] .badge{background:#fff0dc;color:#9a5a12}
.opening{margin:20px 0;padding:18px;border-radius:15px;background:#123f55;color:#fff}
.label{font-size:.75rem;text-transform:uppercase;letter-spacing:.09em;color:#a9d5df;font-weight:800}
.time{font-size:1.5rem;font-weight:900;margin-top:7px}
.detail{margin-top:6px;color:#d9edf1}
.message{line-height:1.5;color:#425965;min-height:46px}
.footer{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid var(--line);padding-top:14px;margin-top:14px;font-size:.8rem;color:var(--muted)}
.footer a{color:var(--blue);font-weight:800}
.loading{opacity:.6}
@media(max-width:760px){
  .grid{grid-template-columns:1fr}.toolbar{align-items:start;flex-direction:column}
}
</style>
</head>
<body>
<header class="hero">
  <div class="hero-inner">
    <div class="eyebrow">Brugwachter Live</div>
    <h1>Wanneer is de volgende brugopening?</h1>
    <p>Een actueel overzicht van zes bruggen, uitsluitend op basis van de officiële NDW-planningsfeed voor brugopeningen.</p>
  </div>
</header>
<main>
  <div class="toolbar">
    <div>
      <h2>Zes bruggen in één overzicht</h2>
      <div class="meta" id="feedTime">Gegevens worden opgehaald…</div>
    </div>
    <button id="refresh">Nu vernieuwen</button>
  </div>
  <div class="notice" id="notice" hidden></div>
  <section class="grid" id="cards"></section>
</main>
<script>
const cards = document.querySelector("#cards");
const notice = document.querySelector("#notice");
const feedTime = document.querySelector("#feedTime");
const refreshButton = document.querySelector("#refresh");

const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone:"Europe/Amsterdam",
  weekday:"short",
  day:"2-digit",
  month:"short",
  hour:"2-digit",
  minute:"2-digit"
});

const timeFormatter = new Intl.DateTimeFormat("nl-NL", {
  timeZone:"Europe/Amsterdam",
  hour:"2-digit",
  minute:"2-digit"
});

function formatDate(iso){
  return iso ? dateFormatter.format(new Date(iso)).replace(" om "," · ") : "—";
}

function relativeTime(iso){
  if(!iso) return "";
  const seconds=Math.round((new Date(iso).getTime()-Date.now())/1000);
  const abs=Math.abs(seconds);
  const rtf=new Intl.RelativeTimeFormat("nl-NL",{numeric:"auto"});
  if(abs<5400) return rtf.format(Math.round(seconds/60),"minute");
  if(abs<129600) return rtf.format(Math.round(seconds/3600),"hour");
  return rtf.format(Math.round(seconds/86400),"day");
}

function presentation(bridge){
  if(bridge.status==="open"){
    return {
      label:"Huidige status",
      time:"NU OPEN",
      detail:bridge.end ? "Tot ongeveer "+timeFormatter.format(new Date(bridge.end)) : "Eindtijd niet gemeld"
    };
  }
  if(bridge.start){
    const duration=bridge.durationMinutes ? " · circa "+bridge.durationMinutes+" min" : "";
    return {
      label:"Volgende opening",
      time:formatDate(bridge.start),
      detail:relativeTime(bridge.start)+duration
    };
  }
  return {
    label:"Volgende opening",
    time:"Niet gemeld",
    detail:"Geen toekomstige opening in de huidige feed"
  };
}

function render(data){
  cards.innerHTML="";
  for(const bridge of data.bridges){
    const p=presentation(bridge);
    const card=document.createElement("article");
    card.className="card";
    card.dataset.status=bridge.status;
    card.innerHTML=\`
      <div class="card-head">
        <div>
          <h3>\${bridge.name}</h3>
          <p class="subtitle">\${bridge.subtitle}</p>
        </div>
        <span class="badge">\${bridge.statusLabel}</span>
      </div>
      <div class="opening">
        <div class="label">\${p.label}</div>
        <div class="time">\${p.time}</div>
        <div class="detail">\${p.detail}</div>
      </div>
      <div class="message">\${bridge.message}</div>
      <div class="footer">
        <span>ISRS \${bridge.isrs}</span>
        <a href="\${bridge.sourceUrl}" target="_blank" rel="noopener">Officiële bron</a>
      </div>
    \`;
    cards.appendChild(card);
  }
}

async function load(){
  refreshButton.disabled=true;
  cards.classList.add("loading");
  try{
    const response=await fetch("/api/dashboard",{cache:"no-store"});
    const payload=await response.json();
    if(!response.ok || !payload.data) throw new Error(payload.error || "Geen gegevens ontvangen.");
    render(payload.data);
    const stamp=payload.data.publicationTime || payload.lastSuccessAt;
    feedTime.textContent=stamp ? "NDW bijgewerkt: "+formatDate(stamp) : "NDW-tijd onbekend";
    if(payload.error){
      notice.hidden=false;
      notice.textContent="Nieuwe gegevens konden niet worden opgehaald. De laatste succesvolle gegevens worden getoond. "+payload.error;
    }else if(payload.stale){
      notice.hidden=false;
      notice.textContent="De brongegevens zijn ouder dan verwacht.";
    }else{
      notice.hidden=true;
    }
  }catch(error){
    notice.hidden=false;
    notice.textContent=error.message || String(error);
    feedTime.textContent="Gegevens niet beschikbaar";
  }finally{
    refreshButton.disabled=false;
    cards.classList.remove("loading");
  }
}

refreshButton.addEventListener("click",load);
load();
setInterval(load,60000);
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`
  );

  try {
    if (url.pathname === "/health") {
      json(res, 200, {
        status: "ok",
        source: "NDW",
        lastSuccessAt: state.lastSuccessAt,
        error: state.error
      });
      return;
    }

    if (url.pathname === "/api/dashboard") {
      await refreshData();
      json(res, state.data ? 200 : 503, dashboardPayload());
      return;
    }

    if (url.pathname === "/api/refresh") {
      if (!requestHasRefreshAccess(req, url)) {
        json(res, 403, {
          ok: false,
          error: REFRESH_SECRET
            ? "Ongeldig refresh-geheim."
            : "REFRESH_SECRET is niet ingesteld."
        });
        return;
      }
      await refreshData({ force: true });
      json(res, state.data ? 200 : 503, dashboardPayload());
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

    res.writeHead(404, {
      "content-type": "text/plain; charset=utf-8"
    });
    res.end("Niet gevonden");
  } catch (error) {
    json(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
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
