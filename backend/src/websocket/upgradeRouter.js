import { logger } from "../config/logger.js";

const routesByServer = new WeakMap();

export function registerWebSocketRoute(server, path, wss) {
  let routes = routesByServer.get(server);
  if (!routes) {
    routes = [];
    routesByServer.set(server, routes);
    server.on("upgrade", (request, socket, head) => {
      const pathname = String(request.url || "").split("?")[0];
      const route = routes.find((item) => item.path === pathname);
      if (!route) {
        logger.warn({ stage: "upgrade", path: pathname, code: "WS_PATH_REJECTED" }, "websocket upgrade rejected");
        socket.destroy();
        return;
      }
      logger.info({ stage: "upgrade", path: pathname }, "websocket upgrade routed");
      route.wss.handleUpgrade(request, socket, head, (ws) => {
        route.wss.emit("connection", ws, request);
      });
    });
  }
  routes.push({ path, wss });
}
