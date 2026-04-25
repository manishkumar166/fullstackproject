# Dynamic Language Translator (Regional Idioms)

A full-stack demo website that translates **text** (and supports **speech-to-text** in the browser) while applying **regional phrase/idiom overrides** and optional **tag filters**.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the backend (serves the frontend too):

```bash
npm start
```

3. Open:

- `http://localhost:3000`

## Using VS Code Live Server (important)

This project needs a backend. VS Code **Live Server serves only static files**, so `/api/*` won’t work unless the Node server is also running.

- Start the backend with `npm start`
- Then either:
  - Open `http://localhost:3000` (recommended), or
  - Use Live Server for the frontend; it will automatically call the API at `http://localhost:3000`.

## Project structure

- `public/`: HTML/CSS/JS frontend (single-page UI)
- `server/index.js`: Express server + API endpoints
- `server/lib/translator.js`: Offline translation + idiom replacement logic
- `server/data/idioms.json`: Regional idioms/phrases + supported regions/language pairs

## API

- `GET /api/config`: regions, language pairs, tag suggestions
- `POST /api/translate`

Example body:

```json
{
  "text": "break a leg",
  "from": "en",
  "to": "es",
  "region": "mx",
  "tags": ["idiom"]
}
```

