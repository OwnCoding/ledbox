import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Padding interno de los contenedores (issue #121): el cuerpo de `.admin-panel`
 * lleva 12px —alineado con el encabezado— para formularios, grillas y bloques
 * directos, y excluye a los hijos que ya traen su propio espacio (tablas,
 * tableros, barras, KPI, notas, vacíos, bloques demo y calendario) para no
 * duplicarlo. La excepción de los campos en línea con pista/error va después
 * para que su `padding-bottom` no se recorte.
 */
const root = process.cwd();
const css = readFileSync(join(root, "app", "globals.css"), "utf8");
const ui = readFileSync(join(root, "components", "admin", "AdminUI.tsx"), "utf8");

const BODY_RULE = ".admin-panel > :not(";
const EXCLUDED = [
  "admin-table-wrap",
  "admin-board-wrap",
  "admin-toolbar",
  "admin-kpis",
  "admin-note",
  "admin-empty",
  "admin-demo-hero",
  "admin-demo-bar",
  "admin-cal-month",
];

/** ¿La hoja declara padding o margen propio para esa clase (en cualquier regla)? */
function declaresOwnSpace(cls: string): boolean {
  const pattern = new RegExp(`\\.${cls}(?![a-z0-9-])[^{}]*\\{([^{}]*)\\}`, "g");
  return [...css.matchAll(pattern)].some((match) => /\b(padding|margin)\b/.test(match[1]));
}

test("el cuerpo del panel lleva el padding interno estándar", () => {
  const start = css.indexOf(BODY_RULE);
  assert.ok(start > 0, "falta la regla del cuerpo del panel");
  const block = css.slice(start, css.indexOf("}", start));
  assert.match(block, /padding: 12px/, "el cuerpo del panel no lleva 12px");
});

test("las exclusiones del cuerpo son las conocidas y cada una tiene su espacio", () => {
  const start = css.indexOf(BODY_RULE);
  const selector = css.slice(start, css.indexOf("{", start));
  const excluded = [...selector.matchAll(/:not\(\.([a-z0-9-]+)\)/g)].map((match) => match[1]);
  assert.deepEqual(excluded, EXCLUDED, "cambió la lista de hijos excluidos");
  for (const cls of excluded) {
    assert.ok(declaresOwnSpace(cls), `.${cls} está excluido pero no declara padding ni margen propio`);
  }
});

test("los campos en línea con pista conservan su espacio inferior", () => {
  const body = css.indexOf(BODY_RULE);
  const restore = css.indexOf(".admin-panel > .admin-inline-form:has(", body);
  assert.ok(restore > body, "la excepción del campo en línea debe ir después del cuerpo");
  const block = css.slice(restore, css.indexOf("}", restore));
  assert.match(block, /padding-bottom: 18px/, "el mensaje del campo quedaría recortado");
});

test("AdminPanel entrega los hijos directos (sin contenedor intermedio)", () => {
  const start = ui.indexOf("export function AdminPanel(");
  assert.ok(start > 0, "no se encontró AdminPanel");
  const block = ui.slice(start, ui.indexOf("export function AdminTable(", start));
  assert.match(block, /className="admin-panel"/, "cambió el contenedor del panel");
  assert.doesNotMatch(block, /admin-panel-body/, "no debe aparecer un cuerpo propio: la regla apunta a los hijos directos");
});
