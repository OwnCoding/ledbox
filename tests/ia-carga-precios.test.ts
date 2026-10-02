import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizarAnalisis } from "../lib/server/ia-carga";

/**
 * «Carga con IA» #136: el monto del alquiler no es un precio de catálogo del
 * producto (solo se toman precios de lista/mayorista/mínimo cuando el texto los
 * define) y el producto vinculado no pide precios: la edición de los maestros
 * queda detrás de «Editar precios del producto».
 */

const repoFile = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("un monto de alquiler no se mapea a los precios del producto", () => {
  const analisis = normalizarAnalisis(
    {
      productos: [{ nombre: "Kiosko Touch", precioLista: "750000", precioMayorista: "750000", precioMinimo: "750000" }],
      cobros: [{ cliente: "NoeCes", monto: "750.000", metodo: "efectivo" }],
    },
    ["productos", "cobros"],
    { hoy: "2026-10-01", texto: "NoeCes alquiló 1 kiosco touch por 750.000 en efectivo" },
  );
  const producto = analisis.productos[0];
  assert.equal(producto.precioLista, null, "el monto del alquiler no es precio de lista");
  assert.equal(producto.precioMayorista, null);
  assert.equal(producto.precioMinimo, null);
  assert.ok(producto.avisos.some((aviso) => aviso.includes("no los define") && aviso.includes("solo en el cobro")), "un aviso por producto");
  assert.equal(analisis.cobros[0].monto, 750_000, "el monto vive en el cobro, una sola vez");
});

test("los precios de catálogo explícitos sí se toman", () => {
  const analisis = normalizarAnalisis(
    { productos: [{ nombre: "Kiosko Touch", precioLista: "1500000", precioMayorista: "1300000", precioMinimo: "1200000" }] },
    ["productos"],
    {
      hoy: "2026-10-01",
      texto: "Kiosko Touch: precio de lista 1.500.000, precio mayorista 1.300.000, precio mínimo 1.200.000",
    },
  );
  const producto = analisis.productos[0];
  assert.equal(producto.precioLista, 1_500_000);
  assert.equal(producto.precioMayorista, 1_300_000);
  assert.equal(producto.precioMinimo, 1_200_000);
  assert.equal(producto.avisos.some((aviso) => aviso.includes("precio de catálogo")), false);
});

test("solo el frente que el texto define se conserva", () => {
  const analisis = normalizarAnalisis(
    { productos: [{ nombre: "Kiosko Touch", precioLista: "1500000", precioMinimo: "900000" }] },
    ["productos"],
    { hoy: "2026-10-01", texto: "Kiosko Touch con precio de lista 1.500.000" },
  );
  const producto = analisis.productos[0];
  assert.equal(producto.precioLista, 1_500_000);
  assert.equal(producto.precioMinimo, null, "sin «mínimo/piso» en el texto, no se toma");
});

test("el prompt separa alquiler de precios de catálogo", () => {
  const lib = repoFile("lib/server/ia-carga.ts");
  assert.match(lib, /CUES_PRECIO/);
  assert.match(lib, /los montos de alquiler, seña o cobro van en `cobros` y nunca en los precios del producto/);
});

test("el producto vinculado no pide precios: quedan detrás de una acción explícita", () => {
  const ui = repoFile("components/admin/AdminCargaIa.tsx");
  assert.match(ui, /Editar precios del producto/, "la acción explícita existe");
  assert.match(ui, /producto\.actualizarPrecios \? \(/, "los precios se dibujan solo al expandir");
  const boton = ui.indexOf("Editar precios del producto");
  const switchPrecios = ui.indexOf('label="Actualizar los precios del producto"');
  assert.ok(switchPrecios > 0 && switchPrecios < boton, "el switch de actualización vive en la rama expandida");
  assert.match(ui, /Al desactivarlo, el ítem del inventario no se toca\./);
});
