# API

Base path: `/api/v1`

Authenticated routes accept an HTTP-only cookie from the browser or `Authorization: Bearer <accessToken>` from the Android client. Login and register with `"client": "mobile"` return `accessToken` and `refreshToken` in the JSON body. `"client": "web"` sets cookies and omits the tokens from JSON.

Errors:

```json
{ "error": { "message": "…", "code": "VALIDATION_ERROR", "details": [] } }
```

Success:

```json
{ "data": {}, "meta": {} }
```

## Auth

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/auth/registration` | No | Whether the first account can be created |
| POST | `/auth/register` | No | Create the owner |
| POST | `/auth/login` | No | Sign in |
| POST | `/auth/refresh` | Refresh token | Rotate tokens |
| POST | `/auth/logout` | Yes | Revoke the current refresh token |
| GET | `/auth/me` | Yes | Current owner |
| POST | `/auth/password` | Yes | Change password and revoke sessions |
| POST | `/auth/ws-ticket` | Yes | 30-second single-use WebSocket ticket |

## Resources

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/contacts` | List and create contacts |
| GET, PATCH, DELETE | `/contacts/:id` | One contact |
| GET, POST | `/rules` | List and create rules |
| POST | `/rules/test` | Dry-run a number. No call is stored |
| GET, PATCH, DELETE | `/rules/:id` | One rule |
| GET | `/calls` | Paginated history. `actionRequired=true` lists open follow-ups. Simulated rows stay hidden unless `includeSimulated=true` |
| GET | `/calls/export?format=csv` | CSV or JSON. Includes the spoken transcript, not a recording |
| GET, PATCH, DELETE | `/calls/:id` | Detail, read/resolved flags, deletion |
| POST | `/calls/:id/summary` | Local summary from a stored transcript |
| POST | `/calls/:id/transfer` | Authorize a transfer. Returns 503 when no provider can send it |
| GET, PATCH | `/settings` | Policy, transfer numbers, retention |
| PATCH | `/settings/ai-enabled` | Global AI switch |
| POST | `/settings/privacy/purge` | Apply retention now |
| GET, PATCH | `/assistant` | Greeting and extra instructions |
| POST | `/assistant/preview` | Composed prompt. `modelCalled` is false |
| GET, PATCH | `/voice` | Time limits and provider readiness |
| GET | `/notifications` | Internal center and Firebase readiness |
| POST | `/notifications/read-all` | Mark every notification read |
| PATCH | `/notifications/:id/read` | Mark one read |
| GET | `/telephony/status` | ARI, SIP, and voice readiness |
| GET | `/telephony/sip-test` | Whether a manual SIP test is allowed. `dialed` stays false |
| POST | `/telephony/simulate` | Development mode only. Stores a simulated lifecycle and places no call |
| POST | `/telephony/sessions` | 501. This endpoint does not open a voice session |
| GET | `/analytics` | Charts for stored calls |
| GET | `/analytics/overview` | Dashboard counts |
| GET | `/status` | Same readiness payload for the top bar |
| GET | `/meta` | Categories, actions, and match types |
| GET | `/health` | Process up. `telephony` is `connected`, `disconnected`, or `not_connected`. `voice` is `listening` or `down`. No call is placed |

List calls with `page`, `limit`, `q`, `status`, `sort` (`startedAt`, `duration`, `status`), `aiHandled`, and `actionRequired`.

## Mobile

These routes use the same bearer token. They are mounted at `/api/mobile`.

| Method | Path |
| --- | --- |
| GET | `/overview` |
| GET | `/calls` |
| GET | `/calls/:id` |
| GET | `/notifications` |
| PATCH | `/settings/ai-enabled` |
| POST | `/calls/:id/transfer` |
| POST | `/calls/:id/mark-read` |
| POST | `/devices` |
| DELETE | `/devices` |

`GET /calls` accepts `actionRequired=true` for open follow-ups, plus `status`, `aiHandled`, and `q`. `/devices` stores an FCM device token. A notification is also sent through Firebase HTTP v1 when the server credentials and this token are both present. The token is not a server credential.

## WebSocket

Connect to `/ws`. The first message is `{ "type": "auth", "ticket": "…" }`. A later `{ "type": "status" }` returns the same status object as `GET /status`. The panel itself polls HTTP.

## Transfer response

An allowed destination while telephony is disconnected:

```json
{
  "error": { "message": "Transfer was authorized and was not sent. No telephony provider is connected.", "code": "TELEPHONY_NOT_CONNECTED" },
  "data": { "authorized": true, "executed": false, "liveCall": false }
}
```

The HTTP status is 503. A destination outside the allowlist is 403 and is audited. Another owner's call id is 404.
