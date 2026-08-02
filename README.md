# Brugwachter Live Dashboard

Een responsive website met zes overzichtskaarten voor:

- Botlekbrug
- Spijkenisserbrug
- Alblasserdamsebrug / Brug over de Noord
- Papendrechtsebrug / Merwedebrug Papendrecht
- Hartelbrug
- Wantijbrug

Per brug toont de site uitsluitend live geverifieerde officiële gegevens over:

- eerstvolgende toegestane bediening/openingsmogelijkheid;
- actuele status, stremming of beperkte bediening;
- officiële waterstandsverwachting voor het openingstijdstip, of duidelijk gelabeld de laatste meting;
- officiële KNMI-windverwachting voor het openingstijdstip, of duidelijk gelabeld een actuele meting;
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
- De server start per controle een nieuwe webzoekopdracht.
- Webresultaten worden beperkt tot officiële domeinen zoals Rijkswaterstaat, Vaarweginformatie, Waterinfo, KNMI, Havenbedrijf Rotterdam en relevante overheden.
- Een bron-URL wordt server-side gecontroleerd. Kaartgegevens zonder officiële bron worden vervangen door “Geen officiële live data”.
- De geheime API-sleutel blijft op de server en wordt nooit naar de browser gestuurd.

## Belangrijke betekenis van de gegevens

“Volgende opening” is de eerstvolgende officieel toegestane bediening of openingsmogelijkheid, niet de garantie dat de brug op dat moment daadwerkelijk beweegt. Openingen kunnen afhankelijk zijn van aanvraag, scheepvaartaanbod, verkeerssituatie, wind, storing of aanwijzingen van de beheerder.

Een waterstand of windmeting wordt niet automatisch als waarde voor het toekomstige openingstijdstip gebruikt. Is er geen officiële prognose, dan meldt de kaart dat direct.

## Hosting

Gebruik Node.js-hosting zoals Render, Railway, Fly.io, Azure App Service of een VPS. Stel `OPENAI_API_KEY` in als geheime omgevingsvariabele en publiceer poort 3000 of de poort die uw host via `PORT` aanlevert.
