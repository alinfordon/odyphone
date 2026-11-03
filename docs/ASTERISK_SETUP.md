# Asterisk setup

Asterisk is not installed or started by this repository. The templates in `infrastructure/asterisk/` are starting points for a later dedicated DID. Replace every `CHANGE_ME` on the Asterisk host. Do not commit the filled-in files.

## Intended first path

1. Install Asterisk on the Ubuntu VPS, independently of this Node app.
2. Create a SIP trunk for the dedicated DID.
3. Send inbound calls to the context in `extensions.conf.template`.
4. That context enters Stasis application `ody-phone`, matching `ASTERISK_APP_NAME`.
5. Set `ASTERISK_ARI_URL`, `ASTERISK_ARI_USERNAME`, and `ASTERISK_ARI_PASSWORD` in the API `.env`.
6. Open ARI on the loopback interface. Copy `infrastructure/asterisk/http.conf.template` so HTTP binds to `127.0.0.1:8088`. A typical base URL is `http://127.0.0.1:8088/ari`. Put that URL in the environment. The application does not bake it in.

The API subscribes to ARI events for the Stasis application named in `ASTERISK_APP_NAME` when the ARI URL and credentials are set. A real incoming channel is identified, passed through the rule engine, and then:

- `reject` and `ignore` hang up the channel without answering it.
- `ai_answer` answers and bridges an AudioSocket channel only when the voice path is ready. Otherwise it hangs up without answering. Nothing is recorded.
- `voicemail` hangs up without answering. No recording is stored.
- `ring_owner` and `forward_to_number` dial out only when `ASTERISK_TRUNK_ENDPOINT` contains `{number}`, for example `PJSIP/{number}@ody-trunk`. The caller is bridged after the destination enters Stasis. The caller is not answered by the AI.

`POST /api/v1/telephony/sessions` stays 501. In development mode, `POST /api/v1/telephony/simulate` writes a simulated call lifecycle and does not open a channel.

## Personal number

The owner's existing mobile number is the second configuration. It is not implemented. A later carrier selective-forward or PBX rule can deliver chosen calls into the same `ody-inbound` context. The Android app cannot intercept the audio of a normal SIM call, so it is not the audio path.

## RTP and streaming

The later audio path is an ARI external-media channel with AudioSocket encapsulation. This API listens on `AUDIOSOCKET_HOST:AUDIOSOCKET_PORT` (default `127.0.0.1:9019`). Asterisk connects to that address, so the host must be reachable from Asterisk. The API answers the caller only after the greeting has been synthesized and the external media channel exists. Speech recognition, speech synthesis, and Gemini must all be configured. Otherwise the AI decision still hangs up without answering.

The development simulator stores a marked record and does not pretend that a real channel was answered.

## Check

`GET /api/v1/telephony/status` reports `not_configured`, `unreachable`, `rejected`, or `reachable`. `reachable` means the health check succeeded. A call is answered for AI only when the voice pipeline reports connected. `GET /api/v1/telephony/sip-test` reports `not_configured`, `blocked`, or `ready`. `ready` allows a manual call on the VPS, described in `docs/SIP_TEST.md`. The endpoint does not dial.
