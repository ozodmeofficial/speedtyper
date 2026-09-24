// Bundles server.ts (+ race server) into dist/server.cjs. `next`, Prisma and
// native modules stay external and are resolved from node_modules at runtime.
import { build } from "esbuild";

await build({
  entryPoints: ["server.ts"],
  outfile: "dist/server.cjs",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  external: ["next", "next/*", "@prisma/client", ".prisma/*", "@node-rs/argon2", "bufferutil", "utf-8-validate"],
  define: { "process.env.NEXT_RUNTIME": '"nodejs"' },
  logLevel: "info",
});
