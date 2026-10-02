import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Facturación y Plantillas en mobile (issue #153, auditoría móvil crítica 3):
 * las listas usan la regla compartida de tarjetas (≤980 px, `useAdminCompactList`)
 * y el texto explicativo del cierre mensual es una sola corriente —el flex viejo
 * lo partía en columnas y palabras sueltas—. Si una pantalla vuelve a la tabla
 * con scroll horizontal o al texto en columnas, estos tests fallan.
 */
const root = process.cwd();
const facturacion = readFileSync(join(root, "components/admin/modules/FacturacionModule.tsx"), "utf8");
const plantillas = readFileSync(join(root, "components/admin/modules/PlantillasModule.tsx"), "utf8");
const css = readFileSync(join(root, "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

test("las listas de Facturación y Plantillas ofrecen tarjetas en pantalla chica", () => {
  for (const [name, source] of [
    ["Facturación", facturacion],
    ["Plantillas", plantillas],
  ]) {
    assert.match(source, /useAdminCompactList\(\)/, `${name}: falta la regla compacta del kit`);
    assert.match(source, /<AdminCardGrid/, `${name}: falta la grilla de tarjetas`);
  }
});

test("cada tabla de Facturación tiene su par en tarjetas", () => {
  const views = ["facturables", "facturas", "compras", "libro-ventas", "libro-compras", "cierres"];
  for (const view of views) {
    assert.match(facturacion, new RegExp(`view="${view}"`), `falta la tabla ${view}`);
  }
  assert.equal((facturacion.match(/compact \? \(/g) ?? []).length, views.length, "hay tablas sin su variante compacta");
  assert.equal((facturacion.match(/<AdminCardGrid/g) ?? []).length, views.length, "faltan grillas de tarjetas");
});

test("la nota explicativa del panel es una sola corriente de texto", () => {
  const rule = /\.admin-note\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.ok(rule, "falta la regla .admin-note");
  assert.doesNotMatch(rule, /display:\s*flex/, "el flex vuelve a partir el texto en columnas");
  assert.match(rule, /overflow-wrap:\s*break-word/, "el texto largo tiene que poder cortar");
  assert.match(css, /\.admin-note > \.admin-icon\s*\{[^}]*vertical-align/, "el ícono de la nota queda en línea");
  // El cierre mensual usa la nota compartida con su <strong> inline.
  assert.match(facturacion, /Cerrar el mes congela el resumen y <strong>bloquea<\/strong>/, "el aviso del cierre no está en la nota");
});
