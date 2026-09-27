#!/usr/bin/env node
/**
 * Humo E2E de LedBox/EventOS (issue #84).
 *
 * Corre los flujos críticos contra producción (configurable) y devuelve exit
 * code: 0 todo verde, 1 con fallos. Sin frameworks pesados: `fetch` para lo
 * que no necesita navegador y `puppeteer-core` con el Chrome del sistema para
 * lo visual.
 *
 * Uso:
 *   npm run e2e
 *   E2E_BASE_URL=https://app.ledbox.online npm run e2e   # los hosts se derivan
 *   E2E_APP_URL=… E2E_DEMO_URL=… E2E_CLIENT_URL=… E2E_SITE_URL=… E2E_EVENTOS_URL=… npm run e2e
 *   E2E_CHROME_PATH="/ruta/a/Chrome" npm run e2e
 */

import puppeteer from "puppeteer-core";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.E2E_BASE_URL || "https://app.ledbox.online").replace(/\/$/, "");
const APP = (process.env.E2E_APP_URL || BASE).replace(/\/$/, "");
const DEMO = (process.env.E2E_DEMO_URL || "https://demo.ledbox.online").replace(/\/$/, "");
const CLIENT = (process.env.E2E_CLIENT_URL || "https://clientes.ledbox.online").replace(/\/$/, "");
const SITE = (process.env.E2E_SITE_URL || "https://ledbox.online").replace(/\/$/, "");
const EVENTOS = (process.env.E2E_EVENTOS_URL || "https://eventos.ledbox.online").replace(/\/$/, "");

const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok: Boolean(ok) });
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const warn = (line) => console.log(`· ${line}`);

function findChrome() {
  const candidates = [
    process.env.E2E_CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) || null;
}

async function fetchText(url, init) {
  const response = await fetch(url, { redirect: "follow", ...init });
  return { status: response.status, text: await response.text() };
}

async function main() {
  console.log(`═══ Humo E2E — app ${APP} · demo ${DEMO} · portal ${CLIENT} · sitio ${SITE} · eventos ${EVENTOS} ═══\n`);

  // ── 1. HTTP puro (fetch) ──────────────────────────────────────────────────
  console.log("▌ Superficies, salud y SEO por host");
  const health = await fetchText(`${SITE}/api/health`);
  let healthJson = null;
  try {
    healthJson = JSON.parse(health.text);
  } catch {
    /* se reporta abajo */
  }
  check("/api/health responde ok con migraciones", health.status === 200 && healthJson?.status === "ok" && Number.isInteger(healthJson?.migrations), `migrations=${healthJson?.migrations}`);

  const login = await fetchText(`${APP}/login`);
  const version = (login.text.match(/v\d+\.\d+\.\d+/) || [null])[0];
  check("login del panel 200 y versión visible", login.status === 200 && Boolean(version), version || "sin versión");

  const appRobots = await fetchText(`${APP}/robots.txt`);
  check("app: robots con Disallow: /", appRobots.status === 200 && /disallow:\s*\//i.test(appRobots.text), appRobots.text.replace(/\s+/g, " ").slice(0, 60));
  const appSitemap = await fetchText(`${APP}/sitemap.xml`);
  check("app: sitemap vacío (host no indexable)", appSitemap.status === 200 && !/<loc>/.test(appSitemap.text));

  const eventosRobots = await fetchText(`${EVENTOS}/robots.txt`);
  check("eventos: robots con su sitemap propio", eventosRobots.status === 200 && eventosRobots.text.includes(`${EVENTOS}/sitemap.xml`));
  const eventosSitemap = await fetchText(`${EVENTOS}/sitemap.xml`);
  check("eventos: sitemap con la URL de eventos", eventosSitemap.status === 200 && eventosSitemap.text.includes(`${EVENTOS}/`));

  const BAD_CODE = "AAAA-BBBB-CCCC-DDDD-EEEE";
  const firma404 = await fetchText(`${CLIENT}/firma/${BAD_CODE}`);
  check("firma: código inválido → 404 claro y noindex", firma404.status === 404 && /no encontramos esa solicitud de firma/i.test(firma404.text) && /noindex/i.test(firma404.text));
  const firmaDoc = await fetchText(`${CLIENT}/firma/${BAD_CODE}/documento`);
  const firmaAud = await fetchText(`${CLIENT}/firma/${BAD_CODE}/auditoria`);
  check("firma: /documento y /auditoria sin código válido → 404", firmaDoc.status === 404 && firmaAud.status === 404);
  const firmaApi = await fetchText(`${CLIENT}/api/portal/firma/${BAD_CODE}/documento`);
  check("firma: API documento no expone nada (404 JSON)", firmaApi.status === 404 && /no encontramos/i.test(firmaApi.text), firmaApi.text.replace(/\s+/g, " ").slice(0, 60));

  // ── 2. Navegador real ────────────────────────────────────────────────────
  const chrome = findChrome();
  if (!chrome) {
    check("Chrome del sistema disponible", false, "definí E2E_CHROME_PATH");
  } else {
    const profile = mkdtempSync(join(tmpdir(), "ledbox-e2e-"));
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, userDataDir: profile, args: ["--no-first-run", "--no-default-browser-check", "--lang=es-PY"] });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text().slice(0, 120));
    });
    page.on("pageerror", (error) => consoleErrors.push(String(error).slice(0, 120)));
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    try {
      console.log("\n▌ Login del panel (1440 y 390)");
      for (const [width, height] of [[1440, 900], [390, 844]]) {
        await page.setViewport({ width, height, deviceScaleFactor: 1 });
        await page.goto(`${APP}/login`, { waitUntil: "networkidle2" });
        await sleep(600);
        const state = await page.evaluate(() => ({
          version: (document.body.innerText.match(/v\d+\.\d+\.\d+/) || [null])[0],
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }));
        check(`login @${width}: versión visible y sin scroll lateral`, state.version === version && state.overflow <= 1, `v=${state.version} overflow=${state.overflow}`);
      }

      console.log("\n▌ Panel demo (sesión de visitante)");
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(`${DEMO}/`, { waitUntil: "networkidle2" });
      await sleep(1200);
      await page.goto(`${DEMO}/dashboard`, { waitUntil: "networkidle2" });
      await sleep(900);
      const resumen = await page.evaluate(() => ({
        kpis: document.querySelectorAll(".admin-kpi").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      check("demo Resumen renderiza con KPIs y sin scroll lateral", resumen.kpis > 0 && resumen.overflow <= 1, `kpis=${resumen.kpis} overflow=${resumen.overflow}`);

      await page.goto(`${DEMO}/eventos?vista=lista`, { waitUntil: "networkidle2" });
      await sleep(900);
      const eventos = await page.evaluate(() => ({
        rows: document.querySelectorAll(".admin-table-row").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      check("demo Eventos (lista) renderiza y sin scroll lateral", eventos.rows > 0 && eventos.overflow <= 1, `filas=${eventos.rows} overflow=${eventos.overflow}`);

      await page.goto(`${DEMO}/presupuestos?vista=tablero`, { waitUntil: "networkidle2" });
      await sleep(900);
      const board = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        boardOverflowX: document.querySelector(".admin-board-wrap") ? getComputedStyle(document.querySelector(".admin-board-wrap")).overflowX : null,
      }));
      check("demo tablero: solo el tablero desliza, la página no", board.overflow <= 1 && board.boardOverflowX === "auto", JSON.stringify(board));

      await page.setViewport({ width: 390, height: 844 });
      await page.goto(`${DEMO}/dashboard`, { waitUntil: "networkidle2" });
      await sleep(800);
      check("demo @390: sin scroll lateral de página", (await overflow()) <= 1);

      console.log("\n▌ Portal del presupuesto (demo, autogestión)");
      await page.setViewport({ width: 1440, height: 900 });
      const demoBudget = JSON.parse((await fetchText(`${CLIENT}/api/portal/demo?format=json`)).text);
      await page.goto(`${CLIENT}${demoBudget.path}`, { waitUntil: "networkidle2" });
      await sleep(1200);
      const portal = await page.evaluate(() => ({
        options: document.querySelectorAll(".portal-decision-option").length,
        formula: Boolean(document.querySelector(".portal-total-formula")),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      check("portal: decisión con 3 opciones y fórmula, sin scroll lateral", portal.options === 3 && portal.formula && portal.overflow <= 1, JSON.stringify(portal));

      const rebaja = await page.evaluateHandle(() => Array.from(document.querySelectorAll(".portal-decision-option")).find((option) => /Rebaja/.test(option.textContent)));
      await rebaja.asElement().click();
      await sleep(400);
      const montoSeg = await page.evaluateHandle(() => Array.from(document.querySelectorAll(".portal-segment")).find((segment) => /^Monto$/.test(segment.textContent.trim())));
      await montoSeg.asElement().click();
      await sleep(300);
      const typeDiscount = async (text) => {
        const input = await page.$("#portal-discount-value");
        await input.click();
        await page.evaluate((element) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          setter.call(element, "");
          element.dispatchEvent(new InputEvent("input", { bubbles: true }));
        }, input);
        await sleep(150);
        await page.keyboard.type(text, { delay: 20 });
        await sleep(400);
      };
      const readDiscount = () =>
        page.evaluate(() => ({
          value: document.querySelector("#portal-discount-value")?.value ?? null,
          invalid: document.querySelector("#portal-discount-value")?.getAttribute("aria-invalid"),
          intent: document.querySelector(".portal-action-intent")?.textContent.replace(/\s+/g, " ").trim() ?? "",
        }));

      await typeDiscount("10000000");
      let discount = await readDiscount();
      check("portal rebaja 10.000.000 formateada y con total", discount.value === "10.000.000" && /(queda en Gs|no puede superar el subtotal)/.test(discount.intent) && !/queda en Gs 0/.test(discount.intent), JSON.stringify(discount));

      await typeDiscount("89898999");
      discount = await readDiscount();
      check("portal rebaja 89.898.999 con tope claro y sin «Gs 0»", discount.value === "89.898.999" && discount.invalid === "true" && /no puede superar el subtotal/.test(discount.intent) && !/queda en Gs 0/.test(discount.intent), JSON.stringify(discount));

      check("consola del navegador sin errores", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
    } finally {
      await browser.close();
      rmSync(profile, { recursive: true, force: true });
    }
  }

  // ── Resultado ────────────────────────────────────────────────────────────
  const failed = results.filter((result) => !result.ok);
  console.log(`\n═══ E2E: ${results.length - failed.length}/${results.length} en verde ═══`);
  if (failed.length) {
    for (const result of failed) console.log(`✗ ${result.label}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`e2e: error inesperado — ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
