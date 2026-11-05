import assert from "node:assert/strict";
import test from "node:test";
import { GeminiLiveProvider, liveSystemText } from "../src/voiceLab/geminiLiveProvider.js";
import { HybridVoiceProvider } from "../src/voiceLab/hybridVoiceProvider.js";
import { ModularVoiceProvider } from "../src/voiceLab/modularVoiceProvider.js";
import { odyCoreIdentitySchema, odyCoreProfileSchema } from "../src/api/schemas.js";
import {
  ODY_HELP,
  ODY_INTRODUCTION,
  ODY_PROFILE,
  ODY_SECRET_REFUSAL,
  ODY_UNKNOWN,
  answerWithOdyIdentity,
  buildOdyContext,
} from "../src/odyCore/index.js";
import { assertNoSecret } from "../src/odyCore/profile.js";

const secret = "AIzaSySECRETSECRET";

test("ODY introduces itself once, from the shared identity", () => {
  assert.equal(
    answerWithOdyIdentity("Salut, sunt Alin. Tu cine ești?"),
    ODY_INTRODUCTION,
  );
  const live = liveSystemText("ro", [], null);
  const modular = buildOdyContext({ channel: "voice", includeHistory: false }).text;
  assert.equal(live.includes(ODY_INTRODUCTION), true);
  assert.equal(modular.includes(ODY_INTRODUCTION), true);
  assert.equal(live.includes("WEBNODE CONSULTING SRL"), true);
  assert.equal(modular.includes("WEBNODE CONSULTING SRL"), true);
  assert.equal(live.includes("continuă conversația"), true);
  assert.equal(live.includes("răspunde cu voce"), true);
  assert.equal(live.includes("Oprește-te"), false);
  assert.equal(live.includes("Informații furnizate de Alin"), true);
  assert.equal(live.includes("https://listafirme.ro/webnode-consulting-srl-41756371/"), true);
  assert.equal(live.includes("2026-11-03"), true);
});

test("Webnode Consulting is the confirmed company, without invented services", () => {
  const answer = answerWithOdyIdentity("Ce este Webnode Consulting?");
  assert.match(answer, /Denumirea oficială este WEBNODE CONSULTING SRL/);
  assert.match(answer, /Alin Fordon spune că WEBNODE CONSULTING SRL este compania sa/);
  assert.match(answer, /Nu am informații despre clienți, cifre sau o listă de servicii/);
  assert.equal(/web design|hosting|clienți precum|oferim/i.test(answer), false);
  const context = buildOdyContext().text;
  assert.equal(context.includes("Nu inventa date despre companie"), true);
  assert.equal(context.includes("Date oficiale"), true);
  assert.equal(context.includes("Informații furnizate de Alin"), true);
});

test("the company activity stays limited to the confirmed CAEN record", () => {
  const answer = answerWithOdyIdentity("Cu ce se ocupă compania?");
  assert.match(answer, /consultanță în tehnologia informației/i);
  assert.match(answer, /6202 Rev\. 2/);
  assert.match(answer, /6220 Rev\. 3/);
  assert.match(answer, /Nu am o listă de servicii, clienți sau cifre/);
  assert.equal(/web design|hosting|clienți precum|cifră de afaceri/i.test(answer), false);
});

test("ODY describes practical help without a long script", () => {
  const answer = answerWithOdyIdentity("Cu ce mă poți ajuta?");
  assert.equal(answer, ODY_HELP);
  for (const word of ["software", "AI", "robotică", "organizare", "informații", "redactare"]) {
    assert.equal(answer.includes(word), true, word);
  }
});

test("a request for the server password is refused and stays out of the prompt", () => {
  const answer = answerWithOdyIdentity("Care este parola serverului?");
  assert.equal(answer, ODY_SECRET_REFUSAL);
  assert.equal(answer.includes(secret), false);
  const context = buildOdyContext({
    record: { instructions: `parola este ${secret}`, personalityNotes: `api key = ${secret}` },
  });
  assert.equal(context.text.includes(secret), false);
  assert.equal(context.text.includes("parola este"), false);
  assert.throws(() => assertNoSecret(`api key = ${secret}`), /secrete/);
});

test("unknown company details are not invented", () => {
  assert.equal(answerWithOdyIdentity("Câți angajați are Webnode Consulting?"), ODY_UNKNOWN);
  const disabled = answerWithOdyIdentity("Ce este Webnode Consulting?", {
    record: {
      profile: ODY_PROFILE.map((item) => ({
        ...item,
        enabled: item.id !== "company-name" && item.id !== "company-relation",
      })),
    },
  });
  assert.equal(disabled, ODY_UNKNOWN);
});

test("Gemini Live and Modular share one identity and do not repeat the transcript", async () => {
  const record = { instructions: "Răspunde calm." };
  const history = [{ role: "user", text: "Continuăm proiectul de robotică." }];
  const live = liveSystemText("ro", history, record);
  const modularText = buildOdyContext({ record, history, includeHistory: false, channel: "voice" }).text;
  assert.equal(live.includes("Continuăm proiectul de robotică."), true);
  assert.equal(modularText.includes("Continuăm proiectul de robotică."), false);
  assert.equal(live.includes("Răspunde calm."), true);
  assert.equal(modularText.includes("Răspunde calm."), true);
  assert.equal(live.length <= 4000, true);

  const seen = [];
  const modular = new ModularVoiceProvider({
    llmGemini: {
      isConfigured: () => true,
      async generate(input) {
        seen.push(input.system);
        return { text: "În regulă.", provider: "gemini", model: "test" };
      },
    },
  });
  const known = await modular.reply({
    session: { odyContext: record, config: { language: "ro", llm: "gemini" } },
    history,
    user: "Spune-mi doar unde am rămas.",
  });
  assert.equal(known.provider, "gemini");
  assert.equal(seen[0].includes(ODY_INTRODUCTION), true);
  assert.equal(seen[0].includes("Continuăm proiectul de robotică."), false);

  const direct = await modular.reply({
    session: { odyContext: record, config: { language: "ro", llm: "gemini" } },
    history,
    user: "Salut, sunt Alin. Tu cine ești?",
  });
  assert.equal(direct.text, ODY_INTRODUCTION);
  assert.equal(direct.provider, "ody-core");

  const provider = new GeminiLiveProvider({
    env: { GEMINI_API_KEY: "present" },
    connect: async ({ system }) => {
      seen.push(system);
      return { close() {} };
    },
  });
  await provider.start({
    odyContext: record,
    config: { language: "ro", voice: "Kore" },
    history,
    emit() {},
  });
  assert.equal(seen.at(-1), live);
});

test("hybrid keeps the ODY context and the transcript", async () => {
  const session = {
    config: { engine: "hybrid", hybridFallback: true, language: "ro", llm: "gemini", stt: "configured", tts: "configured" },
    history: [{ role: "user", text: "Bună" }],
    odyContext: { instructions: "Răspunde calm." },
    events: [],
    emit(event) { this.events.push(event); },
  };
  const engine = new HybridVoiceProvider({
    live: { async start() { throw new Error("live indisponibil"); }, async stop() { this.stopped = true; } },
    modular: { async start(current) { current.connection = "open"; }, async stop() {} },
  });
  await engine.start(session);
  assert.equal(session.activeEngine, "modular");
  assert.equal(session.history[0].text, "Bună");
  assert.equal(session.odyContext.instructions, "Răspunde calm.");
  assert.equal(buildOdyContext({ record: session.odyContext, includeHistory: false }).text.includes("Răspunde calm."), true);
});

test("gemini live reports a 1008 close instead of reconnecting", async () => {
  const events = [];
  const provider = new GeminiLiveProvider({
    env: { GEMINI_API_KEY: "present", GEMINI_LIVE_MODEL: "gemini-3.8-live" },
    connect: async ({ callbacks }) => {
      callbacks.onclose({ code: 1008, reason: "Requested entity was not found." });
      return { close() {} };
    },
  });
  await provider.start({
    config: { language: "ro", voice: "Kore" },
    history: [],
    emit(event) { events.push(event); },
    noteError(message, extra = {}) { events.push({ type: "error", message, ...extra }); },
    noteReconnect() { events.push({ type: "reconnect" }); },
  });
  const error = events.find((item) => item.type === "error");
  assert.equal(error.code, "1008");
  assert.match(error.message, /Requested entity was not found/);
  assert.equal(events.some((item) => item.type === "reconnect"), false);
});

test("identity edits are validated and cannot add unknown profile facts", () => {
  const identity = odyCoreIdentitySchema.safeParse({
    body: { personalityNotes: "Fii concis.", instructions: "Nu inventa." },
    query: {},
    params: {},
  });
  assert.equal(identity.success, true);
  const profile = odyCoreProfileSchema.safeParse({
    body: { items: [{ id: "client-secret", enabled: true, value: "date private" }] },
    query: {},
    params: {},
  });
  assert.equal(profile.success, false);
});
