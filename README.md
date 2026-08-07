# Brugwachter Live Dashboard

Een responsive website met negen overzichtskaarten voor:

- Botlekbrug
- Spijkenisserbrug
- Alblasserdamsebrug / Brug over de Noord
- Papendrechtsebrug / Merwedebrug Papendrecht
- Hartelbrug
- Wantijbrug
- Van Brienenoordbrug
- Calandbrug
- Merwedebrug Gorinchem

Per brug toont de site uitsluitend live geverifieerde officiële gegevens over:

- eerstvolgende toegestane bediening/openingsmogelijkheid;
- actuele status, stremming of beperkte bediening;
- alle actieve en komende BAS/scheepvaartberichten die op Vaarweginformatie aan de brug zijn gekoppeld;
- officiële waterstandsverwachting voor het openingstijdstip, of duidelijk gelabeld de laatste meting;
- officiële KNMI-windverwachting voor het openingstijdstip, of duidelijk gelabeld een actuele meting;
- actuele RWS-stroomsnelheid en stromingsrichting van het dichtstbijzijnde officiële meetpunt, inclusief afstand en meettijd;
- bron-URL en informatietijd.

## Installatie

1. Installeer Node.js 20 of nieuwer.
2. Kopieer `.env.example` naar `.env`.
3. Vul uw OpenAI API-sleutel in:

```env
OPENAI_API_KEY=sk-...
```

4. Start de website:

```bash
npm start
```

5. Open `http://localhost:3000`.

Er zijn geen npm-pakketten nodig; de site gebruikt alleen ingebouwde Node.js-functies.

## Live werking

- Bij laden en vervolgens elke vijf minuten roept de browser `/api/dashboard` aan.
- De server controleert per brug de officiële Vaarweginformatie/BAS-datastroom, de NDW-planningsfeed en RWS Waterinfo.
- De browser en server verversen de meetgegevens iedere vijf minuten. Ontbreekt binnen 25 km een officieel stroommeetpunt, dan verschijnt geen schatting maar “Geen actuele stroommeting beschikbaar”.
- Een actieve BAS-stremming of bedieningsbeperking krijgt voorrang op een gewone NDW-openingsmelding. De eindtijd wordt als “tot …” getoond.
- Als één BAS-controle mislukt, blijft dat zichtbaar als bronfout en worden voor die brug geen BAS-conclusies verzonnen.

## Belangrijke betekenis van de gegevens

“Volgende opening” is de eerstvolgende officieel toegestane bediening of openingsmogelijkheid, niet de garantie dat de brug op dat moment daadwerkelijk beweegt. Openingen kunnen afhankelijk zijn van aanvraag, scheepvaartaanbod, verkeerssituatie, wind, storing of aanwijzingen van de beheerder.

Een waterstand of windmeting wordt niet automatisch als waarde voor het toekomstige openingstijdstip gebruikt. Is er geen officiële prognose, dan meldt de kaart dat direct.

## Hosting

Gebruik Node.js-hosting zoals Render, Railway, Fly.io, Azure App Service of een VPS. Stel `OPENAI_API_KEY` in als geheime omgevingsvariabele en publiceer poort 3000 of de poort die uw host via `PORT` aanlevert.
