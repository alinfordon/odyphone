const sessions = new Map();

export function openLiveSession({ channelId, callerId = "" }) {
  const id = String(channelId || "");
  const existing = sessions.get(id);
  if (existing) return { duplicate: true, session: existing };
  const session = {
    channelId: id,
    callerId: String(callerId || ""),
    startedAt: new Date().toISOString(),
    status: "stasis",
    audioSocket: "waiting",
    stasis: "started",
  };
  sessions.set(id, session);
  return { duplicate: false, session };
}

export function markLiveAudio(channelId, state) {
  const session = sessions.get(String(channelId || ""));
  if (!session) return null;
  session.audioSocket = state;
  return session;
}

export function markLiveStasis(channelId, state) {
  const session = sessions.get(String(channelId || ""));
  if (!session) return null;
  session.stasis = state;
  return session;
}

export function closeLiveSession(channelId) {
  const id = String(channelId || "");
  const session = sessions.get(id);
  if (!session) return { closed: false };
  session.status = "closed";
  session.stasis = "ended";
  if (session.audioSocket === "connected") session.audioSocket = "closed";
  sessions.delete(id);
  return { closed: true, session };
}

export function activeSessionCount() {
  return sessions.size;
}

export function resetLiveSessions() {
  sessions.clear();
}
