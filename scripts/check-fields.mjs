#!/usr/bin/env node
/**
 * Aserción de fuente del kit de campos (docs/REGLAS-GENERALES.md, issues #101 y #99):
 *
 * 1. En las superficies del panel (`components/admin` y `app/(admin)/(panel)`) no
 *    puede quedar ningún `<input>`, `<select>` ni `<textarea>` suelto. Los campos
 *    se dibujan con el kit canónico (`components/admin/AdminFields.tsx`) y los
 *    primitivos compartidos viven en `components/admin/AdminUI.tsx`; esos dos
 *    archivos son la única excepción.
 * 2. Los atributos de campo (`pattern`, `type="email|tel|date|…"`) y el valor
 *    enmascarado a mano (`value={…replace(…)}`, `value={…toLocaleString(…)}`)
 *    solo viven en el kit: si un módulo vuelve a armar un campo —o una máscara—
 *    la aserción lo frena (issue #101).
 * 3. `type="number"` está prohibido en todo el panel (también dentro de los
 *    primitivos): los montos van con `MoneyField` y las cantidades con
 *    `NumberField`.
 *
 * Excepciones documentadas:
 * - los checkbox de fila (`<input type="checkbox">`, por ejemplo el checklist
 *   operativo) son la primitiva de selección múltiple;
 * - los `<input type="hidden">` de los formularios (demo);
 * - las superficies con piel propia fuera del panel: impresión (`(print)`) y
 *   portal del cliente, que no usan el kit del panel.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = [join(ROOT, "components", "admin"), join(ROOT, "app", "(admin)", "(panel)")];
const PRIMITIVE_FILES = new Set([
  resolve(ROOT, "components", "admin", "AdminFields.tsx"),
  resolve(ROOT, "components", "admin", "AdminUI.tsx"),
]);
const TAG_PATTERN = /<(input|select|textarea)\b[\s\S]*?>/g;
const NUMBER_TYPE_PATTERN = /type=["']number["']/;
/** Atributos que delatan un campo armado a mano en un módulo (issue #101). */
const FIELD_ATTRIBUTE_PATTERN = /\bpattern\s*=|type=["'](email|tel|date|time|datetime-local|search|url)["']/;
/** Un módulo no enmascara el valor de un campo: eso es del kit. */
const FIELD_VALUE_PATTERN = /value=\{[^}]*(replace\(|toLocaleString\()/;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/** Tapa comentarios conservando los saltos de línea (los números de línea no se mueven). */
function maskComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (comment) => " ".repeat(comment.length));
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

const violations = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const path = relative(ROOT, file);
    const source = maskComments(readFileSync(file, "utf8"));
    const isPrimitive = PRIMITIVE_FILES.has(resolve(file));

    if (!isPrimitive) {
      for (const match of source.matchAll(TAG_PATTERN)) {
        const name = match[0].match(/^<(\w+)/)[1];
        if (name === "input" && /type="checkbox"/.test(match[0])) continue;
        if (name === "input" && /type="hidden"/.test(match[0])) continue;
        violations.push({ path, line: lineOf(source, match.index), message: `campo suelto <${name}>: usá el kit canónico (components/admin/AdminFields.tsx)` });
      }
      for (const match of source.matchAll(new RegExp(FIELD_ATTRIBUTE_PATTERN, "g"))) {
        violations.push({ path, line: lineOf(source, match.index), message: `campo duplicado (${match[0].trim()}): un tipo = un componente del kit (issue #101)` });
      }
      for (const match of source.matchAll(new RegExp(FIELD_VALUE_PATTERN, "g"))) {
        violations.push({ path, line: lineOf(source, match.index), message: "el campo se enmascara o formatea en el módulo: eso vive en el kit (issue #101)" });
      }
    }

    source.split("\n").forEach((text, position) => {
      if (!NUMBER_TYPE_PATTERN.test(text)) return;
      violations.push({ path, line: position + 1, message: 'type="number" prohibido: usá MoneyField o NumberField' });
    });
  }
}

if (violations.length > 0) {
  console.error(`Chequeo de campos: ${violations.length} problema(s) de fuente.`);
  for (const violation of violations) {
    console.error(`  ${violation.path}:${violation.line}: ${violation.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("Chequeo de campos: sin inputs sueltos, sin campos duplicados ni type=\"number\" en el panel.");
}
