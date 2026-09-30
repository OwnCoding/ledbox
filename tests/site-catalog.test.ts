import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { logoSize } from "../lib/brand-logos";
import { products } from "../lib/catalog";

/**
 * Marco único del catálogo (issue #97): las siete tarjetas comparten la misma
 * caja de 4:3 —con la foto completa adentro (`contain`, sin recortes) y el
 * marco pintado del blanco del render— así la grilla alinea nombre, descripción,
 * precio y botones. Además, las medidas declaradas en `lib/catalog.ts` tienen
 * que ser las reales de los PNG: son las que reservan la caja y evitan saltos.
 */
/** Los comentarios del CSS citan la regla vieja: se ignoran al comparar. */
const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (selector: string) => new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";

test("todas las tarjetas comparten el mismo marco", () => {
  const frame = rule("\\.prod-art");
  assert.match(frame, /aspect-ratio:\s*4\s*\/\s*3/, "la caja es 4:3 para todas las fotos");
  assert.match(frame, /background:\s*#fff/, "el marco se pinta del blanco del render (lienzo común)");
  assert.doesNotMatch(css, /\.prod-art\[data-art/, "sin excepciones por orientación (se retiró en #97)");
  assert.match(rule("\\.prod-art img"), /object-fit:\s*contain/, "la foto entra completa");
  assert.doesNotMatch(css, /\.prod-art img\s*\{[^}]*object-fit:\s*cover/, "sin recortes");
});

test("la tarjeta ya no marca la orientación de la foto", () => {
  const card = readFileSync(join(process.cwd(), "components", "catalog", "ProductCard.tsx"), "utf8");
  assert.doesNotMatch(card, /data-art/, "el marco no depende de la orientación del render");
});

test("las medidas declaradas son las reales de los PNG del catálogo", () => {
  assert.ok(products.length >= 7, "el catálogo conserva sus productos");
  for (const product of products) {
    const file = join(process.cwd(), "public", product.image.replace(/^\//, ""));
    const size = logoSize(readFileSync(file), "png");
    assert.ok(size, `${product.id}: no se pudo leer ${product.image}`);
    assert.deepEqual(
      { width: size.width, height: size.height },
      { width: product.width, height: product.height },
      `${product.id}: las medidas declaradas no coinciden con ${product.image}`,
    );
  }
});
