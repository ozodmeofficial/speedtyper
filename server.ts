/**
 * SpeedTyper production/dev server: Next.js request handler + race websocket
 * endpoint (/ws) on the same port, in a single Node process.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import next from "next";
import { createRaceServer } from "./src/server/race/ws";
import { clientIp, CLIENT_IP_HEADER } from "./src/server/ip";
import { prisma } from "./src/server/db";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME_BIND ?? "0.0.0.0";
const dir = process.env.APP_DIR ?? process.cwd();

async function main() {
  // In the standalone runtime image next.config.ts is not available; Next
  // stores the resolved config in required-server-files.json.
  const rsf = path.join(dir, ".next", "required-server-files.json");
  if (!dev && existsSync(rsf) && !process.env.__NEXT_PRIVATE_STANDALONE_CONFIG) {
    const { config } = JSON.parse(readFileSync(rsf, "utf8")) as { config: unknown };
    process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);
  }

  const app = next({ dev, dir, hostname: "localhost", port });
  const handle = app.getRequestHandler();
  await app.prepare();
  const nextUpgrade = dev ? app.getUpgradeHandler() : null;
  const race = createRaceServer();

  const server = createServer((req, res) => {
    // never trust a client-supplied value for our internal header
    delete req.headers[CLIENT_IP_HEADER];
    req.headers[CLIENT_IP_HEADER] = clientIp(req.socket.remoteAddress, req.headers);
    handle(req, res).catch((err: unknown) => {
      console.error("[http] unhandled", err);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    if (url === "/ws" || url.startsWith("/ws?")) {
      race.handleUpgrade(req, socket, head, clientIp(req.socket.remoteAddress, req.headers));
    } else if (nextUpgrade) {
      void nextUpgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.listen(port, hostname, () => {
    console.info(`> SpeedTyper ready on http://${hostname}:${port} (${dev ? "dev" : "production"})`);
  });

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.info(`> ${signal} received, shutting down`);
    race.close();
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
