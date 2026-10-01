import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  analizarCarga,
  asignarExistentes,
  candidatosDeCliente,
  candidatosDeProducto,
  crearVerificador,
  estaEnTexto,
  fechaEnTexto,
  digitosEnTexto,
  mencionaEnTexto,
  normalizarAnalisis,
  similitudTexto,
  type ClienteCartera,
  type ProductoCartera,
} from "../lib/server/ia-carga";
import type { IaProvider } from "../lib/server/ia-carga";

/**
 * «Carga con IA» #126: matching con minúsculas y espacios, «a crédito N días»
 * como plazo (nunca referencia) y escalares inventados marcados. Los dos textos
 * del dueño se reproducen de punta a punta con un proveedor mockeado.
 */

const repoFile = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

/** Jueves 01-10-2026: referencia fija para fechas relativas y plazos. */
const HOY = "2026-10-01";

const TEXTO_A =
  "noe ces, 1 kiosco touch retiro ayer su evento es hoy devuelve manana 750.000gs a credito 7 dias";
const TEXTO_B =
  "noeces, 1 kiosco touch retiro ayer su evento es hoy devuelve manana 750.000gs a credito 7 dias";

const CARTERA_CLIENTES: ClienteCartera[] = [
  { id: "c1", nombre: "NoeCes BTL experence", empresa: null, ruc: null, telefono: null, imagenUrl: null },
];
const CARTERA_PRODUCTOS: ProductoCartera[] = [
  { id: "p1", nombre: "Kiosko Touch", sku: "P·03", categoria: "Tótems", imagenUrl: null },
];

/** Salida que el modelo devolvía en el reporte (incluye los defectos a corregir). */
const SALIDA_MODELO = {
  clientes: [{ nombre: "noe ces", ruc: "80012345-6", telefono: "+595 981 000 000" }],
  productos: [{ nombre: "kiosco touch", categoria: "Tótems", cantidad: 1 }],
  cobros: [{ cliente: "noe ces", monto: "750.000", fecha: "mañana", metodo: "credito", referencia: "7 días" }],
};

const proveedorFijo = (salida: unknown): IaProvider => ({
  id: "prueba",
  label: "Proveedor de prueba",
  async analizar() {
    return JSON.stringify(salida);
  },
});

const analizarTexto = async (texto: string) => {
  const analisis = await analizarCarga({
    texto,
    tipos: ["clientes", "productos", "cobros"],
    proveedor: proveedorFijo(SALIDA_MODELO),
    hoy: HOY,
  });
  return asignarExistentes(analisis, { clientes: CARTERA_CLIENTES, productos: CARTERA_PRODUCTOS });
};

// ── 1. Producto con minúsculas: «kiosco touch» → «Kiosko Touch» ────────────

test("el producto matchea con minúsculas y con un typo («kiosco» ↔ «kiosko»)", () => {
  assert.equal(similitudTexto("KIOSCO  TOUCH", "kiosco touch"), 100, "espacios/case no rompen");
  // El nombre real del inventario es «Kiosko Touch»: una letra cambiada no
  // puede dejar el producto sin candidatos.
  const typo = similitudTexto("kiosco touch", "Kiosko Touch");
  assert.ok(typo >= 90, `«kiosco touch» debe superar el umbral de vínculo (fue ${typo})`);
  const candidatos = candidatosDeProducto({ nombre: "kiosco touch" }, CARTERA_PRODUCTOS);
  assert.equal(candidatos[0].id, "p1");
  assert.ok(candidatos[0].confianza >= 90);
  assert.equal(similitudTexto("maria", "mario"), 85, "un nombre de una palabra con typo queda en banda sugerida");
});

test("la cartera vacía se diagnostica en la respuesta (no se crea a ciegas)", () => {
  const vacio = normalizarAnalisis({ productos: [{ nombre: "kiosco touch" }] }, ["productos"]);
  assert.deepEqual(vacio.cartera, { clientes: 0, productos: 0 });
  const conCartera = asignarExistentes(vacio, { clientes: CARTERA_CLIENTES, productos: [] });
  assert.deepEqual(conCartera.cartera, { clientes: 1, productos: 0 });
  const ui = repoFile("components/admin/AdminCargaIa.tsx");
  assert.match(ui, /No hay productos cargados en Inventario/, "el preview avisa cuando no hay cartera");
  assert.match(ui, /No hay clientes cargados en esta empresa/);
  const route = repoFile("app/api/admin/ia/carga/route.ts");
  assert.match(route, /analizarCarga\(\{ texto, tipos, proveedor: iaProviderDeConfig\(config\) \}\)/, "el texto entra al motor para verificar escalares");
});

// ── 2. Tolerancia a espacios: «noe ces» ≈ «noeces» ─────────────────────────

test("«noe ces» encuentra al candidato de «noeces» (sugerido, cambiable)", () => {
  assert.equal(similitudTexto("noe ces", "NoeCes BTL experence"), 84);
  assert.equal(similitudTexto("noeces", "NoeCes BTL experence"), 84, "el texto junto también queda en banda sugerida");
  const candidatos = candidatosDeCliente({ nombre: "noe ces" }, CARTERA_CLIENTES);
  assert.equal(candidatos[0].id, "c1");
  assert.equal(candidatos[0].confianza, 84);
  assert.ok(candidatos[0].confianza >= 60 && candidatos[0].confianza < 90, "banda de sugerencia (60–89 %)");
  // El otro sentido del test: sin el candidato, crear.
  assert.equal(candidatosDeCliente({ nombre: "noe ces" }, []).length, 0);
});

// ── 3. «a crédito 7 días»: plazo, nunca referencia ─────────────────────────

test("«a crédito 7 días» es plazo con vencimiento y no ensucia referencia ni fecha", async () => {
  const analisis = normalizarAnalisis({ cobros: SALIDA_MODELO.cobros }, ["cobros"], { hoy: HOY, texto: TEXTO_A });
  const cobro = analisis.cobros[0];
  assert.equal(cobro.plazo, true);
  assert.equal(cobro.vencimiento, "2026-10-08", "vencimiento = hoy + 7 días");
  assert.equal(cobro.referencia, null, "«7 días» jamás es la referencia");
  assert.equal(cobro.fecha, null, "la fecha de un pago a plazo no es la del cobro");
  assert.equal(cobro.metodo, null, "«credito» no es un método de pago");
  assert.equal(cobro.monto, 750_000);
  assert.ok(cobro.avisos.some((aviso) => aviso.includes("2026-10-08")));
});

test("un cobro normal no se confunde con un plazo", () => {
  const analisis = normalizarAnalisis(
    { cobros: [{ cliente: "NoeCes", monto: "500.000", fecha: "ayer", metodo: "transferencia", referencia: "TRF-9912" }] },
    ["cobros"],
    { hoy: HOY, texto: "NoeCes me pagó 500.000 ayer por transferencia TRF-9912" },
  );
  const cobro = analisis.cobros[0];
  assert.equal(cobro.plazo, false);
  assert.equal(cobro.vencimiento, null);
  assert.equal(cobro.fecha, "2026-09-30");
  assert.equal(cobro.referencia, "TRF-9912");
  assert.equal(cobro.metodo, "Transferencia");
  assert.deepEqual(cobro.inventados, []);
});

// ── 4. Escalares inventados ────────────────────────────────────────────────

test("los escalares que no están en el texto quedan marcados", () => {
  const verificador = crearVerificador(TEXTO_A);
  assert.equal(estaEnTexto("750.000", verificador), true);
  assert.equal(estaEnTexto("TRF-9912", verificador), false);
  assert.equal(digitosEnTexto("80012345-6", verificador), false);
  assert.equal(digitosEnTexto("+595 981 000 000", verificador), false);
  assert.equal(mencionaEnTexto("noe ces", verificador), true);
  assert.equal(mencionaEnTexto("NoeCes BTL experence", verificador), true, "el nombre del texto alcanza");
  assert.equal(mencionaEnTexto("Cliente Fantasma", verificador), false);
  assert.equal(fechaEnTexto("mañana", "2026-10-02", verificador, HOY), true, "«mañana» explica hoy+1");
  assert.equal(fechaEnTexto("2026-10-08", "2026-10-08", verificador, HOY), false, "«7 días» no explica cualquier fecha");
  assert.equal(fechaEnTexto("15/03/2027", "2027-03-15", verificador, HOY), false);

  const cliente = normalizarAnalisis({ clientes: SALIDA_MODELO.clientes }, ["clientes"], { hoy: HOY, texto: TEXTO_A }).clientes[0];
  assert.ok(cliente.inventados.some((campo) => campo.startsWith("RUC")), "el RUC inventado se marca");
  assert.ok(cliente.inventados.some((campo) => campo.startsWith("teléfono")), "el teléfono inventado se marca");
  assert.equal(cliente.inventados.some((campo) => campo.startsWith("nombre")), false, "el nombre sí está en el texto");

  const cobro = normalizarAnalisis({ cobros: SALIDA_MODELO.cobros }, ["cobros"], { hoy: HOY, texto: TEXTO_A }).cobros[0];
  assert.deepEqual(cobro.inventados, [], "el monto y el cliente del cobro están en el texto");

  const ui = repoFile("components/admin/AdminCargaIa.tsx");
  assert.match(ui, /No está en el texto:/);
  assert.match(ui, /Confirmo los datos marcados/);
  assert.match(ui, /fila\.inventados\.length > 0 && !fila\.confirmado|inventados\.length > 0 && !.*confirmado/, "lo marcado exige confirmación para aplicarse");
});

test("un RUC inventado no vincula a otro cliente", async () => {
  const cartera: ClienteCartera[] = [
    { id: "c1", nombre: "NoeCes BTL experence", empresa: null, ruc: null, telefono: null, imagenUrl: null },
    { id: "c2", nombre: "Constructora Sur SA", empresa: null, ruc: "80012345-6", telefono: null, imagenUrl: null },
  ];
  const analisis = await analizarCarga({
    texto: TEXTO_A,
    tipos: ["clientes"],
    proveedor: proveedorFijo({ clientes: SALIDA_MODELO.clientes }),
    hoy: HOY,
  });
  const resuelto = asignarExistentes(analisis, { clientes: cartera, productos: [] });
  assert.ok(resuelto.clientes[0].inventados.some((campo) => campo.startsWith("RUC")));
  assert.notEqual(resuelto.clientes[0].existenteId, "c2", "el RUC inventado no resuelve el match");
  assert.equal(resuelto.clientes[0].accion, "vincular", "el mejor candidato queda preseleccionado");
  assert.equal(resuelto.clientes[0].existenteId, "c1");
});

test("un SKU o categoría inventados no suman al match del producto", () => {
  const verificador = crearVerificador("1 kiosco touch para el evento");
  const producto = normalizarAnalisis(
    { productos: [{ nombre: "kiosco touch", sku: "KIO-32", categoria: "Tótems" }] },
    ["productos"],
    { hoy: HOY, texto: "1 kiosco touch para el evento" },
  ).productos[0];
  assert.ok(producto.inventados.some((campo) => campo.startsWith("SKU")));
  assert.ok(producto.inventados.some((campo) => campo.startsWith("categoría")));
  assert.equal(verificador.compacto.includes("kio32"), false);
  const resuelto = asignarExistentes({ ...normalizarAnalisis({}, []), productos: [producto] }, {
    clientes: [],
    productos: [
      { id: "p1", nombre: "Kiosko Touch", sku: "P·04", categoria: "Tótems", imagenUrl: null },
      { id: "p2", nombre: "Kiosko Touch 32\"", sku: "KIO-32", categoria: "Tótems", imagenUrl: null },
    ],
  });
  assert.notEqual(resuelto.productos[0].candidatos[0]?.id, "p2", "el SKU inventado no arrastra al 32\"");
});

// ── Typos de 1–2 letras y cadena cobro↔cliente (issue #127) ────────────────

test("un typo de una letra («noeses») encuentra a «NoeCes» y queda preseleccionado", () => {
  assert.equal(similitudTexto("noeses", "NoeCes BTL experence"), 78, "prefijo compacto con 1 letra de diferencia");
  assert.ok(similitudTexto("juan peres", "Juan Pérez") >= 90, "dos palabras con un typo: vínculo claro");
  const candidatos = candidatosDeCliente({ nombre: "noeses" }, CARTERA_CLIENTES);
  assert.equal(candidatos[0]?.id, "c1");
  assert.equal(candidatos[0]?.confianza, 78);
  const resuelto = asignarExistentes(
    normalizarAnalisis({ clientes: [{ nombre: "noeses" }] }, ["clientes"], { hoy: HOY, texto: "noeses me pagó 750.000" }),
    { clientes: CARTERA_CLIENTES, productos: [] },
  );
  assert.equal(resuelto.clientes[0].accion, "vincular", "sin estado bloqueante: llega preseleccionado");
  assert.equal(resuelto.clientes[0].existenteId, "c1");
  assert.ok(resuelto.clientes[0].avisos.some((aviso) => aviso.includes("Sugerido")));
});

test("el cobro adopta al cliente preseleccionado sin repetir la pregunta", async () => {
  const proveedor: IaProvider = proveedorFijo({
    clientes: [{ nombre: "noe ces" }],
    cobros: [{ cliente: "noe ces", monto: "750.000", fecha: "hoy" }],
  });
  const analisis = await analizarCarga({
    texto: "noe ces me pagó 750.000 hoy",
    tipos: ["clientes", "cobros"],
    proveedor,
    hoy: HOY,
  });
  const resuelto = asignarExistentes(analisis, { clientes: CARTERA_CLIENTES, productos: [] });
  assert.equal(resuelto.clientes[0].accion, "vincular");
  assert.equal(resuelto.cobros[0].clienteId, resuelto.clientes[0].existenteId, "el cobro adopta al cliente");
  assert.equal(resuelto.cobros[0].inventados.length, 0);
  assert.equal(resuelto.cobros[0].avisos.some((aviso) => aviso.toLowerCase().includes("elegí")), false, "sin doble pregunta");
});

// ── Los dos textos del dueño, de punta a punta ─────────────────────────────

test("texto A: producto vinculado, cliente elegible, cobro a plazo marcado", async () => {
  const resuelto = await analizarTexto(TEXTO_A);
  assert.equal(resuelto.productos[0].accion, "vincular", "«kiosco touch» vincula «Kiosko Touch»");
  assert.equal(resuelto.productos[0].existenteId, "p1");
  assert.ok((resuelto.productos[0].confianza ?? 0) >= 90, "el typo queda en banda de vínculo");
  assert.equal(resuelto.clientes[0].accion, "vincular", "«noe ces» llega con el candidato preseleccionado");
  assert.equal(resuelto.clientes[0].existenteId, "c1");
  assert.ok(resuelto.clientes[0].avisos.some((aviso) => aviso.includes("Sugerido")));
  assert.equal(resuelto.cobros[0].plazo, true);
  assert.equal(resuelto.cobros[0].vencimiento, "2026-10-08");
  assert.equal(resuelto.cobros[0].referencia, null);
  assert.deepEqual(resuelto.cartera, { clientes: 1, productos: 1 });
});

test("texto B: mismo resultado que A", async () => {
  const resuelto = await analizarTexto(TEXTO_B);
  assert.equal(resuelto.productos[0].accion, "vincular");
  assert.equal(resuelto.clientes[0].accion, "vincular");
  assert.equal(resuelto.clientes[0].existenteId, "c1");
  assert.equal(resuelto.cobros[0].plazo, true);
  assert.equal(resuelto.cobros[0].vencimiento, "2026-10-08");
});
