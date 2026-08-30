from pathlib import Path

path = Path('server.mjs')
text = path.read_text(encoding='utf-8')
old = '.wind-value,.current-value{text-align:center}'
new = '.water-value,.wind-value,.current-value{text-align:center}'

if new in text:
    print('Waterstand is al gecentreerd.')
elif old in text:
    path.write_text(text.replace(old, new, 1), encoding='utf-8')
    print('Waterstand gecentreerd.')
else:
    raise SystemExit('Doelregel niet gevonden; niets gewijzigd.')
