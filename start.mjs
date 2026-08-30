import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(dir, "server.mjs");
const runtimePath = join(dir, ".server-runtime.mjs");
let source = readFileSync(sourcePath, "utf8");

const replacements = [
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
