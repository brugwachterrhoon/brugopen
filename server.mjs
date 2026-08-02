import http from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function loadEnvFile() {
  const envPath = join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-5.6";

const BRIDGES = [
  { id: "botlekbrug", name: "Botlekbrug", waterway: "Oude Maas", location: "Rotterdam / Hoogvliet" },
  { id: "spijkenisserbrug", name: "Spijkenisserbrug", waterway: "Oude Maas", location: "Spijkenisse / Hoogvliet" },
  { id: "alblasserdamsebrug", name: "Alblasserdamsebrug", waterway: "De Noord", location: "Alblasserdam / Hendrik-Ido-Ambacht" },
  { id: "papendrechtsebrug", name: "Papendrechtsebrug", waterway: "Beneden-Merwede", location: "Papendrecht / Dordrecht" },
  { id: "hartelbrug", name: "Hartelbrug", waterway: "Hartelkanaal", location: "Spijkenisse / Botlek" },
  { id: "wantijbrug", name: "Wantijbrug", waterway: "Wantij", location: "Dordrecht" }
];

const OFFICIAL_DOMAINS = [
  "rijkswaterstaat.nl",
  "open.rijkswaterstaat.nl",
  "vaarweginformatie.nl",
  "waterinfo.rws.nl",
  "rijkswaterstaatdata.nl",
  "knmi.nl",
  "data.knmi.nl",
  "dataplatform.knmi.nl",
  "pin.portofrotterdam.com",
  "portofrotterdam.com",
  "zuid-holland.nl",
  "rotterdam.nl",
  "nissewaard.nl",
  "dordrecht.nl",
  "papendrecht.nl",
  "alblasserdam.nl",
  "h-i-ambacht.nl",
  "overheid.nl",
  "officielebekendmakingen.nl"
];

const DASHBOARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["checked_at", "summary", "bridges"],
  properties: {
    checked_at: { type: "string" },
    summary: { type: "string" },
    bridges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "status", "status_text", "next_opening", "next_opening_type",
          "opening_updated_at", "water_label", "water_value", "water_time",
          "wind_label", "wind_speed", "wind_direction", "wind_time", "notes", "sources"
        ],
        properties: {
          id: { type: "string", enum: BRIDGES.map((bridge) => bridge.id) },
          status: { type: "string", enum: ["beschikbaar", "beperkt", "gestremd", "geen-bediening", "onbekend"] },
          status_text: { type: "string" },
          next_opening: { type: "string" },
          next_opening_type: { type: "string" },
          opening_updated_at: { type: "string" },
          water_label: { type: "string" },
          water_value: { type: "string" },
          water_time: { type: "string" },
          wind_label: { type: "string" },
          wind_speed: { type: "string" },
          wind_direction: { type: "string" },
          wind_time: { type: "string" },
          notes: { type: "array", items: { type: "string" } },
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "url", "information_time"],
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                information_time: { type: "string" }
              }
            }
          }
        }
      }
    }
  }
};

const DASHBOARD_INSTRUCTION = `
Je maakt live nautische dashboarddata voor zes Nederlandse bruggen. Zoek ALTIJD opnieuw op internet.

BRONBELEID
- Gebruik uitsluitend officiële bronnen binnen de toegestane domeinen.
- Prioriteit: Vaarweginformatie.nl en actuele BAS/PIN-berichten voor bediening, stremming en werkzaamheden; Waterinfo Rijkswaterstaat voor waterstand; KNMI voor wind; daarna de officiële beheerder.
- Gebruik geen commerciële waterkaarten, weerwebsites, nieuwsmedia, sociale media, Wikipedia of eigen geheugen.
- Controleer publicatie-, meet- en geldigheidstijden. De meest recente officiële melding gaat voor een reguliere regeling.
- Vermeld uitsluitend URLs die je werkelijk hebt geraadpleegd.

PER BRUG
1. Bepaal de actuele nautische status en de eerstvolgende toegestane brugbediening/openingsmogelijkheid NA de controletijd.
2. Als de brug alleen op aanvraag wordt bediend en geen vast tijdstip officieel is vastgesteld, schrijf dan bijvoorbeeld "Op aanvraag" en verzin geen kloktijd.
3. Als de brug is gestremd of niet wordt bediend, zet dit expliciet in status en next_opening.
4. Maak onderscheid tussen beroepsvaart en recreatievaart wanneer de officiële regeling dat doet. Zet dit in notes.
5. Waterstand: gebruik alleen een officiële verwachting voor het openingstijdstip als die beschikbaar is. Anders mag je de laatste officiële meting tonen, maar water_label moet dan letterlijk duidelijk maken dat dit NIET de stand op het openingstijdstip is. Niet interpoleren of zelf berekenen.
6. Wind: gebruik alleen een officiële KNMI-verwachting voor de omgeving en het openingstijdstip. Als die niet betrouwbaar beschikbaar is, mag je een actuele officiële KNMI-meting tonen met een duidelijk label, of "Geen officiële live data". Gebruik geen andere weersbron.
7. Laat elk niet-verifieerbaar veld als "Geen officiële live data" of "Niet officieel vast te stellen" staan. Nooit schatten.
8. Gebruik absolute Nederlandse datum en tijd, bijvoorbeeld "2 augustus 2026, 20:30". Vermeld tijdzone Europe/Amsterdam.
9. Houd status_text en notes kort en praktisch.

De zes ids moeten exact één keer voorkomen: botlekbrug, spijkenisserbrug, alblasserdamsebrug, papendrechtsebrug, hartelbrug, wantijbrug.
Geef uitsluitend JSON volgens het opgegeven schema.
`;

const QA_INSTRUCTION = `
Je bent Brugwachter Live, een nauwkeurige Nederlandstalige nautische informatie-assistent.
- Zoek bij iedere inhoudelijke vraag live op internet.
- Gebruik uitsluitend officiële bronnen binnen de toegestane domeinen.
- Beantwoord kort met opsommingstekens.
- Vermeld status, object/locatie, datum/tijd, officiële bron en volledige bron-URL.
- Geef de meest recente officiële melding voorrang en benoem tegenstrijdigheden.
- Is actuele officiële informatie niet beschikbaar, zeg dat direct. Verzin of schat nooit gegevens.
- Volg voor navigatie altijd officiële bebording, verkeersbegeleiding, marifoonberichten en aanwijzingen van de vaarwegbeheerder.
`;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const buckets = new Map();
function isRateLimited(ip, route) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = route === "dashboard" ? 5 : 12;
  const key = `${ip}:${route}`;
  const recent = (buckets.get(key) || []).filter((time) => now - time < windowMs);
  recent.push(now);
  buckets.set(key, recent);
  return recent.length > maxRequests;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 30_000) {
        reject(new Error("Verzoek is te groot."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function isOfficialUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function getOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text;
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

function extractSources(response) {
  const sourceMap = new Map();
  for (const item of response.output || []) {
    if (item.type !== "web_search_call") continue;
    for (const source of item.action?.sources || []) {
      if (source.url && isOfficialUrl(source.url)) {
        sourceMap.set(source.url, { title: source.title || source.url, url: source.url });
      }
    }
  }
  return [...sourceMap.values()];
}

function emptyBridge(bridge, message = "Geen verifieerbare live informatie ontvangen.") {
  return {
    ...bridge,
    status: "onbekend",
    status_text: message,
    next_opening: "Niet officieel vast te stellen",
    next_opening_type: "Geen officiële live data",
    opening_updated_at: "",
    water_label: "Geen officiële live data",
    water_value: "—",
    water_time: "",
    wind_label: "Geen officiële live data",
    wind_speed: "—",
    wind_direction: "—",
    wind_time: "",
    notes: [],
    sources: []
  };
}

function normalizeDashboard(raw) {
  const byId = new Map((Array.isArray(raw?.bridges) ? raw.bridges : []).map((item) => [item.id, item]));
  const bridges = BRIDGES.map((bridge) => {
    const item = byId.get(bridge.id);
    if (!item) return emptyBridge(bridge);

    const sources = (Array.isArray(item.sources) ? item.sources : [])
      .filter((source) => source?.url && isOfficialUrl(source.url))
      .map((source) => ({
        title: String(source.title || "Officiële bron"),
        url: String(source.url),
        information_time: String(source.information_time || "")
      }));

    if (sources.length === 0) {
      return emptyBridge(bridge, "Geen officiële bron-URL bij de live gegevens ontvangen.");
    }

    const allowedStatuses = new Set(["beschikbaar", "beperkt", "gestremd", "geen-bediening", "onbekend"]);
    return {
      ...bridge,
      status: allowedStatuses.has(item.status) ? item.status : "onbekend",
      status_text: String(item.status_text || "Geen officiële live data"),
      next_opening: String(item.next_opening || "Niet officieel vast te stellen"),
      next_opening_type: String(item.next_opening_type || "Geen officiële live data"),
      opening_updated_at: String(item.opening_updated_at || ""),
      water_label: String(item.water_label || "Geen officiële live data"),
      water_value: String(item.water_value || "—"),
      water_time: String(item.water_time || ""),
      wind_label: String(item.wind_label || "Geen officiële live data"),
      wind_speed: String(item.wind_speed || "—"),
      wind_direction: String(item.wind_direction || "—"),
      wind_time: String(item.wind_time || ""),
      notes: (Array.isArray(item.notes) ? item.notes : []).map(String).slice(0, 5),
      sources: sources.slice(0, 6)
    };
  });

  return {
    checkedAt: new Date().toISOString(),
    reportedCheckedAt: String(raw?.checked_at || ""),
    summary: String(raw?.summary || "Live controle afgerond."),
    bridges
  };
}

async function callOpenAI({ input, instructions, schema = null }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("Live zoeken is nog niet geconfigureerd. Voeg OPENAI_API_KEY toe op de server.");
    error.code = "NOT_CONFIGURED";
    throw error;
  }

  const body = {
    model,
    reasoning: { effort: "medium" },
    tools: [{
      type: "web_search",
      filters: { allowed_domains: OFFICIAL_DOMAINS }
    }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    instructions,
    input,
    max_output_tokens: 9000
  };

  if (schema) {
    body.text = {
      format: {
        type: "json_schema",
        name: "brugwachter_dashboard",
        strict: true,
        schema
      }
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("De live zoekdienst gaf geen geldig antwoord.");
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || "De live zoekdienst is tijdelijk niet beschikbaar.");
  }

  return data;
}

async function getDashboard() {
  const now = new Date();
  const bridgeList = BRIDGES.map((bridge) => `- ${bridge.id}: ${bridge.name}, ${bridge.waterway}, ${bridge.location}`).join("\n");
  const response = await callOpenAI({
    instructions: DASHBOARD_INSTRUCTION,
    schema: DASHBOARD_SCHEMA,
    input: `Controletijd UTC: ${now.toISOString()}\nLokale tijdzone: Europe/Amsterdam\n\nBruggen:\n${bridgeList}\n\nZoek de actuele officiële gegevens en maak het dashboard.`
  });

  const outputText = getOutputText(response);
  if (!outputText) throw new Error("Er is geen gestructureerd live dashboard ontvangen.");

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("Het live dashboard kon niet worden verwerkt.");
  }

  return {
    ...normalizeDashboard(parsed),
    consultedSources: extractSources(response)
  };
}

async function askQuestion(question) {
  const response = await callOpenAI({
    instructions: QA_INSTRUCTION,
    input: `Huidige controletijd: ${new Date().toISOString()}\nTijdzone: Europe/Amsterdam\nVraag: ${question}`
  });

  const text = getOutputText(response);
  if (!text.trim()) throw new Error("Er is geen verifieerbaar live antwoord ontvangen.");
  return { text, sources: extractSources(response) };
}

async function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const normalized = normalize(safePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Verboden");
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'"
    });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Pagina niet gevonden");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, {
      status: "ok",
      liveSearchConfigured: Boolean(process.env.OPENAI_API_KEY),
      model,
      checkedAt: new Date().toISOString()
    });
  }

  if (req.method === "GET" && url.pathname === "/api/sources") {
    return sendJson(res, 200, { domains: OFFICIAL_DOMAINS });
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    if (isRateLimited(ip, "dashboard")) {
      return sendJson(res, 429, { error: "Te vaak vernieuwd. Probeer het over een minuut opnieuw.", checkedAt: new Date().toISOString() });
    }
    try {
      return sendJson(res, 200, await getDashboard());
    } catch (error) {
      const status = error.code === "NOT_CONFIGURED" ? 503 : 502;
      return sendJson(res, status, { error: error.message || "Live dashboard kon niet worden opgehaald.", checkedAt: new Date().toISOString() });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/ask") {
    if (isRateLimited(ip, "ask")) {
      return sendJson(res, 429, { error: "Te veel vragen. Probeer het over een minuut opnieuw." });
    }

    try {
      const body = JSON.parse(await readBody(req));
      const question = String(body.question || "").trim();
      if (question.length < 3) return sendJson(res, 400, { error: "Vul een duidelijke vraag of locatie in." });
      if (question.length > 800) return sendJson(res, 400, { error: "De vraag is te lang. Gebruik maximaal 800 tekens." });

      const result = await askQuestion(question);
      return sendJson(res, 200, { ...result, checkedAt: new Date().toISOString(), model });
    } catch (error) {
      const status = error.code === "NOT_CONFIGURED" ? 503 : 502;
      return sendJson(res, status, { error: error.message || "Live informatie kon niet worden opgehaald.", checkedAt: new Date().toISOString() });
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "Methode niet toegestaan." });
  }

  return serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Brugwachter Live draait op http://localhost:${port}`);
  console.log(`Live zoeken: ${process.env.OPENAI_API_KEY ? "geconfigureerd" : "nog niet geconfigureerd"}`);
});
