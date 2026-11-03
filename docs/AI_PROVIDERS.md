# AI providers

The telephone engine is supposed to call providers through interfaces. Replacing Gemini, the speech recognizer, or the speech synthesizer should not require a new rule engine.

## LLM

`GeminiProvider` is the LLM implementation.

- `GEMINI_API_URL` — API base, with no model path and no key in the URL
- `GEMINI_API_KEY`
- `GEMINI_MODEL`

All three must be set before `isConfigured()` is true. `generate()` posts to `{GEMINI_API_URL}/models/{GEMINI_MODEL}:generateContent` and sends the key in `x-goog-api-key`. A live voice session calls it once per caller phrase. The personality page only stores and previews text. The preview sets `modelCalled: false`.

The composed instructions always start with the fixed Romanian policy: ODY is an AI, is not the owner, invents nothing, makes no commitments, and uses only the current contact's notes.

## Speech recognition

`SpeechRecognitionProvider` reads `STT_PROVIDER`, `STT_API_URL`, `STT_API_KEY`, and optional `STT_MODEL`. Language is Romanian.

- `whisper` or `openai` posts a WAV file to `STT_API_URL` with `Authorization: Bearer`. The default model is `whisper-1`.
- Any other provider name receives the WAV body and must return JSON with `text`.

An empty transcript does not call the model. The caller hears a fixed request to repeat.

## Speech synthesis

`TextToSpeechProvider` reads `TTS_PROVIDER`, `TTS_API_URL`, `TTS_API_KEY`, `TTS_VOICE_ID`, and optional `TTS_MODEL`.

- `openai` posts JSON to `TTS_API_URL` and asks for WAV.
- `elevenlabs` posts to the voice URL and asks for `pcm_8000`.
- Any other name posts `{ text, language: "ro", voiceId, format: "wav" }` and must return WAV.

The audio is converted to 8 kHz, 16-bit, mono PCM. MP3 is refused. Nothing is played if synthesis fails.

## On a call

When an `ai_answer` decision is reached, the API answers the channel only if AudioSocket is listening and all three providers are configured. Asterisk is asked for an external media channel with `encapsulation=audiosocket`, aimed at `AUDIOSOCKET_HOST:AUDIOSOCKET_PORT`. The caller and that channel are bridged. The greeting is synthesized before the bridge. If that step fails, the caller is not answered.

## What is stored

`AIProviderConfig` can store a provider name, model name, and voice id. It has no API key field. Keys stay in the environment.

## Summaries

Call summaries in this version are built locally from stored caller lines. They quote the caller and classify urgent, callback, and direct-contact wording. They do not promise that the owner will call.
