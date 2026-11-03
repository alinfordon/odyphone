# ODY Phone AI

ODY Phone AI is the telephone assistant for the ODY ecosystem. It is a separate project from the local ODY voice assistant. This repository stores the owner account, authorized contacts, call rules, settings, and call records in MongoDB.

A live channel is answered for AI only when AudioSocket is listening and speech recognition, speech synthesis, and Gemini are configured. Development mode can store a simulated call and never reports that call as a live answer. Production refuses to start while that mode is on.

## Requirements

- Node.js 22 or newer
- MongoDB 7 or 8, reachable through `MONGODB_URI`
- npm

Docker is optional and only provides a local MongoDB. Asterisk is installed on its own host when you are ready for a SIP test.

## Setup

From `C:\Robotica\odyphone` in PowerShell:

```powershell
npm run install:all
Copy-Item .env.example .env
```

Edit `.env` and set at least:

- `MONGODB_URI`
- `JWT_SECRET` (16 characters or more)
- `JWT_REFRESH_SECRET` (a different value, 16 characters or more)

Leave provider keys empty until you have them. `PHONE_AI_ENABLED` stays `false`.

## Commands

```powershell
npm test
npm run lint
npm run build
npm run dev
```

- `npm test` runs the backend tests. They download a temporary MongoDB binary on first run and do not need your `.env` database.
- `npm run lint` checks the backend and the frontend.
- `npm run build` creates the Next.js production build.
- `npm run dev` starts the API on http://localhost:4000 and the panel on http://localhost:3000.

The API refuses to start when MongoDB is down. For a local trial with no installed database:

```powershell
npm run dev:ephemeral
```

Run the frontend in a second terminal with `npm run dev --prefix frontend`. The ephemeral database disappears when that API process stops, and the console says so. It is still MongoDB, not a fake data store.

Open http://localhost:3000. The first visit creates the owner account. Registration then closes unless `ALLOW_REGISTRATION=true`.

## Environment

Secrets belong in `.env`, which is not committed. `.env.example` lists every variable with empty secrets. Provider URLs are also environment variables: `GEMINI_API_URL`, `STT_API_URL`, and `TTS_API_URL`. The frontend reads `BACKEND_URL` from `frontend/.env.development` during `next dev` and proxies `/api` to the API.

| Variable | Role |
| --- | --- |
| `MONGODB_URI` | Database for this owner |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Access and refresh tokens |
| `FRONTEND_URL` | Allowed browser origin |
| `ASTERISK_ARI_URL`, `ASTERISK_ARI_USERNAME`, `ASTERISK_ARI_PASSWORD` | ARI health check and inbound events when set |
| `ASTERISK_TRUNK_ENDPOINT` | Optional dial template containing `{number}` |
| `GEMINI_API_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini, unused until the voice engine calls it |
| `STT_PROVIDER`, `STT_API_URL`, `STT_API_KEY` | Romanian speech recognition. `whisper` or `openai` uses a Whisper-compatible upload |
| `TTS_PROVIDER`, `TTS_API_URL`, `TTS_API_KEY`, `TTS_VOICE_ID` | Speech synthesis. `openai` and `elevenlabs` have dedicated requests |
| `AUDIOSOCKET_HOST`, `AUDIOSOCKET_PORT` | AudioSocket listen address. Default `127.0.0.1:9019`. Applies after an API restart |
| `FCM_*` | Firebase HTTP v1. Push is sent only when a device token is registered |
| `PHONE_AI_ENABLED` | Default for a new owner's answering switch |
| `PHONE_AI_DEVELOPMENT_MODE` | Shows the development badge and enables the call-lifecycle simulator. The simulator never contacts the telephone network |

## Completed in this version

- Owner registration, login, refresh rotation, logout, and password change
- HTTP-only cookies for the browser and bearer tokens for Android
- MongoDB models for users, contacts, rules, calls, settings, notifications, provider preferences, call sessions, and audit logs
- Contact CRUD with E.164 normalization
- Rule engine with priority, schedules, unknown callers, the AI switch, and priority-contact protection
- Dry-run rule test that does not create a call
- Development-mode call simulator that stores a simulated record and does not contact Asterisk
- ARI event listener: reject, ignore, and close a real channel without answering it when the voice path is not ready
- Owner or forward dialing only when `ASTERISK_TRUNK_ENDPOINT` contains `{number}`
- Romanian call audio through AudioSocket when speech recognition, speech synthesis, Gemini, and the socket are all ready
- Dashboard, history, analytics, notifications, personality, voice limits, and settings
- Dark and light themes
- Internal notifications, plus Firebase push when the project, client email, private key, and a device token are all present
- Mobile API for overview, calls, notifications, the AI switch, transfer authorization, and mark-read
- Call history with search, follow-up filter, transcript, quoted summary, and export
- Callback, urgent, and direct-contact flags raise an internal notification and a push when a device is registered
- One notice when the Asterisk event stream drops, until it connects again
- Retention purge and call deletion
- Production start refuses development mode, short or identical JWT secrets, an HTTP panel URL, a public AudioSocket bind, open registration, and a missing trusted proxy
- SIP readiness check that reports whether a manual VPS test is allowed and does not dial
- One-minute monitor log for ARI, AudioSocket, and SIP readiness
- Tests for normalization, rules, authentication, ownership, transfer authorization, summaries, notifications, rate limiting, and production readiness

## Not connected yet

- This repository does not install Asterisk, Nginx, PM2, or a SIP trunk, and it does not place the SIP test call
- No RTP stack in this process. Audio uses Asterisk external media with AudioSocket
- The AI does not answer a live channel unless AudioSocket is listening and Gemini, speech recognition, and speech synthesis are configured
- The dashboard does not call Gemini. A voice session does, when Gemini is configured
- No call recording files are stored

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Asterisk setup](docs/ASTERISK_SETUP.md)
- [AI providers](docs/AI_PROVIDERS.md)
- [Android integration](docs/ANDROID_INTEGRATION.md)
- [Deployment](docs/DEPLOYMENT.md)
- [SIP test](docs/SIP_TEST.md)
