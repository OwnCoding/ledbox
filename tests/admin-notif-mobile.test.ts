import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Avisos del topbar en móvil (issue #150): el panel de la campana se monta con
 * portal en `#admin-root` —fuera del topbar, que con `backdrop-filter` era su
 * bloque contenedor y volvía el aviso ilegible—, se ancla con las medidas de la
 * campana, ocupa el ancho visible en ≤560 px, cierra con Escape, al tocar afuera
 * y al salir el foco, y sus targets reales llegan a 44 px.
 */
const root = process.cwd();
const css = readFileSync(join(root, "app", "globals.css"), "utf8");
const shell = readFileSync(join(root, "components", "admin", "AdminShell.tsx"), "utf8");

test("el panel de avisos se portal a la raíz del panel, no dentro del topbar", () => {
  assert.match(shell, /import \{ createPortal \} from "react-dom";/, "falta createPortal");
  assert.match(shell, /ADMIN_ROOT_ID/, "no usa la raíz del panel");
  assert.match(shell, /document\.getElementById\(ADMIN_ROOT_ID\) \?\? document\.body/, "el portal no apunta a la raíz del panel");
  assert.match(shell, /--admin-notif-top|admin-notif-top/, "el panel no se ancla con la medida de la campana");
  assert.match(shell, /measureAnchor/, "no mide el ancla de la campana");
});

test("el panel es fixed, con z-index propio y sin montarse sobre el contenido", () => {
  const start = css.indexOf(".admin-notif-panel {");
  const block = css.slice(start, css.indexOf("}", start));
  assert.match(block, /position: fixed;/, "el panel no es fixed");
  assert.match(block, /z-index: 30;/, "el panel no tiene z-index propio");
  assert.match(block, /top: var\(--admin-notif-top/, "no se ancla debajo de la campana");
  assert.match(block, /right: var\(--admin-notif-right/, "no se ancla al borde de la campana");
  const mobile = css.slice(css.indexOf("@media (max-width: 560px)"));
  assert.match(mobile, /\.admin-notif-panel \{ top: calc\(var\(--a-topbar\) \+ 6px\); left: 10px; right: 10px; width: auto;/, "en móvil no ocupa el ancho visible");
});

test("los targets de los avisos llegan a 44 px reales", () => {
  // La campana dibuja 34 px; el ::after crece 6 px por lado sobre el padding box
  // (32) y el borde de 1 px no cuenta: el área operable es 44 × 44.
  assert.match(css, /\.admin-notif-toggle::after \{ content: ""; position: absolute; inset: -6px; \}/, "la campana no llega a 44 px operables");
  const mobile = css.slice(css.indexOf("@media (max-width: 560px)"));
  assert.match(mobile, /\.admin-notif-item \.admin-notif-main \{ grid-area: main; align-content: center; min-height: 44px; \}/, "el cuerpo del aviso no llega a 44 px");
  assert.match(mobile, /\.admin-notif-item > \.admin-iconbtn \{[^}]*width: 44px; height: 44px;/, "la acción de WhatsApp no llega a 44 px");
  assert.match(mobile, /\.admin-notif-item \.admin-notif-main::after \{ content: ""; position: absolute; inset: 0; \}/, "el aviso no es clickeable en toda su superficie");
});

test("cierra con Escape, al tocar afuera y al salir el foco", () => {
  assert.match(shell, /function closeOnEscape/, "no cierra con Escape");
  assert.match(shell, /function closeOnOutside/, "no cierra al tocar afuera");
  assert.match(shell, /function closeOnFocusAway/, "no cierra al salir el foco");
  assert.match(shell, /document\.addEventListener\("keydown", closeOnEscape\)/, "falta el listener de Escape");
  assert.match(shell, /document\.addEventListener\("pointerdown", closeOnOutside\)/, "falta el listener de puntero");
  assert.match(shell, /document\.addEventListener\("focusin", closeOnFocusAway\)/, "falta el listener de foco");
});

test("el foco entra al panel al abrirlo y el contenedor no dibuja anillo", () => {
  assert.match(shell, /tabIndex=\{-1\}/, "el panel no es enfocable para teclado");
  assert.match(shell, /node\.focus\(\{ preventScroll: true \}\)/, "el foco no entra al panel");
  assert.match(css, /\.admin-notif-panel:focus, \.admin-notif-panel:focus-visible \{ outline: none; \}/, "el contenedor dibuja un anillo que no corresponde");
});
