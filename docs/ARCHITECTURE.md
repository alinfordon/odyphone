# Architecture

ODY Phone AI is split into a Next.js panel and an Express API. Telephony and model providers sit behind interfaces so the rule engine does not depend on Asterisk.

```text
Browser  ->  Next.js :3000  ->  /api proxy  ->  Express :4000  ->  MongoDB
                                                      |
                                                      +-> rule engine (pure)
                                                      +-> AsteriskProvider (events, reject, dial)
                                                      +-> Gemini / STT / TTS on an AudioSocket call when configured
```

## Ownership

Every contact, rule, call, setting, notification, and audit row belongs to one owner. Routes load that row with both the id and `userId`. Another owner receives 404.

## Call decision

`evaluateCall` is a pure function. It looks at the normalized number, the enabled contact, enabled rules, and settings.

1. Higher priority wins. Equal priority uses the older rule.
2. A rule outside its schedule is skipped.
3. Exact number, contact group, unknown, or any caller can match.
4. A general reject or ignore does not apply to a contact at or above the priority threshold. An exact-number rule still can.
5. AI answering requires the global switch, an enabled contact with AI allowed, or the explicit unknown-caller policy.
6. The result always has `liveCall: false` and `telephonyExecuted: false`.

The test screen calls `POST /api/v1/rules/test` and writes nothing.

## Telephony boundary

`TelephonyProvider` defines health, answer, reject, hangup, and transfer. `AsteriskProvider` probes ARI health. The event listener may reject, ignore, or release a real channel, and may bridge the caller to the owner when a trunk template is configured. It answers a channel for AI only when AudioSocket is listening and Gemini, speech recognition, and speech synthesis are configured. Otherwise an `ai_answer` decision hangs up without answering. `POST /api/v1/telephony/sessions` returns 501. Development mode can store a simulated lifecycle with `simulated: true` and `liveCall: false`. `GET /api/v1/telephony/sip-test` reports whether a manual SIP test is allowed and keeps `dialed` false. In production the process exits when development mode, an HTTP panel origin, matching or short JWT secrets, open registration, a public AudioSocket bind, or a missing trusted proxy is set.

## Voice path

Caller audio arrives as 8 kHz signed linear frames over AudioSocket. Silence ends a phrase. That phrase is sent to speech recognition. Gemini replies from the call history and the contact's authorized instructions. Speech synthesis is converted to 8 kHz PCM and played back. A loud caller during playback interrupts the current reply. The call ends on goodbye, repeated silence, provider failures, or the configured maximum duration. Audio is not stored. `liveCall` is true only while that session is open.

## Two telephone setups

The dedicated DID is the first live path: carrier SIP trunk, Asterisk inbound context, Stasis app `ody-phone`. The owner's existing mobile number is a later route. A carrier forward or PBX rule would send selected calls into the same Asterisk context. The Android app does not replace the audio of an ordinary SIM call. It is a control panel and notification client.

## Security

Passwords are hashed with bcrypt. Access tokens last 15 minutes. Refresh tokens are JWTs stored only as SHA-256 hashes and rotated on use. Browser cookies are HTTP-only. Production cookies are `Secure`. Helmet sets the usual headers. Auth routes are rate limited. Audit rows store the action and target id, and drop password, token, and key fields.

Caller ID is an untrusted label. Sensitive actions such as transfer use the owner's allowlist, not the displayed name.
