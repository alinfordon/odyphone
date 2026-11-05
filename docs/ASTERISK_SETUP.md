# Asterisk setup

Asterisk belongs on the Ubuntu VPS, separately from this Node app. This repository does not start Asterisk, does not place calls, and does not store the ARI password.

Installation status: Asterisk 22.11.0 is installed, enabled, and running as the `asterisk` user. There was no previous Asterisk install to preserve. Nginx, PM2, and UFW were not changed.

## Current host

| Item | Value |
| --- | --- |
| Ubuntu | 24.04.4 LTS (Noble), kernel 6.8.0-138-generic, x86_64 |
| CPU / RAM / disk | 4 cores, 7.7 GiB RAM, about 61 GiB free on `/` |
| Previous Asterisk | None. This was a new install |
| Firewall | UFW is installed and inactive. No firewall rule was added |
| Installation method | Official `asterisk-22-current.tar.gz`, which unpacked as Asterisk 22.11.0. Ubuntu 24.04 has no `libncurses5-dev` package, so the build used `libncurses-dev` |

## Installed version

`core show version` reports:

```text
Asterisk 22.11.0 built by root @ sgdev on a x86_64 running Linux on 2026-11-03 16:41:55 UTC
```

Built from source with bundled pjproject 2.17 and bundled Jansson 2.15.1:

```bash
./configure --with-jansson-bundled --with-pjproject-bundled
```

`module show` after start, not the build menu, confirmed these are Running:

- SIP: `chan_pjsip`, `res_pjsip`, `res_pjsip_endpoint_identifier_ip`, `res_pjsip_authenticator_digest`
- ARI: `res_http_websocket`, `res_ari`, `res_ari_channels`, `res_ari_bridges`, `res_ari_events`, `res_ari_applications`, `app_stasis`
- Audio: `app_audiosocket`, `chan_audiosocket`, `res_audiosocket`, `format_wav`, `codec_ulaw`, `codec_alaw`, `res_format_attr_opus`

`codec_opus` did not compile. Asterisk 22 ships it only as a Digium binary download, and this tree has no `codec_opus.c`. The live audio path is 8 kHz signed linear over AudioSocket. The future trunk allows `ulaw` and `alaw`.

Sample configs also started IAX2 (UDP 4569), DUNDI (UDP 4520), and UNISTIM (UDP 5000) on `0.0.0.0`. `modules.conf` now contains `noload` for `chan_iax2.so`, `pbx_dundi.so`, and `chan_unistim.so`. After restart those ports are closed. `cdr_custom`, `cdr_sqlite3_custom`, `cel_custom`, and `cel_sqlite3_custom` log "declined to load" because the sample config files do not define them. That does not affect ARI or PJSIP.

## Service

Asterisk runs as the dedicated `asterisk` user and group, not as root. systemd starts it on boot. The unit is `Type=simple` because this build has no libsystemd notify support (`HAVE_SYSTEMD` is unset). `Restart=on-failure` and `RestartSec=5` cover crashes. `systemctl stop` still stops it.

```bash
sudo systemctl status asterisk --no-pager
sudo systemctl start asterisk
sudo systemctl stop asterisk
sudo systemctl restart asterisk
sudo systemctl enable asterisk
sudo asterisk -rx "core show version"
sudo asterisk -rx "core reload"
```

Ownership:

- `/etc/asterisk` is `root:asterisk`, mode 750. Config files are mode 640. Replaced samples were copied to `*.upstream-sample` before the ODY files were written.
- `/var/lib/asterisk`, `/var/log/asterisk`, and `/var/spool/asterisk` are `asterisk:asterisk`. The log directory is mode 750.
- `/var/run/asterisk` is created by `RuntimeDirectory=asterisk` when the service starts.

`/etc/asterisk/asterisk.conf` sets `runuser` and `rungroup` to `asterisk`.

## ARI

`/etc/asterisk/http.conf` binds HTTP to loopback only:

```ini
enabled=yes
bindaddr=127.0.0.1
bindport=8088
```

The ARI user is `odyari` (`type=user`, `read_only=no`) in `/etc/asterisk/ari.conf`. The password is generated on the host. It is not in Git. Sanitized copies live in `infrastructure/asterisk/`.

The API reads these names from `/var/www/odyphone/.env` (gitignored, mode 600). `backend/src/config/env.js` is the only loader.

| Variable | Value on this host |
| --- | --- |
| `ASTERISK_ARI_URL` | `http://127.0.0.1:8088/ari` |
| `ASTERISK_ARI_USERNAME` | `odyari` |
| `ASTERISK_ARI_PASSWORD` | same password as `/etc/asterisk/ari.conf`; never logged or returned by the API |
| `ASTERISK_APP_NAME` | `ody-phone` |
| `ASTERISK_TRUNK_ENDPOINT` | empty. Outbound dial stays disabled |
| `AUDIOSOCKET_HOST` | `127.0.0.1` |
| `AUDIOSOCKET_PORT` | `9019` |

A local check of `/ari/asterisk/info` returned 200 with the credentials and 401 without them. The same URL on the LAN address did not connect. A later process opened `ws://127.0.0.1:8088/ari/events?app=ody-phone`, received the WebSocket open, and closed it. That process was not left running. No call was placed.

Do not publish port 8088. Do not put ARI behind Nginx.

## PJSIP

`/etc/asterisk/pjsip.conf` has a global section and one UDP transport bound to `127.0.0.1:5060`. There is no endpoint, auth, registration, or provider address. SIP is not reachable from the internet.

`infrastructure/asterisk/pjsip.conf.template` is the later trunk skeleton. It still contains `CHANGE_ME` and binds `0.0.0.0`. Do not install that file until a provider and its credentials exist. Do not invent those credentials.

## Dialplan

`/etc/asterisk/extensions.conf` has no demo context and does not answer.

| Context | Role |
| --- | --- |
| `ody-inbound` | Context named by the existing templates, `docs/SIP_TEST.md`, and the future endpoint |
| `ody-incoming` | Same Stasis path, alternate name |

Both run `Stasis(ody-phone)` and then `Hangup()`. There is no `Answer()`. Nothing sends a call into either context until an endpoint sets `context=ody-inbound`.

`ody-phone` is `ASTERISK_APP_NAME`. The API then:

- `reject` and `ignore` hang up without answering.
- `ai_answer` answers and bridges AudioSocket only when the voice path is ready. Otherwise it hangs up without answering.
- `voicemail` hangs up without answering.
- `ring_owner` and `forward_to_number` dial only when `ASTERISK_TRUNK_ENDPOINT` contains `{number}`, for example `PJSIP/{number}@ody-trunk`. That variable is empty.

## Backend and Asterisk

```text
PJSIP (127.0.0.1:5060, no provider yet)
        |
        v
extensions.conf: Stasis(ody-phone) then Hangup()
        |
        v
ARI WebSocket  ws://127.0.0.1:8088/ari/events?app=ody-phone
        |
        v
Node call session (channel id, caller id, Stasis state, AudioSocket state)
        |
        v
Asterisk TCP client --> Node TCP server 127.0.0.1:9019
```

Asterisk is the AudioSocket client. Node is the TCP server. Nothing in this phase answers a channel or originates a call. `ASTERISK_TRUNK_ENDPOINT` is empty, so the existing outbound path cannot build a dial string. The existing AI-answer path still hangs up unanswered until the voice providers are configured and AudioSocket is listening.

| Piece | File |
| --- | --- |
| ARI URL check and credential stripping | `backend/src/telephony/ariSafety.js` |
| WebSocket connect and reconnect | `backend/src/telephony/ariConnection.js` |
| StasisStart, StasisEnd, ChannelDestroyed | `backend/src/telephony/ariEvents.js` |
| In-memory session book | `backend/src/telephony/liveSessions.js` |
| TCP AudioSocket server | `backend/src/audio/audioSocket.js` |
| Health response | `backend/src/app.js` |
| Read-only ARI probe | `backend/src/services/statusService.js` |

## ARI connection

`startAriEvents()` does nothing when `NODE_ENV=test` or when the URL, username, or password is missing. Otherwise it subscribes to `ASTERISK_APP_NAME`.

1. `ariEventsUrl()` accepts only `http:` or `https:` on `127.0.0.1`, `localhost`, or `::1`. Any other host throws `ARI_NOT_LOOPBACK` and no socket is opened, so the password is not sent off the machine.
2. The WebSocket URL drops any username or password that was embedded in the HTTP URL. Authentication is the `Authorization` header only. The logger redacts `authorization` and `password`.
3. `StasisStart` opens one live session for the channel. A repeated start for the same channel is logged and does not reset the start time. An argument list of `dialed` marks the matching inbound session as dialed.
4. `StasisEnd` and `ChannelDestroyed` close that session. Closing twice is safe.
5. The socket reconnects after a close. The delay starts at 1 second and doubles up to 30 seconds. A refused non-loopback URL does not retry. `stop()` cancels the timer before it closes the socket.

The ODY API is still not a PM2 process. Do not leave a second copy running.

## AudioSocket

AudioSocket is TCP, not HTTP or WebSocket. The API listens on `AUDIOSOCKET_HOST:AUDIOSOCKET_PORT` (`backend/src/audio/audioSocket.js`). A public bind is refused and the server does not listen. For a future AI answer, `backend/src/audio/voiceBridge.js` asks ARI for external media with `encapsulation=audiosocket`, `transport=tcp`, and `connection_type=client`. Asterisk then connects to Node. This phase does not create that channel.

The frame layout is the Asterisk 22 `res_audiosocket` layout: one type byte, a 16-bit big-endian length, then that many payload bytes.

| Type | Name | Direction in Asterisk | Handling |
| --- | --- | --- | --- |
| `0x00` | Hangup | Sent by Asterisk | End the session |
| `0x01` | UUID | Received from Asterisk | 16 raw bytes. Must match a session waiting for audio |
| `0x03` | DTMF | Received from Asterisk | One digit. Not treated as audio |
| `0x10` | slin | Both | 8 kHz, 16-bit signed linear PCM |
| `0x11`–`0x18` | slin12 … slin192 | Both | Other sample rates. Logged and not passed to the 8 kHz path |
| `0xff` | Error | Received from Asterisk | End the session |

An unknown UUID, or a UUID that is not 16 bytes, closes that TCP connection. Each TCP connection has its own buffer and session. Socket close and socket error end the session once. Parsing runs on the data chunks already delivered by Node's TCP stream and does not block the process on a read. Port 9019 is not published. A local listener check showed `127.0.0.1:9019` and, after the process stopped, the port was closed. Asterisk's `127.0.0.1:8088` stayed up.

## Network security

Left unchanged on purpose:

- UFW stays disabled. No new allow rules.
- Existing Nginx sites and PM2 processes are not modified.
- MongoDB and the Node listen ports are not changed.

Kept private by bind address, not by a new firewall rule:

- ARI TCP 8088 on `127.0.0.1`
- SIP UDP 5060 on `127.0.0.1`
- AudioSocket TCP 9019 on `127.0.0.1` when the API is running

UDP 5060 from the internet and RTP 10000-20000 stay closed until a provider is selected. After that, allow SIP only from the provider address.

## Health

`GET /api/v1/health` does not require a login and does not return credentials. A local process reported:

```json
{
  "data": {
    "ok": true,
    "service": "ody-phone-ai",
    "api": "up",
    "telephony": "connected",
    "voice": "listening",
    "ari": { "configured": true, "connected": true },
    "audioSocket": { "listening": true, "host": "127.0.0.1", "port": 9019 },
    "asterisk": { "reachable": true, "state": "reachable" },
    "sessions": { "active": 0, "audioSockets": 0 },
    "developmentMode": true
  }
}
```

`telephony` is `connected` only while the event socket is open, `disconnected` when ARI is configured but the socket is down, and `not_connected` when ARI is not configured. `asterisk.reachable` comes from a read-only `GET /ari/asterisk/info` on localhost. `sessions.active` is the in-memory Stasis book, not a database row.

`GET /api/v1/telephony/status` and `GET /api/v1/telephony/sip-test` still require a logged-in user. The status probe uses the same reachability states: `not_configured`, `unreachable`, `rejected`, or `reachable`. The SIP test does not dial. `POST /api/v1/telephony/sessions` stays 501. `POST /api/v1/telephony/simulate` stays development-only and does not open a channel.

## Testing

From `/var/www/odyphone/backend`, after `npm ci`:

```bash
node tests/ariSafety.test.js
node tests/voice.test.js
node tests/asteriskIntegration.test.js
LOG_LEVEL=silent node scripts/localTelephonyCheck.js
```

The first three are automated. They cover a non-loopback ARI URL, reconnect after a refused socket, Stasis classification, duplicate session close, two AudioSocket sessions, an unknown UUID, and the health shape. `scripts/localTelephonyCheck.js` opens the real localhost event socket, listens on `127.0.0.1:9019`, requests `/api/v1/health`, then stops both listeners. It does not originate a call and it does not write a call record. On the last run it exited 0: the event socket opened, AudioSocket was bound to `127.0.0.1:9019`, Asterisk info was reachable, and the health JSON contained no password.

`npm test` runs every `tests/**/*.test.js` file, including the MongoDB-backed suite. That is separate from the local telephony check.

## Troubleshooting

```bash
sudo systemctl status asterisk --no-pager
sudo asterisk -rx "core show version"
sudo asterisk -rx "module show like pjsip"
sudo asterisk -rx "module show like ari"
sudo asterisk -rx "module show like audiosocket"
sudo asterisk -rx "module show like stasis"
sudo asterisk -rx "http show status"
sudo asterisk -rx "ari show users"
sudo asterisk -rx "pjsip show transports"
sudo asterisk -rx "dialplan show ody-inbound"
sudo ss -tulpn | awk 'NR==1 || /:5060|:8088|:9019/'
sudo tail -n 80 /var/log/asterisk/messages.log
```

`http show status` must show `127.0.0.1:8088`. `ari show users` must list `odyari` and must not be reachable from another machine. A transport on `0.0.0.0:5060` means the SIP bind is wrong for this phase.

ARI and AudioSocket:

- Health `asterisk.state` of `rejected` with a loopback URL means the password or username does not match `ari.conf`.
- Health `asterisk.state` of `unreachable` means nothing answered on `127.0.0.1:8088`. Check `systemctl is-active asterisk`.
- A non-loopback `ASTERISK_ARI_URL` is not opened. The event log says `asterisk connection error` and the health detail stays disconnected.
- `audiosocket refused public bind` means `AUDIOSOCKET_HOST` is not `127.0.0.1`, `localhost`, or `::1`.
- `audiosocket listen failed` on port 9019 means another process already has that port. Stop the extra process. Do not publish the port.
- After `localTelephonyCheck.js` exits, `ss` should still show `127.0.0.1:8088` and should not show `:9019`.

## Next steps before a real call

1. Choose a SIP provider and obtain its host, username, password, and DID. Then fill `pjsip.conf.template` on the server, not in Git.
2. Point that endpoint at `context=ody-inbound` and move the UDP transport off loopback only as far as that provider requires.
3. Set `ASTERISK_TRUNK_ENDPOINT=PJSIP/{number}@ody-trunk`.
4. Allow UDP 5060 only from the provider. Open RTP only for the range Asterisk is configured to use.
5. Deploy the ODY API. It already has the ARI URL, username, and password in `.env`. Restart only that API so it opens the ARI event socket and, when the voice path is ready, listens on `127.0.0.1:9019`.
6. Follow `docs/SIP_TEST.md` for the manual call. Do not use the development simulator as evidence that SIP works.

## Personal number

The owner's existing mobile number is a later configuration. A carrier selective-forward or PBX rule can deliver chosen calls into `ody-inbound`. The Android app does not intercept the audio of a normal SIM call.
