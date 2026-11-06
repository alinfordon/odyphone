import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const hostname = process.env.HOST || "127.0.0.1";
if (!["127.0.0.1", "::1", "0.0.0.0"].includes(hostname)) {
  console.error("Adresa de bind pentru frontend este invalidă.");
  process.exit(1);
}

const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", hostname], {
  stdio: "inherit",
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.once("error", () => { process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
