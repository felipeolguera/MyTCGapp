# MyTCGapp

A trading card game **deck builder**. Browse a collection of elemental cards and
assemble a 30-card deck with live cost/curve stats.

- **`server/`** — Express + TypeScript REST API (cards + decks, in-memory store).
- **`client/`** — React + Vite + TypeScript single-page deck builder UI.

The project is an npm workspaces monorepo.

## Requirements

- Node.js >= 20 (developed on Node 22)
- npm >= 10

## Getting started

```bash
npm install        # install all workspace dependencies
npm run dev        # start API (:3001) and web client (:5173) together
```

Then open http://localhost:5173. The Vite dev server proxies `/api/*` requests
to the API on port 3001.

## Useful scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run the API and web client together (watch mode). |
| `npm run dev:server` | Run only the API. |
| `npm run dev:client` | Run only the web client. |
| `npm run build` | Type-check and build both workspaces. |
| `npm run typecheck` | Type-check both workspaces. |
| `npm run lint` | Lint both workspaces. |
| `npm test` | Run the API test suite (Vitest + Supertest). |

## API overview

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service health + card count. |
| `GET` | `/api/cards` | List cards (`?element=fire` to filter). |
| `GET` | `/api/cards/:id` | Fetch a single card. |
| `GET` | `/api/decks` | List decks. |
| `GET` | `/api/decks/:id` | Fetch a deck with expanded cards + stats. |
| `POST` | `/api/decks` | Create a deck (`{ "name": "..." }`). |
| `POST` | `/api/decks/:id/cards` | Add one copy of a card (`{ "cardId": "..." }`). |
| `DELETE` | `/api/decks/:id/cards/:cardId` | Remove one copy of a card. |

Deck rules: max 30 cards, max 3 copies of any single card.

## Cloud Agent environment

`.cursor/environment.json` configures the Cursor Cloud Agent environment:
`npm install` on setup, and two terminals (`api`, `web`) that run the dev servers.
