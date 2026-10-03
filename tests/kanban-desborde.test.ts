import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Desbordes de Presupuestos y del portal (issue #141, crítico 2): el Kanban
 * reparte el ancho y, si no entra, el scroll avisa y llega al final; el plan de
 * pagos del portal se lee como tarjetas con monto, estado y vencimiento
 * completos; y el plan de pagos del panel no desborda en mobile. Si vuelve una
 * columna cortada o un dato fuera de la vista, estos tests fallan.
 */
const root = process.cwd();
const css = readFileSync(join(root, "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const board = readFileSync(join(root, "components", "admin", "AdminBoard.tsx"), "utf8");
const view = readFileSync(join(root, "app", "(portal)", "_components", "PortalBudgetView.tsx"), "utf8");

test("el Kanban reparte el ancho y no se corta", () => {
  assert.match(css, /\.admin-board \{ display: flex; align-items: stretch; gap: 8px; width: 100%; \}/, "el tablero volvió a max-content");
  assert.match(
    css,
    /\.admin-board-col \{[^}]*flex: 1 1 var\(--a-board-col, 16\.5rem\)[^}]*min-width: 11rem/,
    "las columnas no se reparten el ancho o perdieron el piso legible",
  );
});

test("cuando hay columnas fuera de vista, el scroll avisa y llega al final", () => {
  assert.match(board, /const \[boardScroll, setBoardScroll\] = useState\(\{ more: false, start: false \}\)/, "falta el estado del scroll");
  assert.match(board, /new ResizeObserver\(update\)/, "el aviso no se recalcula con el tamaño");
  assert.match(board, /Deslizá para ver más columnas/, "falta el aviso de columnas");
  assert.match(css, /\.admin-board-wrap \{ [^}]*scrollbar-width: thin/, "el scroll del tablero sigue oculto");
  assert.match(css, /\.admin-board-wrap::-webkit-scrollbar \{ height: 8px; \}/, "falta la barra fina del tablero");
});

test("el plan de pagos del panel no desborda en mobile", () => {
  assert.match(
    css,
    /@media \(max-width: 720px\) \{\s*\.admin-plan-row \{ grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); \}/,
    "la fila del plan sigue con la grilla ancha en 390",
  );
});

test("el plan del portal muestra monto y vencimiento completos", () => {
  assert.match(view, /data-label="Vencimiento"/, "las cuotas no declaran su vencimiento");
  assert.match(view, /data-label="Monto"/, "las cuotas no declaran su monto");
  assert.match(
    css,
    /\.portal-table--plan:not\(\.portal-table--expected\) td::before \{ content: attr\(data-label\)/,
    "la ficha del plan no dibuja las etiquetas",
  );
});
