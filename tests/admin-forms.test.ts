import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Alineación de los formularios del panel (issues #89 y #102): los **controles**
 * comparten línea base aunque cambien label, hint o error. El campo no reparte
 * la altura sobrante entre sus filas, las grillas comparten las filas del campo
 * (`subgrid`: label · control · mensaje) y los contenedores en línea anclan
 * abajo con el mensaje fuera de la línea. Estas guardas frenan la vuelta atrás.
 */
const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (selector: string) => new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

test("el campo no estira sus filas: el control no se corre", () => {
  assert.match(rule(".admin-field"), /align-content:\s*start/, "sin align-content el label crece y empuja el control");
});

test("las grillas de formulario comparten las filas del campo", () => {
  assert.match(css, /@supports \(grid-template-rows: subgrid\)/, "sin fallback, la grilla se rompe donde no hay subgrid");
  for (const container of [".admin-form-grid", ".admin-form-group", ".admin-plan-grid"]) {
    assert.match(
      css,
      new RegExp(`\\${container} > \\.admin-field[^{]*\\{[^}]*grid-template-rows:\\s*subgrid`),
      `${container}: los controles no comparten fila con sus vecinos`,
    );
    assert.match(css, new RegExp(`\\${container} > \\.admin-field[^{]*\\{[^}]*grid-row:\\s*span 3`), `${container}: falta el span de las tres filas`);
  }
});

test("los contenedores en línea anclan los controles abajo", () => {
  assert.match(rule(".admin-toolbar"), /align-items:\s*flex-end/, "la barra de filtros (#89)");
  assert.match(rule(".admin-inline-form"), /align-items:\s*flex-end/, "el formulario en línea (#102)");
  assert.match(css, /\.admin-inline-form \.admin-field-hint, \.admin-inline-form \.admin-field-error\s*\{[^}]*position:\s*absolute/, "el mensaje no corre el control en línea");
  assert.match(css, /\.admin-inline-form:has\(\.admin-field-hint, \.admin-field-error\)\s*\{[^}]*padding-bottom/, "espacio reservado para el mensaje");
});
