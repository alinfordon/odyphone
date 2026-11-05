const MAX_DELAY_MS = 30000;

export function createAriEventConnection({
  WebSocketImpl,
  getTarget,
  onEvent,
  onOpen,
  onClose,
  onError,
  schedule = (fn, ms) => setTimeout(fn, ms),
  initialDelay = 1000,
}) {
  let stopped = false;
  let socket;
  let timer;
  let delay = initialDelay;

  function connect() {
    if (stopped) return;
    let target;
    try {
      target = getTarget();
    } catch (error) {
      onError?.(error);
      return;
    }
    socket = new WebSocketImpl(target.url, { headers: { Authorization: target.authorization } });
    socket.on("open", () => {
      delay = initialDelay;
      onOpen?.();
    });
    socket.on("message", (raw) => {
      let event;
      try {
        event = JSON.parse(String(raw));
      } catch {
        return;
      }
      Promise.resolve(onEvent?.(event)).catch((error) => onError?.(error));
    });
    socket.on("close", () => {
      onClose?.();
      if (stopped) return;
      timer = schedule(connect, delay);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    });
    socket.on("error", (error) => {
      onError?.(error);
      socket.close();
    });
  }

  connect();
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    },
  };
}
