# Android integration

The ODY Android app is a control panel and a notification client. It is not part of this repository. It cannot replace the audio of an ordinary SIM call. Live audio belongs to the dedicated SIP number through Asterisk.

## Authentication

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "owner@example.com",
  "password": "…",
  "client": "mobile"
}
```

The response contains `accessToken`, `refreshToken`, and `expiresInSeconds`. Send the access token as `Authorization: Bearer …`.

Refresh:

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{ "refreshToken": "…", "client": "mobile" }
```

The previous refresh token stops working. Store tokens in the platform keystore, not in logs.

## Control routes

All of these require the bearer token.

- `GET /api/mobile/overview` — AI switch, telephony state, today's counts, unread notifications
- `GET /api/mobile/calls`
- `GET /api/mobile/calls/:id`
- `GET /api/mobile/notifications`
- `PATCH /api/mobile/settings/ai-enabled` with `{ "aiAnsweringEnabled": true }`
- `POST /api/mobile/calls/:id/transfer` with `{ "targetNumber": "+40…" }`
- `POST /api/mobile/calls/:id/mark-read`
- `POST /api/mobile/devices` with `{ "token": "<fcm device token>" }`
- `DELETE /api/mobile/devices` with the same body

Today's counts are real database counts. An empty database returns zeros, not sample traffic. `voicePipelineConnected` follows the live voice path.

`GET /api/mobile/calls?actionRequired=true` returns calls that still need follow-up, including callback requests. Resolved items are left out. `status` and `aiHandled=true|false` are also accepted.

## Transfer

Transfer succeeds as an authorization check only. If the number is on the owner's allowlist and a provider is not connected, the status is 503, `authorized` is true, and `executed` is false. Do not show that call as transferred. A number outside the allowlist is 403.

## Push

Register the device token with `POST /api/mobile/devices`. The server key stays in `FCM_PRIVATE_KEY` on the API host and is never returned. When the three Firebase values are set and at least one device token is stored, a new notification is also sent through the Firebase HTTP v1 API. `delivery.fcm` is `not_configured`, `no_device`, `sent`, or `failed`. The internal notification remains either way. A status check does not itself send a push, so `fcm.delivered` stays false.
