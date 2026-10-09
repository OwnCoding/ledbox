import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Portal del cliente (issue #144): resumen con total, vencimiento y acceso a la
 * decisión; plan de pagos en tarjetas en mobile; Cronología y detalle del
 * resumen plegados; orden productos → total → condiciones → decisión; menos
 * mayúsculas; y pantalla de éxito post-autorización con próximos pasos y
 * descarga. Solo presentación: la lógica de aprobación no se toca.
 */
const root = process.cwd();
const view = readFileSync(join(root, "app", "(portal)", "_components", "PortalBudgetView.tsx"), "utf8");
const statics = readFileSync(join(root, "app", "(portal)", "_components", "PortalBudgetStatic.tsx"), "utf8");
const css = readFileSync(join(root, "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

test("el resumen muestra total, vencimiento y acceso a la decisión", () => {
  assert.match(css, /@media \(min-width: 1024px\) \{[\s\S]{0,400}\.portal-budget-aside \{ position: sticky/, "el resumen de escritorio no es sticky");
  assert.match(view, /Ir a la decisión/, "el resumen no lleva a la decisión");
  assert.match(view, /portal-mobile-sticky-due/, "la barra móvil no muestra el vencimiento");
  assert.match(css, /\.portal-mobile-sticky-due/, "falta el estilo del vencimiento en la barra");
});

test("el plan de pagos propuesto se lee como tarjetas en mobile", () => {
  assert.match(view, /data-label="Vencimiento"/, "las cuotas no declaran el vencimiento para la ficha");
  assert.match(view, /data-label="Monto"/, "las cuotas no declaran el monto para la ficha");
  assert.match(css, /\.portal-table--plan:not\(\.portal-table--expected\) \{ min-width: 0; \}/, "el plan propuesto sigue con ancho mínimo");
  assert.match(css, /\.portal-table--plan:not\(\.portal-table--expected\) td::before \{ content: attr\(data-label\)/, "la ficha no dibuja la etiqueta del dato");
});

test("Cronología y detalle del resumen quedan plegados", () => {
  assert.match(statics, /<details className="portal-card portal-disclosure"/, "la cronología no es plegable");
  assert.match(statics, /portal-disclosure-hint/, "la cronología no resume lo que hay adentro");
  assert.match(view, /portal-disclosure--inner/, "el resumen no tiene su detalle plegado");
  assert.match(css, /\.portal-disclosure\[open\] > summary::after/, "la sección plegada no indica el estado");
});

test("el orden del recorrido es productos → condiciones → decisión", () => {
  const terms = view.indexOf('aria-labelledby="portal-terms"');
  const items = view.indexOf('aria-labelledby="portal-items"');
  const action = view.indexOf('aria-labelledby="portal-action"');
  assert.ok(items > 0 && terms > 0 && action > 0, "faltan secciones del recorrido");
  assert.ok(items < terms, "las condiciones tienen que ir después de los productos");
  assert.ok(terms < action, "la decisión tiene que ir después de las condiciones");
});

test("menos secciones en mayúsculas y sin explicaciones repetidas", () => {
  const cardTitle = /\.portal-card-title \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.doesNotMatch(cardTitle, /text-transform: uppercase/, "los títulos de sección siguen en mayúsculas");
  assertEqualsNoUppercase(css, ".portal-banner-title");
  // El formulario de decisión ya no repite el mismo aviso dos veces.
  const form = view.slice(view.indexOf('id="portal-action"'), view.indexOf("</form>", view.indexOf('id="portal-action"')));
  assert.equal((form.match(/portal-submit-state/g) ?? []).length, 1, "el estado del envío quedó duplicado");
});

function assertEqualsNoUppercase(cssText: string, selector: string) {
  const rule = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`).exec(cssText)?.[1] ?? "";
  assert.ok(rule, `falta la regla ${selector}`);
  assert.doesNotMatch(rule, /text-transform: uppercase/, `${selector} sigue en mayúsculas`);
}

test("post-autorización: éxito con próximos pasos y descarga", () => {
  assert.match(view, /portal-success-steps/, "falta la lista de próximos pasos");
  assert.match(view, /Estos son los próximos pasos:/, "el éxito no anuncia los próximos pasos");
  assert.match(view, /Descargar el presupuesto \(PDF\)/, "falta la descarga del presupuesto autorizado");
});

test("quote removal is an accessible compact icon after subtotal", () => {
  const rows = view.slice(view.indexOf("{budget.items.map((item) => {"));
  assert.ok(rows.indexOf('data-label="Subtotal"') < rows.indexOf('className="portal-item-action-cell"'), "action follows subtotal");
  assert.match(rows, /<AdminIcon name=\{current\.excluded \? "refresh" : "trash"\} size=\{18\} \/>/);
  assert.match(rows, /title=\{`\$\{current\.excluded \? "Restaurar" : "Retirar"\} \$\{item\.name\}`\}/);
  assert.match(view, /<span className="sr-only">Acción<\/span>/);
  assert.match(css, /\.portal-item-action \{[^}]*width: 40px;[^}]*height: 40px;/);
  assert.match(css, /\.portal-item-action:focus-visible/);
  assert.match(css, /\.portal-item-action \{ width: 44px; height: 44px; \}/);
});
