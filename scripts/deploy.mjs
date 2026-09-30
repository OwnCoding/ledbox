#!/usr/bin/env node
/**
 * Deploy de EventOS / LedBox (issue #37).
 *
 * Flujo `publish` (separado de `prepare`, que solo valida):
 *   1. Exige el árbol limpio y la rama de deploy.
 *   2. Sube el parche de versión en `package.json` (fuente única: el footer y el
 *      panel la leen de `lib/version.ts`).
 *   3. Corre `typecheck`, `test:rules` y `build`.
 *   4. Commitea `chore(release): vX.Y.Z` y pushea la rama.
 *   5. Dispara el deploy del Hub (webhook + token leídos del entorno o de
 *      `~/.config/ledbox/deploy.env`; nunca del repo). Si falta uno de los dos
 *      falla (salvo `--no-trigger`), y si el Hub responde no-2xx el comando
 *      termina en error con status y cuerpo (sin el token): nunca reporta un
 *      deploy que no salió.
 *
 * Uso: `npm run deploy:patch` (o `node scripts/deploy.mjs --no-trigger`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const skipTrigger = args.has("--no-trigger");
const DEPLOY_BRANCH = "codex/ledbox-gestion-multiempresa";

function run(command, commandArgs) {
  execFileSync(command, commandArgs, { stdio: "inherit" });
}

function git(...gitArgs) {
  return execFileSync("git", gitArgs, { encoding: "utf8" }).trim();
}

function loadDeployEnv() {
  if (process.env.LEDBOX_DEPLOY_WEBHOOK_URL && process.env.LEDBOX_HUB_API_TOKEN) return;
  const file = join(homedir(), ".config", "ledbox", "deploy.env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^export\s+([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

async function main() {
  const status = git("status", "--porcelain");
  if (status) {
    console.error("El árbol tiene cambios sin commitear; commiteá o guardá antes de deployar.");
    process.exit(1);
  }
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== DEPLOY_BRANCH) {
    console.error(`Estás en «${branch}»; el deploy sale de «${DEPLOY_BRANCH}».`);
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const [major, minor, patch] = String(pkg.version).split(".").map(Number);
  const next = `${major}.${minor}.${(patch || 0) + 1}`;
  pkg.version = next;
  writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`[deploy] Versión ${pkg.version.replace(next, "") || "anterior"} → v${next}`);

  console.log("[deploy] Verificando (typecheck, tests, build)…");
  run("npm", ["run", "typecheck"]);
  run("npm", ["run", "test:rules"]);
  run("npm", ["run", "build"]);

  run("git", ["add", "package.json"]);
  run("git", ["commit", "-m", `chore(release): v${next}`]);
  run("git", ["push", "origin", DEPLOY_BRANCH]);
  console.log(`[deploy] v${next} pusheada a ${DEPLOY_BRANCH}.`);

  if (skipTrigger) return;
  loadDeployEnv();
  const webhook = process.env.LEDBOX_DEPLOY_WEBHOOK_URL;
  const token = process.env.LEDBOX_HUB_API_TOKEN;
  const missing = [!webhook && "LEDBOX_DEPLOY_WEBHOOK_URL", !token && "LEDBOX_HUB_API_TOKEN"].filter(Boolean);
  if (missing.length > 0) {
    console.error(`[deploy] Falta ${missing.join(" y ")}: sin eso no se puede disparar el deploy del Hub (usá --no-trigger para omitirlo a propósito).`);
    process.exit(1);
  }
  const response = await fetch(webhook, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  const body = (await response.text()).slice(0, 160);
  if (!response.ok) {
    // Un 401/403 del Hub es un deploy que NO salió: el comando tiene que fallar.
    console.error(`[deploy] El Hub rechazó el deploy: HTTP ${response.status} ${response.statusText} — ${body}`);
    process.exit(1);
  }
  console.log(`[deploy] Hub: ${response.status} ${body}`);
}

main().catch((error) => {
  console.error(`[deploy] Falló: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
