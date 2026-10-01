import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Padding de página (issue #115): el padding lateral y superior lo pone el
 * contenedor (`.admin-main-body`) y el topbar acompaña el mismo borde. Los
 * bloques de pantalla no agregan el suyo (evita el 12 + 26) y en mobile el
 * valor baja a 12–16 px. Estas guardas frenan la vuelta al contenido pegado.
 */
const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const block = (selector: string) => new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
const padding = (selector: string) => {
  const value = /padding:\s*([^;]+);/.exec(block(selector))?.[1]?.trim();
  assert.ok(value, `${selector}: falta el padding`);
  return value.split(/\s+/).map((part) => parseFloat(part));
};

test("el cuerpo del panel respira en escritorio", () => {
  const [top, lateral] = padding(".admin-main-body");
  assert.ok(top >= 20 && top <= 24, `superior ${top}px fuera de 20–24 (issue #115)`);
  assert.ok(lateral >= 24 && lateral <= 28, `lateral ${lateral}px fuera de 24–28`);
});

test("el topbar comparte el borde del contenido", () => {
  const bodyLateral = padding(".admin-main-body")[1];
  const topbarLateral = padding(".admin-topbar")[1];
  assert.equal(topbarLateral, bodyLateral, "el topbar y el contenido deben arrancar en el mismo eje");
});

test("mobile: 12–16 px en cuerpo y topbar", () => {
  const mobile = /@media \(max-width: 980px\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
  const body = /\.admin-main-body \{ padding: ([^;]+);/.exec(mobile)?.[1];
  const topbar = /\.admin-topbar \{ gap: 8px; padding: 0 ([^;]+);/.exec(mobile)?.[1];
  assert.ok(body, "falta el padding mobile del cuerpo");
  const lateral = parseFloat(body);
  assert.ok(lateral >= 12 && lateral <= 16, `lateral mobile ${lateral}px fuera de 12–16`);
  assert.equal(parseFloat(topbar ?? ""), lateral, "en mobile el topbar también acompaña");
});

test("los bloques de pantalla no agregan padding propio", () => {
  for (const selector of [".admin-profile-grid", ".admin-settings"]) {
    assert.equal(padding(selector)[0], 0, `${selector}: el padding de página lo pone el contenedor`);
  }
  assert.match(block(".admin-module-page"), /display:\s*grid/, "los módulos heredan el padding del cuerpo");
  assert.doesNotMatch(block(".admin-module-page"), /padding:/, "el módulo no pone su propio padding");
});
