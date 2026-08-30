import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
const patched = source.replace('--warm:#342619;', '--warm:#2b2d2f;');

if (patched === source) {
  console.warn('Kleurcode #342619 niet gevonden; server start ongewijzigd.');
}

writeFileSync(new URL('./server.render.mjs', import.meta.url), patched, 'utf8');
await import('./server.render.mjs');
