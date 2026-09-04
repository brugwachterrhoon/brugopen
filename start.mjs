import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(dir, "server.mjs");
const runtimePath = join(dir, ".server-runtime.mjs");
let source = readFileSync(sourcePath, "utf8");

const replacements = [
  [
    "--warm:#342619;",
    "--warm:#2b2d2f;"
  ],
  [
    "border-top:3px solid var(--orange);",
    "border-top:4px solid var(--orange);"
  ],
  [
    ".data-row{display:grid;grid-template-columns:repeat(3,minmax(68px,.48fr)) minmax(0,1.72fr);gap:4px}",
    ".data-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}"
  ],
  [
    "<div class=\"top-actions\"><span class=\"badge\">'+escapeHtml(b.liveSource==='PIN'?'PIN':b.liveSource==='BAS'?'BAS':'LIVE')+'</span><span class=\"clearance-badge\" title=\"Doorvaarthoogte gesloten/beweegbaar deel bij NAP\">'+escapeHtml(b.clearanceNap||'—')+'</span></div>",
    "<div class=\"top-actions\"><span class=\"clearance-badge\" title=\"Doorvaarthoogte gesloten/beweegbaar deel bij NAP\">'+escapeHtml(b.clearanceNap||'—')+'</span></div>"
  ],
  [
    "<div class=\"data-box\" title=\"'+escapeHtml(b.currentLocationName||'Geen RWS stroommeetpunt')+'\"><div class=\"data-label\">Stroming</div><div class=\"current-value\">'+escapeHtml(c.value)+'</div><div class=\"data-unit\">'+escapeHtml(c.unit)+'</div><div class=\"data-detail\">'+escapeHtml(c.detail)+'</div></div><div class=\"data-box message-box\"><div class=\"message-head\"><span class=\"message-source\">'+escapeHtml(l.source)+'</span><span class=\"live-value\">'+escapeHtml(l.value)+'</span></div><div class=\"restriction-period\"><div class=\"restriction-label\">Stremming</div><div class=\"restriction-value\">'+escapeHtml(l.start)+'<span class=\"restriction-arrow\">→</span>'+escapeHtml(l.end)+'</div></div>'+interimHtml+'<div class=\"live-detail\">'+escapeHtml(l.detail)+'</div></div>",
    ""
  ],
  [
    "<div class=\"foot\"><span title=\"Water: '+escapeHtml(b.waterLocationName||'RWS meetpunt')+' · Wind: '+escapeHtml(b.windLocationName||'RWS windmeetpunt')+' · Stroming: '+escapeHtml(b.currentLocationName||'geen meetpunt')+'\">RWS water · wind · stroming</span><span class=\"links\">'+(b.liveSource==='BAS'?'<a href=\"'+escapeHtml(b.basSourceUrl)+'\" target=\"_blank\" rel=\"noopener\">BAS</a>':'')+'<a href=\"'+escapeHtml(b.scheduleSource)+'\" target=\"_blank\" rel=\"noopener\">tijden</a><a href=\"'+escapeHtml(b.waterSourceUrl||'https://waterinfo.rws.nl/')+'\" target=\"_blank\" rel=\"noopener\">metingen</a></span></div>",
    "<div class=\"foot\"><span title=\"Water: '+escapeHtml(b.waterLocationName||'RWS meetpunt')+' · Wind: '+escapeHtml(b.windLocationName||'RWS windmeetpunt')+'\">RWS water · wind</span><span class=\"links\"><a href=\"'+escapeHtml(b.scheduleSource)+'\" target=\"_blank\" rel=\"noopener\">tijden</a><a href=\"'+escapeHtml(b.waterSourceUrl||'https://waterinfo.rws.nl/')+'\" target=\"_blank\" rel=\"noopener\">metingen</a></span></div>"
  ],
  [
`function selectBasMessage(messages, nowMs = Date.now()) {
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
}`,
`function selectBasMessage(messages, nowMs = Date.now()) {
  // BAS kan een overkoepelend bericht bevatten dat meerdere losse
  // stremmingsvensters omvat. Zo'n parent mag de tussenliggende uren niet
  // ten onrechte rood maken wanneer er kortere child-vensters aanwezig zijn.
  const isContainer = (message) => {
    if (!message?.number) return false;
    const startMs = timestamp(message.start);
    const endMs = timestamp(message.end);
    if (startMs === null || endMs === null || endMs <= startMs) return false;
    return messages.some((other) => {
      if (other === message || other.number !== message.number) return false;
      const otherStart = timestamp(other.start);
      const otherEnd = timestamp(other.end);
      if (otherStart === null || otherEnd === null || otherEnd <= otherStart) return false;
      return otherStart >= startMs && otherEnd <= endMs &&
        (otherStart > startMs || otherEnd < endMs) &&
        (otherEnd - otherStart) < (endMs - startMs);
    });
  };

  const effective = messages.filter((message) => !isContainer(message));
  const current = effective
    .filter((message) => {
      const startMs = timestamp(message.start);
      const endMs = timestamp(message.end);
      return (startMs === null || startMs <= nowMs) && (endMs === null || endMs > nowMs);
    })
    .sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff) return priorityDiff;
      const aStart = timestamp(a.start) ?? -Infinity;
      const bStart = timestamp(b.start) ?? -Infinity;
      if (aStart !== bStart) return bStart - aStart;
      const aDuration = (timestamp(a.end) ?? Infinity) - aStart;
      const bDuration = (timestamp(b.end) ?? Infinity) - bStart;
      return aDuration - bDuration;
    })[0];

  if (current) return { message: current, active: true };

  const upcoming = effective
    .filter((message) => (timestamp(message.start) ?? -Infinity) > nowMs)
    .sort((a, b) => timestamp(a.start) - timestamp(b.start) || b.priority - a.priority)[0];
  return upcoming ? { message: upcoming, active: false } : null;
}`
  ]
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) {
    throw new Error(`Display-patch kon doeltekst niet vinden: ${from.slice(0, 80)}`);
  }
  source = source.replace(from, to);
}

writeFileSync(runtimePath, source, "utf8");
await import(pathToFileURL(runtimePath).href + `?v=${Date.now()}`);