from pathlib import Path
import re

p=Path('server.mjs')
s=p.read_text(encoding='utf-8')

marker='const BRIDGES = ['
insert='''const CURRENT_LOCATION_HINTS = {\n  "botlekbrug": ["botlek", "oudemaas", "oude maas"],\n  "spijkenisserbrug": ["spijkenisse", "oudemaas", "oude maas"],\n  "brug-over-de-noord": ["alblasserdam", "noord"],\n  "papendrechtsebrug": ["papendrecht", "benedenmerwede", "beneden merwede"],\n  "hartelbrug": ["hartel", "hartelkanaal"],\n  "wantijbrug": ["wantij", "dordrecht"],\n  "van-brienenoordbrug": ["brienenoord", "nieuwemaas", "nieuwe maas"],\n  "calandbrug": ["caland", "calandkanaal"],\n  "merwedebrug-gorinchem": ["gorinchem", "bovenmerwede", "boven merwede"]\n};\n\n'''
if 'const CURRENT_LOCATION_HINTS = {' not in s:
    s=s.replace(marker,insert+marker,1)

pattern=r'''function currentForBridge\(bridge, stations\) \{.*?\n\}\n\nfunction mergeCurrentData'''
replacement='''function currentForBridge(bridge, stations) {\n  const hints = CURRENT_LOCATION_HINTS[bridge.id] ?? [];\n  const scored = [];\n\n  for (const station of stations) {\n    if (!Number.isFinite(station.valueMps) || !Number.isFinite(station.latitude) || !Number.isFinite(station.longitude)) continue;\n    const distanceKm = haversineKm(bridge.latitude, bridge.longitude, station.latitude, station.longitude);\n    const stationText = `${station.locationCode || ""} ${station.locationName || ""}`.toLowerCase();\n    const matchesWaterway = hints.some((hint) => stationText.includes(hint));\n    scored.push({ station, distanceKm, matchesWaterway });\n  }\n\n  const preferred = scored\n    .filter((item) => item.matchesWaterway && item.distanceKm <= 25)\n    .sort((a, b) => a.distanceKm - b.distanceKm)[0];\n  const fallback = scored\n    .filter((item) => item.distanceKm <= 8)\n    .sort((a, b) => a.distanceKm - b.distanceKm)[0];\n  const best = preferred || fallback;\n\n  if (!best) return unavailableCurrent("Geen passend stroommeetpunt voor deze vaarweg gevonden");\n  const { station, distanceKm } = best;\n  const ageMs = Date.now() - timestamp(station.measuredAt);\n  return {\n    currentSpeedMps: station.valueMps,\n    currentDirectionDegrees: station.directionDegrees,\n    currentMeasuredAt: station.measuredAt,\n    currentLocationCode: station.locationCode,\n    currentLocationName: station.locationName || "RWS stroommeetpunt",\n    currentDistanceKm: Math.round(distanceKm * 10) / 10,\n    currentStatus: ageMs > 6 * 60 * 60 * 1000 ? "stale" : "current",\n    currentMessage: ageMs > 6 * 60 * 60 * 1000\n      ? "Stroommeting voor deze vaarweg is ouder dan 6 uur"\n      : best.matchesWaterway ? "Stroommeetpunt geselecteerd op dezelfde vaarweg" : "Dichtstbijzijnde passend stroommeetpunt",\n    currentSourceUrl: WATER_SOURCE_URL\n  };\n}\n\nfunction mergeCurrentData'''
s2,n=re.subn(pattern,replacement,s,count=1,flags=re.S)
if n!=1:
    raise SystemExit('currentForBridge niet gevonden')
p.write_text(s2,encoding='utf-8')
