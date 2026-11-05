export function voiceLabWebSocketUrl(pageLocation) {
  const protocol = pageLocation?.protocol === "https:" ? "wss:" : "ws:";
  const host = pageLocation?.host || "";
  return `${protocol}//${host}/ws/voice-lab`;
}

export function voiceLabCloseMessage(code, reason) {
  const numeric = Number(code);
  if (numeric === 1000 || numeric === 1001 || numeric === 1005) return "";
  const detail = String(reason || "").replace(/[\r\n]/g, " ").slice(0, 180);
  if (numeric === 1006) {
    return "Conexiunea browserului s-a întrerupt fără un cod de la server (cod 1006).";
  }
  if (numeric === 4001) {
    return detail
      ? `Autentificarea WebSocket a eșuat (cod 4001): ${detail}`
      : "Autentificarea WebSocket a eșuat (cod 4001).";
  }
  if (numeric === 4003) {
    return detail
      ? `Motorul vocal nu a pornit (cod 4003): ${detail}`
      : "Motorul vocal nu a pornit (cod 4003).";
  }
  return `Conexiunea de test s-a închis (cod ${numeric}${detail ? `: ${detail}` : ""}).`;
}
