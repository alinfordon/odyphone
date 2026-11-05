# Voice Lab

Voice Lab compares three voice engines from the browser. It does not answer or place telephone calls, and it does not use the Asterisk channel path.

## Engines

| Engine | Behavior |
| --- | --- |
| Gemini Live | Official `@google/genai` Live session. Browser PCM goes to the model and 24 kHz PCM comes back. Romanian is requested in the system instruction. The current Live models choose the spoken language themselves and do not accept a language code. |
| Modular Voice | Microphone audio is cut on silence, then STT, then Gemini or Ollama, then TTS. |
| Hybrid Voice | Gemini Live is primary. If it fails and fallback is enabled, the same session switches once to Modular Voice and keeps the transcript. |

Ollama is reached only by the API, at `OLLAMA_BASE_URL`. The browser receives model names, split into local and cloud. A cloud model is one with `remote_host`, `remote_model`, or a `:cloud` / `-cloud` name. Cloud models are not described as running on the PC.

Local STT and TTS are optional HTTP endpoints (`LOCAL_STT_URL`, `LOCAL_TTS_URL`). faster-whisper is not installed on this host.

## Environment

```text
GEMINI_API_URL
GEMINI_API_KEY
GEMINI_MODEL
GEMINI_LIVE_MODEL
OLLAMA_BASE_URL
OLLAMA_MODEL
OLLAMA_TIMEOUT_MS
LOCAL_STT_URL
LOCAL_STT_API_KEY
LOCAL_TTS_URL
LOCAL_TTS_API_KEY
LOCAL_TTS_VOICE
```

No key or Ollama address is returned to the browser.

## API

Authenticated routes under `/api/v1/voice-lab`:

- `GET /status`
- `GET /ollama/models`
- `POST /text`
- `POST /sessions`
- `GET /sessions`
- `DELETE /sessions/:id`

Audio uses `/ws/voice-lab` with the same short-lived ticket as `/api/v1/auth/ws-ticket`. Benchmarks stay in memory for the current API process. Audio is not stored.

## Tests

```bash
cd /var/www/odyphone/backend
node tests/voiceLab.test.js
```

The automated tests mock Gemini and Ollama. A passing test file does not mean a live Gemini session or a local microphone round trip succeeded.
