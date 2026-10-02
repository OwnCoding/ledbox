import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dividirMonto, hoyDelPanel, parteEsPendiente, sumaPartes } from "../lib/ia-carga";

/**
 * «Carga con IA» #128: preview editable completo (agregar/duplicar/quitar),
 * cobros divididos en partes (seña + saldo) y método/cuenta con las cuentas
 * reales de tesorería. Los helpers de división son puros; el resto se fija con
 * guardas de fuente sobre el diálogo.
 */

const repoFile = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("dividirMonto reparte entero y sin perder un guaraní", () => {
  assert.deepEqual(dividirMonto(750_000, 2), [375_000, 375_000]);
  assert.deepEqual(dividirMonto(100, 3), [34, 33, 33], "el resto se reparte de a 1");
  assert.deepEqual(dividirMonto(1, 2), [1, 0]);
  assert.deepEqual(dividirMonto(0, 2), [0, 0]);
  assert.deepEqual(dividirMonto(500_000, 1), [500_000]);
  assert.equal(sumaPartes(dividirMonto(759_999, 4)), 759_999, "la suma siempre cierra");
});

test("parteEsPendiente: las fechas futuras son saldo; hoy o pasadas se cobran", () => {
  const hoy = "2026-10-01";
  assert.equal(parteEsPendiente("2026-10-16", hoy), true);
  assert.equal(parteEsPendiente(hoy, hoy), false, "hoy se registra");
  assert.equal(parteEsPendiente("2026-09-30", hoy), false);
  assert.equal(parteEsPendiente("", hoy), false);
  assert.equal(parteEsPendiente(null, hoy), false);
  assert.equal(parteEsPendiente("no-es-fecha", hoy), false);
  assert.equal(hoyDelPanel(new Date("2026-10-01T12:00:00Z")), "2026-10-01");
  assert.equal(hoyDelPanel(new Date("2026-10-02T02:00:00Z")), "2026-10-01", "madrugada UTC sigue siendo el día anterior en Asunción");
});

test("el preview deja agregar, duplicar y quitar registros", () => {
  const ui = repoFile("components/admin/AdminCargaIa.tsx");
  for (const tipo of ["cliente", "evento", "producto", "cobro"]) {
    assert.match(ui, new RegExp(`aria-label="Agregar ${tipo}"`), `falta agregar ${tipo} a mano`);
  }
  assert.match(ui, /function agregarCobro/, "los registros nuevos salen de un constructor");
  assert.match(ui, /function duplicarRegistro/, "duplicar copia la fila con clave nueva");
  assert.match(ui, /icon="copy"[\s\S]*?duplicarRegistro/, "el botón de duplicar usa el helper");
  assert.match(ui, /icon="trash"/, "cada tarjeta se puede quitar");
  assert.doesNotMatch(ui, /confirm\(/, "quitar del preview no pide confirmación nativa");
});

test("editar precios de un ítem vinculado exige el switch explícito", () => {
  const ui = repoFile("components/admin/AdminCargaIa.tsx");
  assert.match(ui, /label="Actualizar los precios del producto"/);
  assert.match(ui, /actualizarPrecios && producto\.existenteId/, "el envío de precios depende del switch");
  assert.match(ui, /"\/api\/admin\/inventory"/, "los precios del ítem se actualizan con el endpoint real");
  assert.match(ui, /kind: "prices"/);
  assert.match(ui, /Editar precios del producto/, "el vinculado no pide precios: se editan con una acción explícita");
  assert.ok(
    ui.indexOf("Editar precios del producto") < ui.indexOf("<MoneyField") ||
      ui.indexOf("producto.actualizarPrecios ?") < ui.indexOf("<MoneyField"),
    "los precios maestros están colapsados detrás de la acción",
  );
});

test("dividir un cobro: partes con monto y fecha, seña ahora y saldo a plazo", () => {
  const ui = repoFile("components/admin/AdminCargaIa.tsx");
  assert.match(ui, /Dividir en 2 partes/);
  assert.match(ui, /Agregar parte/);
  assert.match(ui, /quitarParte/);
  assert.match(ui, /parteEsPendiente\(parte\.fecha, hoy\)/, "la fecha decide cobrado vs saldo");
  assert.match(ui, /status: "PENDING"/, "el saldo se registra como cobro a plazo");
  assert.match(ui, /dueAt: parte\.fecha/, "el vencimiento del saldo es la fecha de la parte");
  assert.match(ui, /las partes suman .* y el total es|Las partes suman/, "el preview avisa si las partes no cierran");
  assert.match(ui, /el saldo a plazo necesita método/, "sin método de plazo el lote lo avisa");
});

test("el método/cuenta usa las cuentas de tesorería de la empresa", () => {
  const ui = repoFile("components/admin/AdminCargaIa.tsx");
  assert.match(ui, /"\/api\/admin\/treasury"/, "las cuentas se piden al endpoint real");
  assert.match(ui, /label="Cuenta de la empresa"/);
  assert.match(ui, /treasuryAccountId: cuenta/, "el cobro viaja con la cuenta elegida");
  assert.match(ui, /No hay cuentas de tesorería: se registra sin cuenta\./, "nunca un desplegable vacío sin aviso");
  assert.match(ui, /cuenta\.banco \? `\$\{cuenta\.nombre\} · \$\{cuenta\.banco\}` : cuenta\.nombre/, "la opción muestra banco y nombre");
});
