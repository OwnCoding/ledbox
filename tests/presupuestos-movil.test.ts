import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Presupuestos en la auditoría UX (issue #143): filtros/pestañas de estado
 * encima del Kanban (y tarjetas en ancho compacto, sin tablero horizontal),
 * prioridad visual a monto, vencimiento, cliente y próximo paso, impresión,
 * firma y portal unificados en un menú, y solicitudes del portal como
 * conversación comparativa original vs propuesta. Si alguna vuelve atrás, estos
 * tests fallan.
 */
const root = process.cwd();
const module = readFileSync(join(root, "components/admin/modules/PresupuestosModule.tsx"), "utf8");
const ui = readFileSync(join(root, "components/admin/AdminUI.tsx"), "utf8");
const css = readFileSync(join(root, "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

test("el kit expone el menú de acciones de fila", () => {
  assert.match(ui, /export function AdminActionsMenu/);
  assert.match(ui, /export type AdminMenuItem/);
  assert.match(css, /\.admin-menu-pop \{ position: fixed/, "el panel del menú escapa del scroll de la tabla");
  assert.match(css, /\.admin-menu-item:hover/, "los ítems del menú tienen estado");
});

test("Presupuestos usa el ancho compacto sin tablero en móvil", () => {
  assert.match(module, /const narrow = useAdminNarrowViewport\(\)/);
  assert.match(module, /narrow \? null : <AdminViewSwitch/, "el conmutador no aporta nada en ancho compacto");
  assert.match(module, /<AdminCardGrid label="Presupuestos" cards=\{budgetCards\}/, "faltan las tarjetas del ancho compacto");
  // El tablero (kanban) solo se dibuja fuera del ancho compacto.
  assert.match(module, /\) : view === "board" \? \(/);
});

test("los filtros de estado van encima del tablero y de la lista", () => {
  const chips = module.indexOf('aria-label="Filtrar presupuestos por estado"');
  const dataState = module.indexOf("<AdminDataState", chips);
  assert.ok(chips > 0, "faltan las pestañas/filtros de estado");
  assert.ok(dataState > chips, "las pestañas tienen que ir antes de la lista y del tablero");
  assert.match(module, /const boardRows = useMemo/, "el tablero no tiene su fila filtrada");
  assert.match(module, /useAdminBoardMove\(\{ rows: boardRows/, "el tablero no usa el filtro de estado");
  assert.match(module, /statusCounts\.get\(option\.value\)/, "las pestañas no muestran el conteo por estado");
});

test("prioridad visual: monto, vencimiento, cliente y próximo paso", () => {
  assert.match(module, /function budgetNextStep/, "falta el próximo paso del presupuesto");
  const table = module.slice(module.indexOf('view="presupuestos"'), module.indexOf("</AdminTable>", module.indexOf('view="presupuestos"')));
  const order = ["Presupuesto", "Cliente", "Total", "Vence", "Estado / próximo paso"];
  let last = -1;
  for (const label of order) {
    const index = table.indexOf(`label: "${label}"`);
    assert.ok(index > last, `${label} fuera de orden en las columnas`);
    last = index;
  }
  assert.match(module, /const next = budgetNextStep\(budget\)/);
  assert.match(module, /Próximo paso: \$\{next\.label\}/, "la fila no muestra el próximo paso");
});

test("acciones unificadas: impresión, firma y portal en un menú", () => {
  assert.match(module, /function budgetMenuItems/, "falta el menú de acciones del presupuesto");
  assert.match(module, /label: "Imprimir"[\s\S]{0,200}icon: "print"/, "la impresión va en el menú");
  assert.match(module, /label: "Firma del cliente"/, "la firma va en el menú");
  assert.match(module, /label: budget\.publicToken \? "Portal del cliente" : "Generar link del portal"/, "el portal va en el menú");
  assert.match(module, /<AdminActionsMenu label=\{`Acciones del presupuesto/, "la fila no usa el menú");
});

test("solicitudes del portal como conversación comparativa", () => {
  assert.match(module, /function RequestComparison/, "falta la comparación original vs propuesta");
  assert.match(module, /Comparación: original vs propuesta del cliente/);
  assert.match(module, /<span role="columnheader">Original<\/span>/, "falta la columna original");
  assert.match(module, /<span role="columnheader">Propuesta del cliente<\/span>/, "falta la columna propuesta");
  assert.match(module, /setTalkRequest\(request\)/, "las solicitudes no abren la conversación");
  assert.match(module, /title=\{`Conversación · \$\{talkRequest\.budget\.title\}`\}/, "falta el diálogo de conversación");
  assert.match(module, /admin-request-message--team/, "la respuesta del equipo va en la conversación");
});
