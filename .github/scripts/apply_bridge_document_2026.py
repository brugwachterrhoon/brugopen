from pathlib import Path
import re

path = Path('server.mjs')
s = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'Expected text not found for {label}')
    s = s.replace(old, new, 1)

# Wind limits from Openingstijden bruggen Verkeerscentrale Rhoon, vanaf 4-05-2026.
replace_once('id: "spijkenisserbrug",\n    windAlertAboveBft: 8,', 'id: "spijkenisserbrug",\n    windAlertAboveBft: 9,', 'Spijkenisserbrug wind')
replace_once('id: "papendrechtsebrug",\n    windAlertAboveBft: 6,', 'id: "papendrechtsebrug",\n    windAlertAboveBft: 5,', 'Papendrechtsebrug wind')
replace_once('id: "hartelbrug",\n    windAlertAboveBft: 7,', 'id: "hartelbrug",\n    windAlertAboveBft: 6,', 'Hartelbrug wind')

# Document uses Bft > X, so warning starts strictly above the stated value.
replace_once('v.bft>=b.windAlertAboveBft', 'v.bft>b.windAlertAboveBft', 'wind comparison')
s = s.replace("' Bft heeft de bedieningsgrens van '+b.windAlertAboveBft+' Bft bereikt'", "' Bft is hoger dan de bedieningsgrens van '+b.windAlertAboveBft+' Bft'")

# Bridge description text.
replace_once(
    'scheduleText: "Ma–vr pleziervaart: 00:00–06:30, 09:30–15:30 en 18:30–24:00. Tussen 06:00–22:00 bediening om :15 en :45.",',
    'scheduleText: "Ma–vr pleziervaart: 00:00–06:30, 09:30–15:30 en 18:30–24:00. Tussen 06:00–22:00 kwart over en kwart voor het hele uur.",',
    'Botlek text'
)
replace_once(
    'scheduleText: "Zomerregeling met vaste pleziervaartmomenten; de twee eerstvolgende worden hierboven getoond.",\n    professionalText: "Beroepsvaart kan extra of afwijkende bediening hebben.",',
    'scheduleText: "1 apr–31 okt ma–vr: 10:00, 11:00, 12:00, 13:00, 14:00, 16:00 en 18:15; 19:00–07:15 bij aanbod. Za/zo/feest: 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 16:00 en 18:00; 1 jun–30 sep ook 15:00; 19:00–07:15 bij aanbod. 1 nov–31 mrt bij aanbod.",\n    professionalText: "1 apr–31 okt ma–vr ook 09:15 alleen beroepsvaart. 1 nov–31 mrt ma–vr geen bediening 07:15–09:15 en 16:00–18:15.",',
    'Alblasserdam text'
)
replace_once(
    'scheduleText: "Geen reguliere bediening tijdens de renovatie. Lage scheepvaart kan onder het vaste deel door, behalve tijdens afzonderlijk gemelde stremmingen.",',
    'scheduleText: "Tijdelijke renovatieregeling heeft voorrang. Basisregeling vanaf 4 mei 2026: ma–vr 06:35 en 08:50 alleen beroepsvaart; 09:35 t/m 15:35 elk uur; 18:35; 19:35–06:00 bij aanbod. Za/zo/feest 08:50; 09:35 t/m 16:35 elk uur; 18:35; 19:35–07:35 bij aanbod; 1 jul–31 aug ook 17:35.",',
    'Papendrecht text'
)
replace_once(
    'scheduleText: "24 uur op afroep, minimaal 2 uur vooraf. Werkdagen niet tijdens 06:45–08:30 en 16:00–18:30.",\n    professionalText: "Dezelfde afroepregeling; geen afzonderlijke tweede mogelijkheid weergegeven.",',
    'scheduleText: "Ma–vr: 00:00–06:45, 08:30–16:00 en 18:30–24:00. Za/zo/feest: 00:00–24:00.",\n    professionalText: "Bedienvensters volgens regeling vanaf 4 mei 2026.",',
    'Hartel text'
)
replace_once(
    'scheduleText: "Zomer: werkdagen 09:30–15:30 en 18:30–22:00; weekend 09:30–22:00. Bij aanvraag of aanbod.",',
    'scheduleText: "1 apr–31 okt ma–vr: 09:30–15:30 en 18:30–22:00; za/zo/feest 09:30–22:00. 1 nov–31 mrt ma–vr: 09:30–15:30 en 18:30–19:30; za/zo/feest 09:30–17:00. Geen bediening 25 en 26 december en 1 januari.",',
    'Wantij text'
)
replace_once(
    'audienceLabel: "Geen pleziervaart",\n    showNightPassage: false,\n    displayMode: "notice",\n    timingTitle: "Pleziervaart",\n    timingMain: "Geen bediening",\n    timingSub: "De Van Brienenoordbrug wordt niet geopend voor pleziervaart",\n    scheduleText: "Geen bediening voor pleziervaart.",\n    professionalText: "Op afroep 11:00–11:10, 14:00–14:10 en 19:30–19:40. Nacht 00:00–06:00 alleen na minimaal 12 uur vooraf aanvragen en goedkeuring; tussen 21:00–06:00 minimaal 1 uur tussen openingen.",',
    'audienceLabel: "Bediening op aanvraag",\n    showNightPassage: false,\n    displayMode: "schedule",\n    timingTitle: "Bediening op aanvraag",\n    timingMain: "11:00 · 14:00 · 19:30",\n    timingSub: "Aanvraag minimaal 12 uur vooraf",\n    scheduleText: "Alle dagen op aanvraag minimaal 12 uur vooraf: 11:00, 14:00 en 19:30; daarnaast 21:00–06:00. Niet voor zeilschepen / bruine vloot.",\n    professionalText: "Aanvragen via vc-zwm-brienenoordbrug@rws.nl.",',
    'Brienenoord text'
)
replace_once(
    'audienceLabel: "Geen pleziervaart",\n    showNightPassage: false,\n    displayMode: "notice",\n    timingTitle: "Pleziervaart",\n    timingMain: "Geen bediening",\n    timingSub: "De Calandbrug wordt niet geopend voor pleziervaart",\n    scheduleText: "Geen bediening voor pleziervaart.",',
    'audienceLabel: "24 uur bediening",\n    showNightPassage: false,\n    displayMode: "schedule",\n    timingTitle: "Bediening",\n    timingMain: "24 uur per dag",\n    timingSub: "Dagelijks",\n    scheduleText: "Dagelijks 24 uur per dag.",',
    'Caland text'
)
replace_once(
    'professionalText: "Dagelijks 00:00–23:59 op afroep. Verzoek circa 20 minuten vóór passage via VHF 22. Bediening tot en met gemiddeld 20,7 m/s wind (indicatief 8 Bft).",',
    'professionalText: "Dagelijks 24 uur per dag volgens de regeling vanaf 4 mei 2026.",',
    'Caland professional text'
)
replace_once(
    'scheduleText: "Tot 17 augustus 2026 20:00 geen bediening. Daarna: werkdagen 20:00; weekend 11:00, 13:00 en in juli/augustus ook 14:00.",\n    professionalText: "Nachtvensters zijn bij aanbod; op werkdagen minimaal 24 uur vooraf melden. Niet als vaste pleziervaarttijd getoond.",',
    'scheduleText: "Ma–vr: 11:00, 13:00 en 20:00; 22:00–04:30 bij aanbod. Za/zo/feest: 11:00 en 13:00; 20:00–08:00 bij aanbod. 1 jul–31 aug ook 14:00.",\n    professionalText: "Bediening bij aanbod in de genoemde nachtvensters.",',
    'Gorinchem text'
)

# Botlek: quarter-hour fixed moments are explicitly specified only between 06:00 and 22:00.
old = '''      const total = hour * 60 + minute;\n\n      if (!weekend) {'''
new = '''      const total = hour * 60 + minute;\n\n      if (total < 6 * 60 || total >= 22 * 60) continue;\n\n      if (!weekend) {'''
replace_once(old, new, 'Botlek fixed times')

# Alblasserdamsebrug fixed daytime times from 1 Apr through 31 Oct.
pattern = r'function alblasserdamTimes\(localDate\) \{.*?\n\}'
replacement = '''function alblasserdamTimes(localDate) {
  const season = localDate.month >= 4 && localDate.month <= 10;
  if (!season) return [];
  const weekend = isWeekendOrHoliday(localDate);
  if (!weekend) return [[10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [16, 0], [18, 15]];
  const values = [[9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [16, 0], [18, 0]];
  if (localDate.month >= 6 && localDate.month <= 9) values.push([15, 0]);
  values.sort((a, b) => (a[0] * 60 + a[1]) - (b[0] * 60 + b[1]));
  return values;
}'''
s2, count = re.subn(pattern, replacement, s, count=1, flags=re.S)
if count != 1:
    raise SystemExit('Could not replace Alblasserdam function')
s = s2

# Merwedebrug Gorinchem fixed daytime moments.
pattern = r'function gorinchemTimes\(localDate\) \{.*?\n\}'
replacement = '''function gorinchemTimes(localDate) {
  const weekend = isWeekendOrHoliday(localDate);
  const values = [[11, 0], [13, 0]];
  if (!weekend) values.push([20, 0]);
  if (localDate.month === 7 || localDate.month === 8) values.push([14, 0]);
  values.sort((a, b) => (a[0] * 60 + a[1]) - (b[0] * 60 + b[1]));
  return values;
}

function brienenoordTimes(localDate) {
  return [[11, 0], [14, 0], [19, 30]];
}

function wantijWindows(localDate) {
  const key = dateKey(localDate);
  if (key.endsWith('-01-01') || key.endsWith('-12-25') || key.endsWith('-12-26')) return [];
  const weekend = isWeekendOrHoliday(localDate);
  const summer = localDate.month >= 4 && localDate.month <= 10;
  if (summer) return weekend ? [[9, 30, 22, 0]] : [[9, 30, 15, 30], [18, 30, 22, 0]];
  return weekend ? [[9, 30, 17, 0]] : [[9, 30, 15, 30], [18, 30, 19, 30]];
}'''
s2, count = re.subn(pattern, replacement, s, count=1, flags=re.S)
if count != 1:
    raise SystemExit('Could not replace Gorinchem function')
s = s2

# Hartelbrug: document specifies direct operating windows, without the old 2-hour pre-notification rule.
pattern = r'function hartelOpportunity\(now\) \{.*?\n\}'
replacement = '''function hartelOpportunity(now) {
  const result = nextWindowOpportunity(now, (localDate) => {
    if (isWeekendOrHoliday(localDate)) return [[0, 0, 23, 59]];
    return [[0, 0, 6, 45], [8, 30, 16, 0], [18, 30, 23, 59]];
  }, "Nu binnen bedientijd");
  return result || { instant: null, nowPossible: false, label: "Geen bedientijd gevonden" };
}'''
s2, count = re.subn(pattern, replacement, s, count=1, flags=re.S)
if count != 1:
    raise SystemExit('Could not replace Hartel function')
s = s2

# Van Brienenoordbrug fixed request moments.
replace_once(
    'if (bridge.scheduleType === "brienenoord") {\n    return { instant: null, label: "Pleziervaart: minimaal 12 uur vooraf aanvragen", state: "request" };\n  }',
    'if (bridge.scheduleType === "brienenoord") {\n    const instant = futureCandidates(now, brienenoordTimes)[0] ?? null;\n    return { instant, label: "Op aanvraag · minimaal 12 uur vooraf", state: "request" };\n  }',
    'Brienenoord single opportunity'
)
replace_once(
    'if (bridge.scheduleType === "brienenoord") {\n    return {\n      first: null,\n      following: null,\n      followingText: "Na aanvraag en goedkeuring",\n      label: "Minimaal 12 uur vooraf aanvragen",\n      state: "request"\n    };\n  }',
    'if (bridge.scheduleType === "brienenoord") {\n    const values = futureCandidates(now, brienenoordTimes);\n    return {\n      first: values[0] ?? null,\n      following: values[1] ?? null,\n      followingText: "21:00–06:00 eveneens op aanvraag",\n      label: "Op aanvraag · minimaal 12 uur vooraf",\n      state: "request"\n    };\n  }',
    'Brienenoord opportunity list'
)

# Calandbrug is 24-hour daily operation in the supplied schedule.
replace_once('function calandOpportunity(now) {\n  return new Date(now.getTime() + 20 * 60 * 1000);\n}', 'function calandOpportunity(now) {\n  return new Date(now);\n}', 'Caland opportunity')
s = s.replace('label: "Op afroep na circa 20 minuten"', 'label: "Dagelijks 24 uur bediening"')
s = s.replace('followingText: "Daarna doorlopend op afroep",\n      label: "Verzoek circa 20 minuten vooraf"', 'followingText: "Doorlopend beschikbaar volgens standaardregeling",\n      label: "Dagelijks 24 uur bediening"')

# Wantijbrug seasonal windows and holiday closures in both schedule APIs.
old = '''const result = nextWindowOpportunity(now, (localDate) => {
      const weekend = isWeekendOrHoliday(localDate);
      return weekend
        ? [[9, 30, 22, 0]]
        : [[9, 30, 15, 30], [18, 30, 22, 0]];
    }, "Nu mogelijk bij aanvraag/aanbod");'''
new = '''const result = nextWindowOpportunity(now, wantijWindows, "Nu mogelijk bij aanvraag/aanbod");'''
replace_once(old, new, 'Wantij single opportunity')
old = '''const values = windowOpportunityList(now, (localDate) => {
      const weekend = isWeekendOrHoliday(localDate);
      return weekend
        ? [[9, 30, 22, 0]]
        : [[9, 30, 15, 30], [18, 30, 22, 0]];
    });'''
new = '''const values = windowOpportunityList(now, wantijWindows);'''
replace_once(old, new, 'Wantij opportunity list')

path.write_text(s, encoding='utf-8')
print('server.mjs patched successfully')
