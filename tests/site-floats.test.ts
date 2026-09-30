import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Flotantes del sitio (issue #95): «Tu pedido» y WhatsApp viven en **una sola
 * columna** abajo a la derecha —WhatsApp abajo, pedido arriba, a
 * `--float-gap`— y ninguno tapa al otro. Todo cuelga de `--wa-bottom`, así la
 * columna se mueve completa cuando aparece la barra fija. Las reglas viven en
 * `app/globals.css`; estas guardas frenan la vuelta a las posiciones sueltas
 * por estado que se superponían.
 */
const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
/** Sección FLOTANTES del sitio: ahí viven las variables de la columna. */
const floats = css.slice(css.indexOf("/* ─── FLOTANTES ───"), css.indexOf("/* ─── ANIM ───"));
const rule = (selector: string, source = css) => new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? "";

test("los dos flotantes salen de la misma base", () => {
  const cart = rule("\\.cart-trigger");
  assert.match(
    cart,
    /bottom:\s*calc\(var\(--wa-bottom\) \+ var\(--wa-size\) \+ var\(--float-gap\)\)/,
    "el pedido se apoya en la posición del WhatsApp (base + alto + separación)",
  );
  assert.match(rule("\\.wa-float"), /bottom:\s*var\(--wa-bottom\)/, "el WhatsApp usa la base de la columna");
  assert.match(rule("\\.wa-float"), /width:\s*var\(--wa-size\)/, "el WhatsApp toma el alto de la columna");
  assert.match(
    rule(":root", floats),
    /--wa-bottom:\s*calc\(24px \+ env\(safe-area-inset-bottom\)\)/,
    "la base respeta el safe-area",
  );
});

test("la barra fija mueve la columna completa, no una pieza suelta", () => {
  assert.match(rule("body\\.has-sticky"), /--wa-bottom:/, "has-sticky redefine la base de la columna");
  assert.doesNotMatch(css, /body\.has-sticky \.cart-trigger/, "sin posiciones sueltas por estado (antes movía solo el pedido)");
  assert.doesNotMatch(css, /body\.has-sticky \.wa-float\s*\{\s*bottom:/, "el WhatsApp no se posiciona por fuera de la columna");
  assert.doesNotMatch(css, /\.cart-trigger\.has-items\s*\{[^}]*bottom:/, "la posición del pedido no depende de tener ítems");
});

test("sin z-index que tape al otro y con área táctil de 44 px", () => {
  assert.match(rule("\\.wa-float"), /z-index:\s*30/, "el WhatsApp queda debajo del panel del pedido (40)");
  assert.match(rule("\\.cart-trigger"), /z-index:\s*30/, "el pedido comparte el mismo nivel");
  assert.doesNotMatch(rule("\\.wa-float"), /z-index:\s*200/, "sin el z-index viejo que tapaba al pedido");
  assert.match(rule("\\.cart-trigger"), /min-height:\s*44px/, "el botón del pedido llega a 44 px de alto");
});

test("mobile achica la columna sin cambiar el orden", () => {
  const mobile = /@media \(max-width:768px\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
  assert.match(mobile, /:root\s*\{[^}]*--wa-size:\s*50px/, "en mobile el WhatsApp mide 50 px");
  assert.match(mobile, /:root\s*\{[^}]*--float-right:\s*16px/, "y la columna se corre al borde de 16 px");
});
