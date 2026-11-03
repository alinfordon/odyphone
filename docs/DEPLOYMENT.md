# Deployment

Production target: Ubuntu VPS, Nginx, PM2, MongoDB, and Asterisk installed separately. HTTPS terminates at Nginx. Templates live in `infrastructure/`. This repository does not install those services and does not place a SIP call.

## API host

1. Install Node.js 22 and MongoDB.
2. Copy the repository and run `npm run install:all`.
3. Copy `.env.example` to `.env` on the server. Set `JWT_SECRET` and `JWT_REFRESH_SECRET` to different random values of at least 32 characters.
4. Set `NODE_ENV=production`, `TRUST_PROXY=true`, `FRONTEND_URL=https://phone.example.com`, `PHONE_AI_DEVELOPMENT_MODE=false`, `ALLOW_REGISTRATION=false`, and `AUDIOSOCKET_HOST=127.0.0.1`.
5. Keep `PHONE_AI_ENABLED=false` until the manual SIP test in `docs/SIP_TEST.md` is planned.
6. Run `npm test`, `npm run lint`, and `npm run build`.
7. Start both processes with PM2 from the repository root:

```bash
pm2 start infrastructure/pm2/ecosystem.config.cjs
pm2 save
```

The API process stays at one instance because ARI and AudioSocket live in it. PM2 sets `NODE_ENV=production`. The API reads the rest from `.env` through dotenv. Put that file on the server only.

If production configuration is open, the API logs `Refuz pornirea în producție.` and exits. The log lists blocker codes only: `DEVELOPMENT_MODE`, `JWT_SECRET_SHORT`, `JWT_REFRESH_SHORT`, `JWT_SECRETS_MATCH`, `FRONTEND_NOT_HTTPS`, `TRUST_PROXY_OFF`, `REGISTRATION_OPEN`, `AUDIOSOCKET_NOT_LOOPBACK`.

## Firewall

Allow public TCP 80 and 443. Allow SSH from your own address. Allow UDP 5060 only from the SIP provider address. Do not publish 3000, 4000, 8088, or 9019.

## Nginx

Use `infrastructure/nginx/ody-phone.conf`. Point `/api/` and `/ws` at `127.0.0.1:4000`, and the rest at `127.0.0.1:3000`. Certificates come from the host, not from this repository. The request body limit is 1 MB, matching the API.

The production browser uses same-origin `/api`. `frontend/.env.development` is only for local `next dev`.

## Asterisk

Follow `docs/ASTERISK_SETUP.md` and `docs/SIP_TEST.md` after the panel and API are up. Copy `infrastructure/asterisk/http.conf.template` so ARI binds to `127.0.0.1:8088`. A reachable ARI health check is not permission to send live traffic. `GET /api/v1/telephony/sip-test` says when a manual test is allowed and does not dial.

## Privacy before production use

Do not put real callers on this system until the legal basis is written down for your jurisdiction. The product behavior that supports that review:

- The assistant must identify itself as an AI. The fixed policy and the default Romanian greeting do this.
- Recording is off by default. Turning the setting on does not start a recorder, because no recorder is connected. When one exists, recording stays opt-in.
- Transcripts and call records have retention periods in Settings. "Apply retention now" deletes older rows and clears older transcripts. There is no recording file store yet.
- The owner can delete one call record from Call History.
- Transcripts and recordings, once they exist, are loaded only for the owning account.
- Caller ID is not treated as strong identity. Transfer uses an allowlist.
- Audit logs record sensitive changes without storing passwords, tokens, or API keys.

Write the lawful basis, the caller disclosure you will use at the start of an AI call, and the retention decision before the first production DID is connected. This document does not replace that review.

## Monitoring

`GET /api/v1/health` is outside the API rate limit so a local probe can poll it. `ok: true` means the process is up. `telephony` is `connected`, `disconnected`, or `not_connected` from the ARI event socket. `voice` is `listening` or `down`. Neither field means a call was answered.

Once a minute the API logs one line with `monitor: "ody-phone"`, the same telephony state, whether AudioSocket is listening, and the SIP readiness state. It does not log secrets or request bodies. PM2 and Nginx access logs remain the host monitors. An ARI drop still creates one internal notification until the socket connects again.
