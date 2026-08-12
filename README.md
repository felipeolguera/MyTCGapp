# Archive Binder (MyTCGapp)

Android-first **Grand Archive TCG** collection scanner.

1. Snap a card (or search by name)
2. Match it against the [Grand Archive API](https://api.gatcg.com)
3. Enter quantity on a 0–9 pad
4. **Save & Next** adds it to your collection and returns to scan

- **`server/`** — Express + TypeScript API (GATCG search proxy + in-memory collection)
- **`client/`** — Mobile-first React + Vite UI (camera + OCR + collection)

## Requirements

- Node.js >= 20
- npm >= 10
- Camera access in the browser (HTTPS or localhost) for scanning

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173 on your phone (same network) or desktop.
The Vite dev server proxies `/api/*` to the API on port 3001.

## Useful scripts

| Command | Description |
| --- | --- |
| `npm run dev` | API + web client together |
| `npm run build` | Type-check and build both workspaces |
| `npm run typecheck` | Type-check both workspaces |
| `npm run lint` | Lint both workspaces |
| `npm test` | API tests (Vitest + Supertest) |

## API overview

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service health + collection counts |
| `GET` | `/api/ga/search?name=` | Proxy search against Grand Archive |
| `GET` | `/api/collection` | List collection entries |
| `POST` | `/api/collection` | Add quantity (`{ card, quantity }`) |
| `PUT` | `/api/collection/:editionId` | Set absolute quantity (`0` removes) |
| `DELETE` | `/api/collection/:editionId` | Remove an entry |

## Notes

- Card recognition uses on-device OCR (Tesseract) of the photo, then name search on GATCG. Manual search is always available as a fallback.
- Collection storage is in-memory for now (resets when the API restarts).
- Native Android (Kotlin / Expo) can replace the web client later while keeping this API.
