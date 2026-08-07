from pathlib import Path

path = Path('server.mjs')
s = path.read_text(encoding='utf-8')

# Closed/movable-span clearance at NAP from the supplied Verkeerscentrale Rhoon document.
clearances = {
    'botlekbrug': '14,00 m NAP',
    'spijkenisserbrug': '12,40 m NAP',
    'brug-over-de-noord': '7,55 m NAP',
    'papendrechtsebrug': '11,30 m NAP',
    'hartelbrug': '9,95 m NAP',
    'wantijbrug': '6,27 m NAP',
    'van-brienenoordbrug': '19,50 m NAP',
    'calandbrug': '11,70 m NAP',
    'merwedebrug-gorinchem': '11,90 m NAP',
}

for bridge_id, clearance in clearances.items():
    marker = f'    id: "{bridge_id}",\n'
    if marker not in s:
        raise SystemExit(f'Bridge not found: {bridge_id}')
    block_start = s.index(marker)
    block_end = s.index('\n  },', block_start)
    block = s[block_start:block_end]
    if 'clearanceNap:' in block:
        continue
    block = block.replace(marker, marker + f'    clearanceNap: "{clearance}",\n', 1)
    s = s[:block_start] + block + s[block_end:]

old_css = '.badge{border:1px solid #5b4632;background:#30271f;color:var(--orange);border-radius:999px;padding:3px 6px;font-size:7px;font-weight:900;white-space:nowrap;text-transform:uppercase;letter-spacing:.05em}'
new_css = '.top-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}.badge,.clearance-badge{height:30px;display:inline-flex;align-items:center;justify-content:center;border:1px solid #5b4632;background:#30271f;border-radius:999px;padding:4px 10px;font-weight:950;white-space:nowrap;letter-spacing:.04em}.badge{min-width:62px;color:var(--orange);font-size:11px;text-transform:uppercase}.clearance-badge{min-width:112px;color:#fff;font-size:13px}'
if old_css not in s:
    raise SystemExit('Badge CSS marker not found')
s = s.replace(old_css, new_css, 1)

old_top = "'<div class=\"top\"><div><h2>'+escapeHtml(b.name+(b.isOpen?' - GEOPEND':''))+'</h2><div class=\"short\">'+escapeHtml(b.short)+'</div></div><span class=\"badge\">'+escapeHtml(b.liveSource==='PIN'?'PIN':b.liveSource==='BAS'?'BAS':'LIVE')+'</span></div>'+"
new_top = "'<div class=\"top\"><div><h2>'+escapeHtml(b.name+(b.isOpen?' - GEOPEND':''))+'</h2><div class=\"short\">'+escapeHtml(b.short)+'</div></div><div class=\"top-actions\"><span class=\"badge\">'+escapeHtml(b.liveSource==='PIN'?'PIN':b.liveSource==='BAS'?'BAS':'LIVE')+'</span><span class=\"clearance-badge\" title=\"Doorvaarthoogte gesloten/beweegbaar deel bij NAP\">'+escapeHtml(b.clearanceNap||'—')+'</span></div></div>'+"
if old_top not in s:
    raise SystemExit('Top HTML marker not found')
s = s.replace(old_top, new_top, 1)

path.write_text(s, encoding='utf-8')
