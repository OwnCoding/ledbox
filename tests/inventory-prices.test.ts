import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Precios de venta del inventario (issue #90): lista, mayorista (con su umbral
 * de días) y mínimo. La migración es aditiva, idempotente y re-ejecutable y no
 * carga valores de arranque; el alta y la edición validan con las reglas puras
 * de `lib/field-rules.ts` y la UI los muestra en lista, tarjetas y detalle.
 */

const repoFile = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const PRICE_COLUMNS = ["listPrice", "wholesalePrice", "minimumPrice", "wholesaleFromDays"] as const;

test("la migración de precios es aditiva, re-ejecutable y sin valores de arranque", () => {
  const sql = repoFile("prisma/migrations/202609300002_inventory_sale_prices/migration.sql");
  for (const column of PRICE_COLUMNS) {
    assert.match(
      sql,
      new RegExp(`ADD COLUMN IF NOT EXISTS "${column}" INTEGER NOT NULL DEFAULT 0`),
      `${column}: falta la columna idempotente con default 0`,
    );
  }
  // Sin provisión: los precios los carga el dueño, no salen de la landing.
  assert.equal(/\bINSERT\b/i.test(sql), false);
  assert.equal(/UPDATE\b/i.test(sql), false);
});

test("el schema define los cuatro precios con default 0", () => {
  const schema = repoFile("prisma/schema.prisma");
  const model = schema.match(/model InventoryItem \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(model.length > 0, "no se encontró el modelo InventoryItem");
  for (const column of PRICE_COLUMNS) {
    assert.match(model, new RegExp(`${column}\\s+Int\\s+@default\\(0\\)`), `${column}: falta el campo con default 0`);
  }
});

test("el contrato del panel tipa los precios y las rutas los validan", () => {
  const types = repoFile("lib/admin-types.ts");
  for (const column of PRICE_COLUMNS) {
    assert.match(types, new RegExp(`${column}: number`), `${column}: falta en AdminInventoryRow`);
  }
  const create = repoFile("app/api/admin/resources/route.ts");
  assert.match(create, /inventoryPriceValue\(body\.listPrice\)/);
  assert.match(create, /inventoryWholesaleDaysValue\(body\.wholesaleFromDays\)/);
  assert.match(create, /inventoryPriceWarning\(inventory\)/);
  const update = repoFile("app/api/admin/inventory/route.ts");
  assert.match(update, /kind === "prices"/);
  assert.match(update, /inventoryPriceWarning\(inventory\)/);
});

test("el módulo Inventario muestra y edita los tres precios", () => {
  const module = repoFile("components/admin/modules/InventarioModule.tsx");
  assert.match(module, /label: "Precios", end: true/);
  for (const label of ["Precio de lista", "Mayorista", "Mayorista desde (días)", "Mínimo"]) {
    assert.ok(module.includes(`label="${label}"`), `falta el campo «${label}»`);
  }
  assert.match(module, /Editar precios: \$\{item\.name\}/);
  assert.match(module, /submitPrices/);
  // El aviso de coherencia se ve en el formulario y en el detalle.
  assert.match(module, /formPriceWarning/);
  assert.match(module, /selectedPriceWarning/);
});
