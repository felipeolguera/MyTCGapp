# Archive Binder (MyTCGapp)

Android-first **Grand Archive TCG** collection scanner.

1. Snap a card (visual art match against the GA catalog) or search by name
2. Confirm the match and enter quantity on a 0–9 pad
3. **Save & Next** adds it to your collection and returns to scan

- **`server/`** — Express + TypeScript API (GATCG search proxy + in-memory collection) for web/dev
- **`client/`** — Mobile-first React + Vite UI, wrapped with Capacitor for Android
- **`client/public/ga-card-index.json`** — perceptual hashes for ~4.5k GA printings (visual scan)
- **`client/android/`** — Native Android project (debug APK)

## Requirements

- Node.js >= 20
- npm >= 10
- For APK builds: JDK 21+, Android SDK (platform 36 / build-tools)

## Getting started (web)

```bash
npm install
npm run dev
```

Open http://localhost:5173 on your phone (same network) or desktop.
The Vite dev server proxies `/api/*` to the API on port 3001.

## Android APK

The APK is a standalone Capacitor app: it calls `api.gatcg.com` directly and stores your collection in on-device storage (no local Express server needed).

### Install a prebuilt debug APK

Download: [`releases/ArchiveBinder-ga-debug.apk`](./releases/ArchiveBinder-ga-debug.apk)

Sideload it (allow installs from unknown sources). Grant **Camera** when prompted.
Scanning compares card art to a built-in GA image index (not OCR). Name search remains as a fallback.

### Build the APK yourself

```bash
# Requires ANDROID_HOME pointing at an Android SDK
npm install
npm run build:apk
```

APK output:

`client/android/app/build/outputs/apk/debug/app-debug.apk`

## Useful scripts

| Command | Description |
| --- | --- |
| `npm run dev` | API + web client together |
| `npm run build` | Type-check and build both workspaces |
| `npm run build:apk` | Standalone web build + Capacitor sync + debug APK |
| `npm run index:cards` | Rebuild the GA visual hash index |
| `npm run typecheck` | Type-check both workspaces |
| `npm run lint` | Lint both workspaces |
| `npm test` | Unit/API tests |

## API overview (web/dev server)

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service health + collection counts |
| `GET` | `/api/ga/search?name=` | Proxy search against Grand Archive |
| `GET` | `/api/collection` | List collection entries |
| `POST` | `/api/collection` | Add quantity (`{ card, quantity }`) |
| `PUT` | `/api/collection/:editionId` | Set absolute quantity (`0` removes) |
| `DELETE` | `/api/collection/:editionId` | Remove an entry |

## Notes

- **Scan** uses perceptual image hashing against every Grand Archive printing (`ga-card-index.json`), not OCR.
- Rebuild the index after big set releases: `npm run index:cards`.
- Web/dev collection storage is in-memory on the API (resets when the API restarts).
- Android APK collection storage is local to the device.
