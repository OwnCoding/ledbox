import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { IA_MATCH_CLARO, IA_MATCH_DUDOSO } from "../lib/ia-carga";
import {
  asignarExistentes,
  candidatosDeCliente,
  candidatosDeProducto,
  normalizarAnalisis,
  type ClienteCartera,
  type ProductoCartera,
} from "../lib/server/ia-carga";

/**
 * «Carga con IA» #125/#127: preselección por confianza (cualquier candidato
 * ≥ 60 % queda vincular preseleccionado, con aviso «Sugerido» en 60–89 %; sin
 * candidatos se crea — siempre con override), imágenes en el preview y el cobro
 * que acompaña al cliente resuelto. Carteras de prueba (sin red).
 */

const repoFile = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const CARTERA_CLIENTES: ClienteCartera[] = [
  { id: "c1", nombre: "Constructora Sur SA", empresa: "Constructora Sur", ruc: "80012345-6", telefono: "+595 981123456", imagenUrl: "/api/admin/clients/c1/logo" },
  { id: "c2", nombre: "María González", empresa: null, ruc: null, telefono: null, imagenUrl: null },
  { id: "c3", nombre: "María González Pérez", empresa: null, ruc: null, telefono: null, imagenUrl: null },
  { id: "c4", nombre: "Juan Pérez", empresa: null, ruc: null, telefono: null, imagenUrl: null },
];

const CARTERA_PRODUCTOS: ProductoCartera[] = [
  { id: "p1", nombre: "Pantalla LED 3x2", sku: "PL-001", categoria: "Pantallas", imagenUrl: "/api/inventory-images/p1" },
  { id: "p2", nombre: "Tótem táctil", sku: null, categoria: "Tótems", imagenUrl: null },
];

const analisisCon = (datos: unknown, tipos: Parameters<typeof normalizarAnalisis>[1]) => normalizarAnalisis(datos, tipos);
const asignar = (datos: unknown, tipos: Parameters<typeof normalizarAnalisis>[1]) =>
  asignarExistentes(analisisCon(datos, tipos), { clientes: CARTERA_CLIENTES, productos: CARTERA_PRODUCTOS });

// ── Umbrales de confianza (issue #125 §2) ──────────────────────────────────

test("los umbrales quedan en 90 % (vínculo claro) y 60 % (candidato)", () => {
  assert.equal(IA_MATCH_CLARO, 90);
  assert.equal(IA_MATCH_DUDOSO, 60);
});

test("≥ 90 %: «Vincular» preseleccionado con el mejor candidato", () => {
  const exacto = asignar({ clientes: [{ nombre: "Constructora Sur SA" }] }, ["clientes"]);
  assert.equal(exacto.clientes[0].accion, "vincular");
  assert.equal(exacto.clientes[0].existenteId, "c1");
  assert.equal(exacto.clientes[0].confianza, 100);

  const contenido = asignar({ clientes: [{ nombre: "constructora sur" }] }, ["clientes"]);
  assert.equal(contenido.clientes[0].accion, "vincular", "92 % también preselecciona vincular");
  assert.equal(contenido.clientes[0].existenteId, "c1");

  const producto = asignar({ productos: [{ nombre: "pantalla led", sku: "pl-001" }] }, ["productos"]);
  assert.equal(producto.productos[0].accion, "vincular");
  assert.equal(producto.productos[0].existenteId, "p1");
});

test("60–89 %: el mejor candidato queda preseleccionado con aviso", () => {
  const dudoso = asignar({ clientes: [{ nombre: "Pérez" }] }, ["clientes"]);
  assert.equal(dudoso.clientes[0].accion, "vincular", "preselección (issue #127)");
  assert.equal(dudoso.clientes[0].existenteId, "c4", "el mejor candidato queda elegido");
  assert.equal(dudoso.clientes[0].candidatos[0].confianza, 78);
  assert.ok(dudoso.clientes[0].avisos.some((aviso) => aviso.includes("Sugerido") && aviso.includes("78 %")));

  const producto = asignar({ productos: [{ nombre: "constructora del sur", categoria: "Pantallas" }] }, ["productos"]);
  assert.equal(producto.productos[0].accion, "crear", "sin candidatos de producto se crea");

  const productoDudoso = asignar({ productos: [{ nombre: "Pantalla LED", categoria: null }] }, ["productos"]);
  assert.equal(productoDudoso.productos[0].accion, "vincular", "«Pantalla LED» es subcadena de dos tokens: 92 %");

  const ambiguo = asignar({ clientes: [{ nombre: "María González" }] }, ["clientes"]);
  assert.equal(ambiguo.clientes[0].accion, "vincular", "el exacto queda preseleccionado");
  assert.ok(ambiguo.clientes[0].candidatos.length >= 2, "los demás quedan para cambiar");
});

test("< 60 %: «Crear nuevo» preseleccionado", () => {
  const nuevo = asignar({ clientes: [{ nombre: "Municipalidad de Encarnación" }] }, ["clientes"]);
  assert.equal(nuevo.clientes[0].accion, "crear");
  assert.equal(nuevo.clientes[0].candidatos.length, 0);
  const producto = asignar({ productos: [{ nombre: "Micrófono inalámbrico" }] }, ["productos"]);
  assert.equal(producto.productos[0].accion, "crear");
});

// ── Imágenes en el preview (issue #125 §1) ─────────────────────────────────

test("los candidatos viajan con su imagen (logo del cliente y foto del ítem)", () => {
  const cliente = candidatosDeCliente({ nombre: "Constructora Sur" }, CARTERA_CLIENTES);
  assert.equal(cliente[0].imagenUrl, "/api/admin/clients/c1/logo");
  assert.equal(cliente[0].confianza, 92);

  const sinLogo = candidatosDeCliente({ nombre: "María González" }, CARTERA_CLIENTES);
  assert.ok(sinLogo.length >= 2);
  assert.equal(sinLogo[0].imagenUrl, null, "sin logo queda el monograma");

  const producto = candidatosDeProducto({ nombre: "pantalla", sku: "PL-001" }, CARTERA_PRODUCTOS);
  assert.equal(producto[0].imagenUrl, "/api/inventory-images/p1");
  assert.equal(producto[0].detalle, "SKU PL-001");
});

test("la ruta arma la cartera con logo de cliente y foto de inventario", () => {
  const route = repoFile("app/api/admin/ia/carga/route.ts");
  assert.match(route, /clientLogoUrl\(cliente\.id, cliente\.logo\.updatedAt\)/);
  assert.match(route, /inventoryImageUrl\(\{/);
  assert.match(route, /logo: \{ select: \{ updatedAt: true \} \}/);
  assert.match(route, /imageMime: true/);
  const ui = repoFile("components/admin/AdminCargaIa.tsx");
  assert.match(ui, /<AdminAvatar/, "el cliente muestra logo o monograma");
  assert.match(ui, /<AdminImageBox/, "el producto muestra la miniatura con fallback");
});

// ── Cobro ligado al cliente resuelto (issue #125 §3) ───────────────────────

test("el cobro acompaña al cliente vinculado aunque su nombre suelto no alcance", () => {
  // El cliente del texto trae RUC y se vincula; el cobro solo dice «Sur».
  const resuelto = asignar(
    {
      clientes: [{ nombre: "Sur", ruc: "80012345-6" }],
      cobros: [{ cliente: "Sur", monto: "500.000" }],
      eventos: [{ nombre: "Fiesta", cliente: "Sur" }],
    },
    ["clientes", "cobros", "eventos"],
  );
  assert.equal(resuelto.clientes[0].accion, "vincular");
  assert.equal(resuelto.clientes[0].existenteId, "c1");
  assert.equal(resuelto.cobros[0].clienteId, "c1", "el cobro se encadena al cliente resuelto");
  assert.equal(resuelto.eventos[0].clienteId, "c1");
});

test("sin cliente resuelto, el cobro sigue pendiente de elegir", () => {
  const resuelto = asignar({ cobros: [{ cliente: "Fantasma", monto: "500.000" }] }, ["cobros"]);
  assert.equal(resuelto.cobros[0].clienteId, null);
  assert.ok(resuelto.cobros[0].avisos.some((aviso) => aviso.includes("No encontramos")));
});

test("el diálogo encadena el cobro al elegir el cliente y no bloquea por acción", () => {
  const ui = repoFile("components/admin/AdminCargaIa.tsx");
  assert.match(ui, /function encadenarCliente/, "al vincular un cliente se encadena el cobro/evento");
  assert.match(ui, /encadenarCliente\(cliente\.nombre, id\)/);
  assert.match(ui, /const pendientes =/, "solo los escalares marcados bloquean «Aplicar todo»");
  assert.match(ui, /pendientes > 0/, "el botón queda deshabilitado hasta confirmar lo marcado");
  assert.doesNotMatch(ui, /— Elegí: «/, "sin estado bloqueante: el candidato llega preseleccionado (issue #127)");
});
