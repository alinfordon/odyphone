# SIP test

This repository does not place the test call. `GET /api/v1/telephony/sip-test` reports whether a manual call on the VPS is allowed. `dialed`, `executed`, and `live` stay false.

## Before the first call

On the server, with `NODE_ENV=production`:

- `PHONE_AI_DEVELOPMENT_MODE=false`. Production refuses to start when it is true.
- `TRUST_PROXY=true`, `FRONTEND_URL` is `https://...`, and the two JWT secrets differ and are at least 32 characters.
- `ALLOW_REGISTRATION=false`.
- `AUDIOSOCKET_HOST=127.0.0.1`. Production refuses a public audio bind.
- ARI URL, username, and password are set. Asterisk HTTP listens on `127.0.0.1:8088` (`infrastructure/asterisk/http.conf.template`).
- `ASTERISK_TRUNK_ENDPOINT` contains `{number}`, for example `PJSIP/{number}@ody-trunk`.
- The panel row **SIP** says `gata pentru test manual`.
- Firewall: public 80 and 443 only. UDP 5060 only from the trunk provider. Ports 3000, 4000, 8088, and 9019 stay on loopback.

`GET /api/v1/health` is the process probe. `telephony` is `connected` only while the ARI event socket is up. That probe does not mean a caller was answered.

## The call

1. From a phone you control, call the dedicated DID once.
2. In **Istoric apeluri**, confirm one new row with your caller number. It must not be marked as a simulation.
3. Hang up.
4. Confirm the row has an end time and a duration.

The development simulator is a different path and stays off in production. It must not be used as evidence that SIP works.

## What the API does on that call

The dialplan enters Stasis and does not answer by itself. The API then rejects, ignores, dials the owner or a forward number through the trunk template, or answers for AI when AudioSocket is listening and speech recognition, speech synthesis, and Gemini are configured. A reachable ARI check without that voice path still does not mean the AI picked up.

The owner's existing mobile number is not this test. A later carrier forward would enter the same `ody-inbound` context.
