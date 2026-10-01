"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizarBusqueda } from "owncoding-ui/utils";
import { adminApiGet, adminSend, requestAdminRefresh } from "@/lib/admin-api";
import { ADMIN_ROOT_ID } from "@/lib/admin-theme";
import { publicConfig } from "@/lib/public-config";
import { PAYMENT_METHODS } from "@/lib/admin-types";
import { canWriteFinance } from "@/lib/admin-policy";
import {
  IA_TEXTO_MAX,
  IA_TIPOS,
  IA_TIPO_LABEL,
  esAccionPendiente,
  type IaAnalisis,
  type IaCandidato,
  type IaTipo,
} from "@/lib/ia-carga";
import type { AdminRole } from "@/lib/admin-types";
import type { IaAccionExistente } from "@/lib/ia-carga";
import {
  DateField,
  EmailField,
  MoneyField,
  NumberField,
  PhoneField,
  RucField,
  SelectField,
  SwitchField,
  TextAreaField,
  TextField,
} from "./AdminFields";
import { AdminButton, AdminDialog, AdminEmpty, AdminNote } from "./AdminUI";
import { AdminAvatar } from "./AdminAvatar";
import { AdminImageBox } from "./AdminImageBox";

/**
 * «Carga con IA» (issues #120 y #122): el diálogo de pegado, revisión y
 * aplicación.
 *
 * El panel aplica con los **endpoints existentes** (clientes, eventos,
 * productos y el cobro de Finanzas): mismos permisos, mismo aislamiento por
 * empresa y misma auditoría. El análisis server-side no escribe nada y el
 * texto pegado no se persiste (docs/PRIVACIDAD.md T10).
 *
 * #122: cada registro detectado se compara contra lo existente y la persona
 * elige **vincular** o **crear**; los cobros («me pagó X») se registran con
 * `finance.write` y las fechas y montos llegan resueltos y visibles.
 */

type ConfigIa = { configurada: boolean; modelo: string | null; tipos: IaTipo[] };

type ClienteEdit = {
  clave: string;
  incluir: boolean;
  accion: IaAccionExistente;
  existenteId: string;
  existenteNombre: string | null;
  confianza: number | null;
  candidatos: IaCandidato[];
  /** Campos que no están en el texto (issue #126): exigen confirmación. */
  inventados: string[];
  confirmado: boolean;
  nombre: string;
  empresa: string;
  tipo: "FINAL" | "RESELLER";
  ruc: string;
  telefono: string;
  correo: string;
  avisos: string[];
};

type EventoEdit = {
  clave: string;
  incluir: boolean;
  nombre: string;
  clienteNombre: string | null;
  clienteId: string;
  candidatos: IaCandidato[];
  inventados: string[];
  confirmado: boolean;
  inicio: string;
  fin: string;
  lugar: string;
  ciudad: string;
  avisos: string[];
};

type ProductoEdit = {
  clave: string;
  incluir: boolean;
  accion: IaAccionExistente;
  existenteId: string;
  existenteNombre: string | null;
  confianza: number | null;
  candidatos: IaCandidato[];
  inventados: string[];
  confirmado: boolean;
  nombre: string;
  categoria: string;
  cantidad: string;
  precioLista: string;
  precioMayorista: string;
  precioMinimo: string;
  avisos: string[];
};

type CobroEdit = {
  clave: string;
  incluir: boolean;
  clienteId: string;
  clienteNombre: string | null;
  candidatos: IaCandidato[];
  monto: string;
  montoTexto: string | null;
  fecha: string | null;
  fechaTexto: string | null;
  metodo: string;
  referencia: string;
  /** A crédito/plazo (issue #126): no se registra; `vencimiento` estimado. */
  plazo: boolean;
  vencimiento: string | null;
  inventados: string[];
  confirmado: boolean;
  avisos: string[];
};

type ClienteOpcion = { value: string; label: string };

type Resultado = {
  creados: { clientes: number; eventos: number; productos: number; cobros: number };
  vinculados: { clientes: number; productos: number };
  errores: string[];
  advertencias: string[];
};

const TIPO_CLIENTE: Array<{ value: string; label: string }> = [
  { value: "FINAL", label: "Cliente final" },
  { value: "RESELLER", label: "Mayorista" },
];

const METODO_PAGO: Array<{ value: string; label: string }> = [
  { value: "", label: "— Sin especificar —" },
  ...PAYMENT_METHODS.map((metodo) => ({ value: metodo, label: metodo })),
];

const aTexto = (valor: number | null | undefined) => (valor === null || valor === undefined ? "" : String(valor));

const aNumero = (valor: string): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : 0;
};

const listar = (cantidad: number, singular: string, plural: string) => `${cantidad} ${cantidad === 1 ? singular : plural}`;

/** Avisos del evento/cobro sin los de «elegí el cliente» cuando ya está resuelto. */
const avisosVigentes = (avisos: string[], clienteId: string): string[] =>
  clienteId ? avisos.filter((aviso) => !/(coincide con varios|Encontramos)/.test(aviso)) : avisos;

/** Opciones de acción+existente en un solo select: `crear`, `vincular:<id>` o la sugerencia. */
function opcionesDeAccion(candidatos: IaCandidato[], sugerencia = false): ClienteOpcion[] {
  const opciones: ClienteOpcion[] = [];
  const [top] = candidatos;
  if (sugerencia && top) {
    opciones.push({ value: "", label: `— Elegí: «${top.nombre}» (${top.confianza} %) —` });
  }
  opciones.push({ value: "crear", label: "Crear nuevo" });
  const vistos = new Set<string>();
  for (const candidato of candidatos) {
    if (vistos.has(candidato.id)) continue;
    vistos.add(candidato.id);
    opciones.push({ value: `vincular:${candidato.id}`, label: `Vincular a «${candidato.nombre}» (${candidato.confianza} %)` });
  }
  return opciones;
}

const seleccionDeAccion = (fila: { accion: IaAccionExistente; existenteId: string }) => {
  if (fila.accion === "vincular" && fila.existenteId) return `vincular:${fila.existenteId}`;
  if (fila.accion === "elegir") return "";
  return "crear";
};

/** Imagen del candidato elegido (o del sugerido cuando hay que elegir). */
function imagenDeCandidato(
  fila: { accion: IaAccionExistente; existenteId: string; candidatos: IaCandidato[] },
): string | null {
  const id = fila.accion === "vincular" ? fila.existenteId : fila.candidatos[0]?.id ?? "";
  return fila.candidatos.find((candidato) => candidato.id === id)?.imagenUrl ?? null;
}

/** Diálogo del asistente: entrada, revisión editable y aplicación con confirmación. */
export function AdminCargaIaDialog({ onClose, rol }: { onClose: () => void; rol: AdminRole | null }) {
  const puedeCobrar = canWriteFinance(rol);
  const contador = useRef(0);
  const siguienteClave = (prefijo: string) => {
    contador.current += 1;
    return `${prefijo}-${contador.current}`;
  };

  const [config, setConfig] = useState<ConfigIa | null>(null);
  const [configError, setConfigError] = useState("");
  const [reintento, setReintento] = useState(0);
  const [texto, setTexto] = useState("");
  const [fase, setFase] = useState<"entrada" | "revision" | "listo">("entrada");
  const [analizando, setAnalizando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [avisos, setAvisos] = useState<string[]>([]);
  const [clientes, setClientes] = useState<ClienteEdit[]>([]);
  const [eventos, setEventos] = useState<EventoEdit[]>([]);
  const [productos, setProductos] = useState<ProductoEdit[]>([]);
  const [cobros, setCobros] = useState<CobroEdit[]>([]);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [opcionesCliente, setOpcionesCliente] = useState<ClienteOpcion[]>([]);
  const [cargandoClientes, setCargandoClientes] = useState(false);
  const [cartera, setCartera] = useState<{ clientes: number; productos: number } | null>(null);

  useEffect(() => {
    let activo = true;
    void (async () => {
      const result = await adminApiGet<ConfigIa>("/api/admin/ia/carga", { fresh: true });
      if (!activo) return;
      if (!result.ok) {
        setConfigError(result.error);
        return;
      }
      setConfig({
        configurada: Boolean(result.data.configurada),
        modelo: result.data.modelo ?? null,
        tipos: result.data.tipos ?? [],
      });
    })();
    return () => {
      activo = false;
    };
  }, [reintento]);

  const incluidos = useMemo(
    () => ({
      clientes: clientes.filter((fila) => fila.incluir).length,
      eventos: eventos.filter((fila) => fila.incluir).length,
      productos: productos.filter((fila) => fila.incluir).length,
      cobros: cobros.filter((fila) => fila.incluir).length,
    }),
    [clientes, eventos, productos, cobros],
  );
  const totalIncluidos = incluidos.clientes + incluidos.eventos + incluidos.productos + incluidos.cobros;
  /**
   * Registros incluidos que bloquean «Aplicar todo»: elección sin resolver
   * (confianza media) o escalares marcados sin confirmar (issue #126).
   */
  const pendientes = [...clientes, ...productos, ...eventos, ...cobros].filter((fila) => {
    if (!fila.incluir) return false;
    const accion = "accion" in fila ? fila.accion : "crear";
    if (esAccionPendiente(accion)) return true;
    if (accion === "vincular") return false; // lo vinculado no aplica sus datos
    return fila.inventados.length > 0 && !fila.confirmado;
  }).length;

  const actualizarCliente = (clave: string, patch: Partial<ClienteEdit>) =>
    setClientes((actuales) => actuales.map((fila) => (fila.clave === clave ? { ...fila, ...patch } : fila)));
  const actualizarEvento = (clave: string, patch: Partial<EventoEdit>) =>
    setEventos((actuales) => actuales.map((fila) => (fila.clave === clave ? { ...fila, ...patch } : fila)));
  const actualizarProducto = (clave: string, patch: Partial<ProductoEdit>) =>
    setProductos((actuales) => actuales.map((fila) => (fila.clave === clave ? { ...fila, ...patch } : fila)));
  const actualizarCobro = (clave: string, patch: Partial<CobroEdit>) =>
    setCobros((actuales) => actuales.map((fila) => (fila.clave === clave ? { ...fila, ...patch } : fila)));

  /**
   * El cobro (y el evento) acompañan al cliente elegido en el preview (issue
   * #125): al vincular un cliente se encadena su id por nombre; al pasar a
   * «crear», se limpia para que lo resuelva el alta del lote.
   */
  function encadenarCliente(nombre: string, clienteId: string | null) {
    const clave = normalizarBusqueda(nombre);
    setEventos((actuales) =>
      actuales.map((fila) =>
        fila.clienteId === "" && normalizarBusqueda(fila.clienteNombre ?? "") === clave
          ? { ...fila, clienteId: clienteId ?? "", incluir: Boolean(clienteId) }
          : fila,
      ),
    );
    setCobros((actuales) =>
      actuales.map((fila) =>
        fila.clienteId === "" && normalizarBusqueda(fila.clienteNombre ?? "") === clave
          ? {
              ...fila,
              clienteId: clienteId ?? "",
              incluir: Boolean(clienteId) && puedeCobrar && !fila.plazo && aNumero(fila.monto) > 0,
            }
          : fila,
      ),
    );
  }

  /** Aplica la selección `elegir` / `crear` / `vincular:<id>` de un cliente. */
  function elegirAccionCliente(cliente: ClienteEdit, valor: string) {
    if (!valor) {
      actualizarCliente(cliente.clave, { accion: "elegir", existenteId: "" });
      return;
    }
    if (valor.startsWith("vincular:")) {
      const id = valor.slice("vincular:".length);
      const candidato = cliente.candidatos.find((fila) => fila.id === id);
      actualizarCliente(cliente.clave, {
        accion: "vincular",
        existenteId: id,
        existenteNombre: candidato?.nombre ?? cliente.existenteNombre,
        confianza: candidato?.confianza ?? cliente.confianza,
      });
      encadenarCliente(cliente.nombre, id);
      return;
    }
    actualizarCliente(cliente.clave, { accion: "crear", existenteId: "" });
    encadenarCliente(cliente.nombre, null);
  }

  /** Aplica la selección `elegir` / `crear` / `vincular:<id>` de un producto. */
  function elegirAccionProducto(producto: ProductoEdit, valor: string) {
    if (!valor) {
      actualizarProducto(producto.clave, { accion: "elegir", existenteId: "" });
      return;
    }
    if (valor.startsWith("vincular:")) {
      const id = valor.slice("vincular:".length);
      const candidato = producto.candidatos.find((fila) => fila.id === id);
      actualizarProducto(producto.clave, {
        accion: "vincular",
        existenteId: id,
        existenteNombre: candidato?.nombre ?? producto.existenteNombre,
        confianza: candidato?.confianza ?? producto.confianza,
      });
      return;
    }
    actualizarProducto(producto.clave, { accion: "crear", existenteId: "" });
  }

  async function cargarClientes() {
    setCargandoClientes(true);
    const result = await adminApiGet<{ clients?: Array<{ id: string; name: string; company: string | null }> }>(
      "/api/admin/clients?fields=selector",
      { fresh: true },
    );
    setCargandoClientes(false);
    if (!result.ok) return;
    setOpcionesCliente(
      (result.data.clients ?? []).map((cliente) => ({
        value: cliente.id,
        label: cliente.company?.trim() ? `${cliente.name} · ${cliente.company}` : cliente.name,
      })),
    );
  }

  async function analizar() {
    if (!texto.trim() || analizando) return;
    setAnalizando(true);
    setError("");
    const result = await adminSend<{ registros?: IaAnalisis }>("/api/admin/ia/carga", { texto: texto.trim() });
    setAnalizando(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const registros = result.data.registros;
    if (!registros) {
      setError("La respuesta no trajo registros.");
      return;
    }
    setAvisos(registros.avisos ?? []);
    setCartera(registros.cartera ?? null);
    setClientes(
      registros.clientes.map((cliente) => ({
        clave: siguienteClave("cliente"),
        incluir: true,
        accion: cliente.accion,
        existenteId: cliente.existenteId ?? "",
        existenteNombre: cliente.existenteNombre,
        confianza: cliente.confianza,
        candidatos: cliente.candidatos ?? [],
        inventados: cliente.inventados ?? [],
        confirmado: (cliente.inventados ?? []).length === 0,
        nombre: cliente.nombre,
        empresa: cliente.empresa ?? "",
        tipo: cliente.tipo,
        ruc: cliente.ruc ?? "",
        telefono: cliente.telefono ?? "",
        correo: cliente.correo ?? "",
        avisos: cliente.avisos,
      })),
    );
    setEventos(
      registros.eventos.map((evento) => ({
        clave: siguienteClave("evento"),
        incluir: Boolean(evento.clienteId),
        nombre: evento.nombre,
        clienteNombre: evento.clienteNombre,
        clienteId: evento.clienteId ?? "",
        candidatos: evento.candidatos ?? [],
        inventados: evento.inventados ?? [],
        confirmado: (evento.inventados ?? []).length === 0,
        inicio: evento.inicio ?? "",
        fin: evento.fin ?? "",
        lugar: evento.lugar ?? "",
        ciudad: evento.ciudad ?? "",
        avisos: evento.avisos,
      })),
    );
    setProductos(
      registros.productos.map((producto) => ({
        clave: siguienteClave("producto"),
        incluir: true,
        accion: producto.accion,
        existenteId: producto.existenteId ?? "",
        existenteNombre: producto.existenteNombre,
        confianza: producto.confianza,
        candidatos: producto.candidatos ?? [],
        inventados: producto.inventados ?? [],
        confirmado: (producto.inventados ?? []).length === 0,
        nombre: producto.nombre,
        categoria: producto.categoria,
        cantidad: String(producto.cantidad),
        precioLista: aTexto(producto.precioLista),
        precioMayorista: aTexto(producto.precioMayorista),
        precioMinimo: aTexto(producto.precioMinimo),
        avisos: producto.avisos,
      })),
    );
    setCobros(
      registros.cobros.map((cobro) => ({
        clave: siguienteClave("cobro"),
        incluir: puedeCobrar && Boolean(cobro.clienteId) && Boolean(cobro.monto),
        clienteId: cobro.clienteId ?? "",
        clienteNombre: cobro.clienteNombre,
        candidatos: cobro.candidatos ?? [],
        monto: aTexto(cobro.monto),
        montoTexto: cobro.montoTexto,
        fecha: cobro.fecha,
        fechaTexto: cobro.fechaTexto,
        metodo: cobro.metodo ?? "",
        referencia: cobro.referencia ?? "",
        plazo: cobro.plazo ?? false,
        vencimiento: cobro.vencimiento ?? null,
        inventados: cobro.inventados ?? [],
        confirmado: (cobro.inventados ?? []).length === 0,
        avisos: cobro.avisos,
      })),
    );
    setResultado(null);
    setFase("revision");
    void cargarClientes();
  }

  async function aplicarTodo() {
    if (creando || totalIncluidos === 0) return;
    setCreando(true);
    setError("");
    const creados = { clientes: 0, eventos: 0, productos: 0, cobros: 0 };
    const vinculados = { clientes: 0, productos: 0 };
    const errores: string[] = [];
    const advertencias: string[] = [];
    const indice = new Map<string, string>();

    for (const cliente of clientes.filter((fila) => fila.incluir)) {
      if (cliente.accion === "vincular") {
        vinculados.clientes += 1;
        continue;
      }
      if (cliente.accion === "elegir") {
        errores.push(`Cliente «${cliente.nombre}»: quedó sin elegir (vincular o crear).`);
        continue;
      }
      if (cliente.inventados.length > 0 && !cliente.confirmado) {
        errores.push(`Cliente «${cliente.nombre}»: hay datos marcados sin confirmar (${cliente.inventados.join(", ")}).`);
        continue;
      }
      const result = await adminSend<{ client?: { id?: string } }>(
        "/api/admin/clients",
        {
          name: cliente.nombre,
          company: cliente.empresa.trim() || null,
          type: cliente.tipo,
          ruc: cliente.ruc.trim() || null,
          phone: cliente.telefono.trim() || null,
          email: cliente.correo.trim() || null,
        },
        "POST",
        { idempotencyKey: true },
      );
      const id = result.ok ? result.data.client?.id : undefined;
      if (id) {
        creados.clientes += 1;
        indice.set(normalizarBusqueda(cliente.nombre), id);
      } else {
        errores.push(`Cliente «${cliente.nombre}»: ${result.ok ? "la respuesta no trajo el id" : result.error}`);
      }
    }

    for (const evento of eventos.filter((fila) => fila.incluir)) {
      if (evento.inventados.length > 0 && !evento.confirmado) {
        errores.push(`Evento «${evento.nombre}»: hay datos marcados sin confirmar (${evento.inventados.join(", ")}).`);
        continue;
      }
      const clienteId = evento.clienteId || indice.get(normalizarBusqueda(evento.clienteNombre ?? "")) || "";
      if (!clienteId) {
        errores.push(`Evento «${evento.nombre}»: falta el cliente (elegilo o creá el cliente primero).`);
        continue;
      }
      const result = await adminSend(
        "/api/admin/events",
        {
          clientId: clienteId,
          name: evento.nombre,
          location: evento.lugar.trim() || undefined,
          city: evento.ciudad.trim() || undefined,
          startsAt: evento.inicio || undefined,
          endsAt: evento.fin || undefined,
        },
        "POST",
        { idempotencyKey: true },
      );
      if (result.ok) creados.eventos += 1;
      else errores.push(`Evento «${evento.nombre}»: ${result.error}`);
    }

    for (const producto of productos.filter((fila) => fila.incluir)) {
      if (producto.accion === "vincular") {
        vinculados.productos += 1;
        continue;
      }
      if (producto.accion === "elegir") {
        errores.push(`Producto «${producto.nombre}»: quedó sin elegir (vincular o crear).`);
        continue;
      }
      if (producto.inventados.length > 0 && !producto.confirmado) {
        errores.push(`Producto «${producto.nombre}»: hay datos marcados sin confirmar (${producto.inventados.join(", ")}).`);
        continue;
      }
      const cantidad = Math.min(100_000, Math.max(1, Math.floor(aNumero(producto.cantidad)) || 1));
      const result = await adminSend<{ warning?: string }>(
        "/api/admin/resources",
        {
          kind: "inventory",
          name: producto.nombre,
          category: producto.categoria.trim() || "General",
          quantity: cantidad,
          listPrice: aNumero(producto.precioLista),
          wholesalePrice: aNumero(producto.precioMayorista),
          minimumPrice: aNumero(producto.precioMinimo),
        },
        "POST",
        { idempotencyKey: true },
      );
      if (result.ok) {
        creados.productos += 1;
        if (result.data.warning) advertencias.push(`Producto «${producto.nombre}»: ${result.data.warning}`);
      } else {
        errores.push(`Producto «${producto.nombre}»: ${result.error}`);
      }
    }

    for (const cobro of cobros.filter((fila) => fila.incluir)) {
      const etiqueta = cobro.clienteNombre ?? "sin cliente";
      if (cobro.plazo) {
        errores.push(`Cobro de «${etiqueta}»: es a crédito/plazo y no se registra en esta carga.`);
        continue;
      }
      if (cobro.inventados.length > 0 && !cobro.confirmado) {
        errores.push(`Cobro de «${etiqueta}»: hay datos marcados sin confirmar (${cobro.inventados.join(", ")}).`);
        continue;
      }
      if (!puedeCobrar) {
        errores.push(`Cobro de «${etiqueta}»: tu rol no puede registrar cobros (los registra Finanzas).`);
        continue;
      }
      const clienteId = cobro.clienteId || indice.get(normalizarBusqueda(cobro.clienteNombre ?? "")) || "";
      if (!clienteId) {
        errores.push(`Cobro de «${etiqueta}»: falta el cliente.`);
        continue;
      }
      const monto = aNumero(cobro.monto);
      if (monto <= 0) {
        errores.push(`Cobro de «${etiqueta}»: falta el monto.`);
        continue;
      }
      const result = await adminSend(
        "/api/admin/finance",
        {
          kind: "client",
          clientId: clienteId,
          amount: monto,
          method: cobro.metodo || undefined,
          reference: cobro.referencia.trim() || undefined,
        },
        "POST",
        { idempotencyKey: true },
      );
      if (result.ok) creados.cobros += 1;
      else errores.push(`Cobro de «${etiqueta}»: ${result.error}`);
    }

    requestAdminRefresh();
    setResultado({ creados, vinculados, errores, advertencias });
    setCreando(false);
    setFase("listo");
  }

  function opcionesDeClienteEvento(evento: EventoEdit): ClienteOpcion[] {
    const opciones: ClienteOpcion[] = [{ value: "", label: "— Elegí el cliente —" }, ...opcionesCliente];
    for (const candidato of evento.candidatos) {
      const etiqueta = candidato.confianza < 100 ? `${candidato.nombre} (${candidato.confianza} %)` : candidato.nombre;
      if (!opciones.some((opcion) => opcion.value === candidato.id)) opciones.push({ value: candidato.id, label: etiqueta });
    }
    return opciones;
  }

  function opcionesDeClienteCobro(cobro: CobroEdit): ClienteOpcion[] {
    const opciones: ClienteOpcion[] = [{ value: "", label: "— Elegí el cliente —" }, ...opcionesCliente];
    for (const candidato of cobro.candidatos) {
      const etiqueta = candidato.confianza < 100 ? `${candidato.nombre} (${candidato.confianza} %)` : candidato.nombre;
      if (!opciones.some((opcion) => opcion.value === candidato.id)) opciones.push({ value: candidato.id, label: etiqueta });
    }
    return opciones;
  }

  const partesDetectadas = [
    listar(clientes.length, "cliente", "clientes"),
    listar(eventos.length, "evento", "eventos"),
    listar(productos.length, "producto", "productos"),
    listar(cobros.length, "cobro", "cobros"),
  ];

  const partesCreadas = [
    creadosDe(resultado, "clientes"),
    creadosDe(resultado, "eventos"),
    creadosDe(resultado, "productos"),
    creadosDe(resultado, "cobros"),
  ].filter((parte): parte is string => Boolean(parte));

  function creadosDe(resultadoActual: Resultado | null, tipo: keyof Resultado["creados"]): string | null {
    const cantidad = resultadoActual?.creados[tipo] ?? 0;
    if (cantidad <= 0) return null;
    const nombres: Record<keyof Resultado["creados"], [string, string]> = {
      clientes: ["cliente", "clientes"],
      eventos: ["evento", "eventos"],
      productos: ["producto", "productos"],
      cobros: ["cobro", "cobros"],
    };
    return listar(cantidad, nombres[tipo][0], nombres[tipo][1]);
  }

  // Portal a la raíz del panel (mismo patrón que la paleta): el topbar tiene
  // `backdrop-filter` y eso ancla los `fixed` a su caja; además la raíz
  // (`.admin-root`) es donde viven los tokens del tema (issue #120).
  return createPortal(
    <AdminDialog title="Carga con IA" icon="sparkles" size="ficha" onClose={onClose}>
      {!config && !configError ? <p className="admin-dialog-text">Consultando la configuración…</p> : null}

      {configError ? <AdminNote tone="error">{configError}</AdminNote> : null}

      {config && !config.configurada ? (
        <>
          <AdminNote tone="warn" variant="alert">
            La IA no está configurada en el servidor. Se activa cargando <code>IA_API_KEY</code> (el modelo y la base se
            ajustan con <code>IA_MODELO</code> y <code>IA_BASE_URL</code>).
          </AdminNote>
          <p className="admin-dialog-text">
            Mientras tanto, los clientes, eventos y productos se cargan a mano desde cada módulo, sin perder nada.
          </p>
          <div className="admin-dialog-foot">
            <span className="admin-dialog-spacer" />
            <AdminButton icon="refresh" onClick={() => setReintento((valor) => valor + 1)}>
              Volver a chequear
            </AdminButton>
            <AdminButton variant="primary" icon="check" onClick={onClose}>
              Entendido
            </AdminButton>
          </div>
        </>
      ) : null}

      {config?.configurada && fase === "entrada" ? (
        <form
          className="admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            void analizar();
          }}
        >
          <TextAreaField
            label="Texto para cargar"
            hint={`Pegá mensajes, listas o catálogos (${(config.tipos.length > 0 ? config.tipos : IA_TIPOS).map((tipo) => IA_TIPO_LABEL[tipo].toLowerCase()).join(", ")} a la vez). Máximo ${IA_TEXTO_MAX.toLocaleString("es-PY")} caracteres.`}
            rows={10}
            maxLength={IA_TEXTO_MAX}
            value={texto}
            onChange={setTexto}
            disabled={analizando}
            placeholder={"Ejemplo:\nJuan Pérez me pagó 750 mil por transferencia\nEvento: cierre de año de Constructora Sur, 20/12/2026, salón Los Lapachos\nProducto: pantalla LED 3x2, cantidad 4, lista 1.500.000"}
            wide
          />
          <p className="admin-dialog-text admin-ia-privacy">
            Se manda solo este texto al proveedor de IA configurado{config.modelo ? ` (${config.modelo})` : ""} para armar
            la vista previa; no se guarda en EventOS ni se toca la base.{" "}
            <Link href={`${publicConfig.siteUrl}/privacidad`} target="_blank" rel="noopener">
              Política de privacidad
            </Link>
            .
          </p>
          {error ? <AdminNote tone="error">{error}</AdminNote> : null}
          <div className="admin-dialog-foot">
            <span className="admin-dialog-spacer" />
            <AdminButton icon="close" onClick={onClose} disabled={analizando}>
              Cancelar
            </AdminButton>
            <AdminButton variant="primary" icon="sparkles" type="submit" busy={analizando} disabled={!texto.trim()}>
              Analizar con IA
            </AdminButton>
          </div>
        </form>
      ) : null}

      {config?.configurada && fase === "revision" ? (
        <>
          <p className="admin-dialog-text">
            Detectamos <strong>{partesDetectadas.join(", ")}</strong>. Revisá, corregí o descartá: nada se aplica sin tu
            confirmación.
          </p>
          {avisos.length > 0 ? <AdminNote tone="warn">{avisos.join(" ")}</AdminNote> : null}
          {error ? <AdminNote tone="error">{error}</AdminNote> : null}

          {clientes.length + eventos.length + productos.length + cobros.length === 0 ? (
            <AdminEmpty
              title="No detectamos registros"
              icon="sparkles"
              hint="Probá con un texto más completo (nombres, fechas o precios) o volvé a pegar."
            />
          ) : null}

          {clientes.length > 0 ? (
            <section className="admin-ia-section" aria-label={`Clientes detectados (${clientes.length})`}>
              <h3 className="admin-ia-section-title">
                {IA_TIPO_LABEL.clientes} <span>{clientes.length}</span>
              </h3>
              {cartera && cartera.clientes === 0 ? (
                <AdminNote tone="warn">No hay clientes cargados en esta empresa: lo detectado se crearía de cero.</AdminNote>
              ) : null}
              {clientes.map((cliente) => (
                <article key={cliente.clave} className="admin-ia-card" data-off={!cliente.incluir}>
                  <header className="admin-ia-card-head">
                    <span className="admin-ia-contexto">
                      <AdminAvatar
                        name={cliente.nombre}
                        src={imagenDeCandidato(cliente)}
                        size={40}
                        title={imagenDeCandidato(cliente) ? `Logo de ${cliente.existenteNombre ?? cliente.nombre}` : `Monograma de ${cliente.nombre}`}
                      />
                      <span className="admin-ia-card-title">{cliente.nombre}</span>
                    </span>
                    <SwitchField
                      label="Incluir"
                      checked={cliente.incluir}
                      onChange={(incluir) => actualizarCliente(cliente.clave, { incluir })}
                    />
                  </header>
                  {cliente.avisos.length > 0 ? <AdminNote tone="warn">{cliente.avisos.join(" ")}</AdminNote> : null}
                  {cliente.inventados.length > 0 ? (
                    <>
                      <AdminNote tone="warn">
                        {`No está en el texto: ${cliente.inventados.join(" · ")}.`}
                        {cliente.accion === "vincular" ? " Al vincular no se aplican." : ""}
                      </AdminNote>
                      {cliente.accion !== "vincular" ? (
                        <div className="admin-ia-grid">
                          <SwitchField
                            label="Confirmo los datos marcados"
                            checked={cliente.confirmado}
                            onChange={(confirmado) => actualizarCliente(cliente.clave, { confirmado })}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div className="admin-ia-grid">
                    <SelectField
                      label="Acción"
                      options={opcionesDeAccion(cliente.candidatos, cliente.accion === "elegir")}
                      value={seleccionDeAccion(cliente)}
                      onChange={(valor) => elegirAccionCliente(cliente, valor)}
                      hint={
                        cliente.candidatos.length > 0
                          ? `Candidatos: ${cliente.candidatos.map((fila) => `${fila.nombre} (${fila.confianza} %)`).join(" · ")}`
                          : undefined
                      }
                      error={cliente.accion === "elegir" ? "Elegí si es un existente o creá uno nuevo." : null}
                      disabled={!cliente.incluir}
                    />
                  </div>
                  {cliente.accion === "vincular" ? (
                    <p className="admin-ia-match">
                      Se vincula a <strong>{cliente.existenteNombre ?? "el existente"}</strong>
                      {cliente.confianza !== null ? ` (${cliente.confianza} %)` : ""}: no se crea un cliente nuevo.
                    </p>
                  ) : (
                    <div className="admin-ia-grid">
                      <TextField
                        label="Nombre"
                        value={cliente.nombre}
                        onChange={(nombre) => actualizarCliente(cliente.clave, { nombre })}
                        disabled={!cliente.incluir}
                      />
                      <TextField
                        label="Empresa"
                        value={cliente.empresa}
                        onChange={(empresa) => actualizarCliente(cliente.clave, { empresa })}
                        disabled={!cliente.incluir}
                      />
                      <SelectField
                        label="Tipo"
                        options={TIPO_CLIENTE}
                        value={cliente.tipo}
                        onChange={(tipo) => actualizarCliente(cliente.clave, { tipo: tipo === "RESELLER" ? "RESELLER" : "FINAL" })}
                        disabled={!cliente.incluir}
                      />
                      <RucField
                        label="RUC / C.I."
                        maxLength={30}
                        value={cliente.ruc}
                        onChange={(ruc) => actualizarCliente(cliente.clave, { ruc })}
                        disabled={!cliente.incluir}
                      />
                      <PhoneField
                        label="Teléfono"
                        value={cliente.telefono}
                        onChange={(telefono) => actualizarCliente(cliente.clave, { telefono })}
                        disabled={!cliente.incluir}
                      />
                      <EmailField
                        label="Correo"
                        value={cliente.correo}
                        onChange={(correo) => actualizarCliente(cliente.clave, { correo })}
                        disabled={!cliente.incluir}
                      />
                    </div>
                  )}
                </article>
              ))}
            </section>
          ) : null}

          {eventos.length > 0 ? (
            <section className="admin-ia-section" aria-label={`Eventos detectados (${eventos.length})`}>
              <h3 className="admin-ia-section-title">
                {IA_TIPO_LABEL.eventos} <span>{eventos.length}</span>
              </h3>
              {eventos.map((evento) => (
                <article key={evento.clave} className="admin-ia-card" data-off={!evento.incluir}>
                  <header className="admin-ia-card-head">
                    <span className="admin-ia-card-title">{evento.nombre}</span>
                    <SwitchField
                      label="Incluir"
                      checked={evento.incluir}
                      disabled={!evento.clienteId}
                      onChange={(incluir) => actualizarEvento(evento.clave, { incluir })}
                    />
                  </header>
                  {avisosVigentes(evento.avisos, evento.clienteId).length > 0 ? <AdminNote tone="warn">{avisosVigentes(evento.avisos, evento.clienteId).join(" ")}</AdminNote> : null}
                  {evento.inventados.length > 0 ? (
                    <>
                      <AdminNote tone="warn">{`No está en el texto: ${evento.inventados.join(" · ")}.`}</AdminNote>
                      <div className="admin-ia-grid">
                        <SwitchField
                          label="Confirmo los datos marcados"
                          checked={evento.confirmado}
                          onChange={(confirmado) => actualizarEvento(evento.clave, { confirmado })}
                        />
                      </div>
                    </>
                  ) : null}
                  <div className="admin-ia-grid">
                    <TextField
                      label="Nombre"
                      value={evento.nombre}
                      onChange={(nombre) => actualizarEvento(evento.clave, { nombre })}
                      disabled={!evento.incluir}
                    />
                    <SelectField
                      label="Cliente"
                      hint={evento.clienteNombre ? `En el texto: ${evento.clienteNombre}` : "Sin cliente en el texto"}
                      options={opcionesDeClienteEvento(evento)}
                      value={evento.clienteId}
                      onChange={(clienteId) => actualizarEvento(evento.clave, { clienteId, incluir: Boolean(clienteId) })}
                      disabled={cargandoClientes}
                      error={!evento.clienteId ? "Elegí el cliente para poder crear el evento." : null}
                    />
                    <DateField
                      label="Inicio"
                      value={evento.inicio}
                      onChange={(inicio) => actualizarEvento(evento.clave, { inicio })}
                      disabled={!evento.incluir}
                    />
                    <DateField
                      label="Fin"
                      value={evento.fin}
                      onChange={(fin) => actualizarEvento(evento.clave, { fin })}
                      disabled={!evento.incluir}
                    />
                    <TextField
                      label="Lugar"
                      value={evento.lugar}
                      onChange={(lugar) => actualizarEvento(evento.clave, { lugar })}
                      disabled={!evento.incluir}
                    />
                    <TextField
                      label="Ciudad"
                      value={evento.ciudad}
                      onChange={(ciudad) => actualizarEvento(evento.clave, { ciudad })}
                      disabled={!evento.incluir}
                    />
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          {productos.length > 0 ? (
            <section className="admin-ia-section" aria-label={`Productos detectados (${productos.length})`}>
              <h3 className="admin-ia-section-title">
                {IA_TIPO_LABEL.productos} <span>{productos.length}</span>
              </h3>
              {cartera && cartera.productos === 0 ? (
                <AdminNote tone="warn">No hay productos cargados en Inventario: lo detectado se crearía de cero.</AdminNote>
              ) : null}
              {productos.map((producto) => (
                <article key={producto.clave} className="admin-ia-card" data-off={!producto.incluir}>
                  <header className="admin-ia-card-head">
                    <span className="admin-ia-contexto">
                      <AdminImageBox
                        imageUrl={imagenDeCandidato(producto)}
                        size={40}
                        title={imagenDeCandidato(producto) ? `Foto de ${producto.existenteNombre ?? producto.nombre}` : `Sin foto: ${producto.nombre}`}
                      />
                      <span className="admin-ia-card-title">{producto.nombre}</span>
                    </span>
                    <SwitchField
                      label="Incluir"
                      checked={producto.incluir}
                      onChange={(incluir) => actualizarProducto(producto.clave, { incluir })}
                    />
                  </header>
                  {producto.avisos.length > 0 ? <AdminNote tone="warn">{producto.avisos.join(" ")}</AdminNote> : null}
                  {producto.inventados.length > 0 ? (
                    <>
                      <AdminNote tone="warn">
                        {`No está en el texto: ${producto.inventados.join(" · ")}.`}
                        {producto.accion === "vincular" ? " Al vincular no se aplican." : ""}
                      </AdminNote>
                      {producto.accion !== "vincular" ? (
                        <div className="admin-ia-grid">
                          <SwitchField
                            label="Confirmo los datos marcados"
                            checked={producto.confirmado}
                            onChange={(confirmado) => actualizarProducto(producto.clave, { confirmado })}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div className="admin-ia-grid">
                    <SelectField
                      label="Acción"
                      options={opcionesDeAccion(producto.candidatos, producto.accion === "elegir")}
                      value={seleccionDeAccion(producto)}
                      onChange={(valor) => elegirAccionProducto(producto, valor)}
                      hint={
                        producto.candidatos.length > 0
                          ? `Candidatos: ${producto.candidatos.map((fila) => `${fila.nombre} (${fila.confianza} %)`).join(" · ")}`
                          : undefined
                      }
                      error={producto.accion === "elegir" ? "Elegí si es un ítem existente o creá uno nuevo." : null}
                      disabled={!producto.incluir}
                    />
                  </div>
                  {producto.accion === "vincular" ? (
                    <p className="admin-ia-match">
                      Se vincula a <strong>{producto.existenteNombre ?? "el ítem existente"}</strong>
                      {producto.confianza !== null ? ` (${producto.confianza} %)` : ""}: no se crea un producto nuevo.
                    </p>
                  ) : (
                    <div className="admin-ia-grid">
                      <TextField
                        label="Nombre"
                        value={producto.nombre}
                        onChange={(nombre) => actualizarProducto(producto.clave, { nombre })}
                        disabled={!producto.incluir}
                      />
                      <TextField
                        label="Categoría"
                        value={producto.categoria}
                        onChange={(categoria) => actualizarProducto(producto.clave, { categoria })}
                        disabled={!producto.incluir}
                      />
                      <NumberField
                        label="Cantidad"
                        value={producto.cantidad}
                        onChange={(cantidad) => actualizarProducto(producto.clave, { cantidad })}
                        disabled={!producto.incluir}
                        maxLength={6}
                      />
                      <MoneyField
                        label="Precio de lista"
                        value={producto.precioLista}
                        onChange={(precioLista) => actualizarProducto(producto.clave, { precioLista })}
                        disabled={!producto.incluir}
                      />
                      <MoneyField
                        label="Precio mayorista"
                        value={producto.precioMayorista}
                        onChange={(precioMayorista) => actualizarProducto(producto.clave, { precioMayorista })}
                        disabled={!producto.incluir}
                      />
                      <MoneyField
                        label="Precio mínimo"
                        value={producto.precioMinimo}
                        onChange={(precioMinimo) => actualizarProducto(producto.clave, { precioMinimo })}
                        disabled={!producto.incluir}
                      />
                    </div>
                  )}
                </article>
              ))}
            </section>
          ) : null}

          {cobros.length > 0 ? (
            <section className="admin-ia-section" aria-label={`Cobros detectados (${cobros.length})`}>
              <h3 className="admin-ia-section-title">
                {IA_TIPO_LABEL.cobros} <span>{cobros.length}</span>
              </h3>
              {cobros.map((cobro) => (
                <article key={cobro.clave} className="admin-ia-card" data-off={!cobro.incluir}>
                  <header className="admin-ia-card-head">
                    <span className="admin-ia-card-title">{`Cobro de «${cobro.clienteNombre ?? "sin cliente"}»`}</span>
                    <SwitchField
                      label="Registrar"
                      checked={cobro.incluir && !cobro.plazo}
                      disabled={!puedeCobrar || cobro.plazo || !cobro.clienteId || aNumero(cobro.monto) <= 0}
                      onChange={(incluir) => actualizarCobro(cobro.clave, { incluir })}
                    />
                  </header>
                  {!puedeCobrar ? (
                    <AdminNote tone="warn">Tu rol no puede registrar cobros: los registra Finanzas. El cobro queda solo como aviso.</AdminNote>
                  ) : null}
                  {cobro.plazo ? (
                    <AdminNote tone="warn">
                      {cobro.vencimiento
                        ? `A crédito/plazo: vence el ${cobro.vencimiento}. No se registra como cobrado en esta carga.`
                        : "A crédito/plazo: no se registra como cobrado en esta carga."}
                    </AdminNote>
                  ) : null}
                  {cobro.inventados.length > 0 ? (
                    <>
                      <AdminNote tone="warn">{`No está en el texto: ${cobro.inventados.join(" · ")}.`}</AdminNote>
                      <div className="admin-ia-grid">
                        <SwitchField
                          label="Confirmo los datos marcados"
                          checked={cobro.confirmado}
                          onChange={(confirmado) => actualizarCobro(cobro.clave, { confirmado })}
                        />
                      </div>
                    </>
                  ) : null}
                  {avisosVigentes(cobro.avisos, cobro.clienteId).length > 0 ? <AdminNote tone="warn">{avisosVigentes(cobro.avisos, cobro.clienteId).join(" ")}</AdminNote> : null}
                  <div className="admin-ia-grid">
                    <SelectField
                      label="Cliente"
                      options={opcionesDeClienteCobro(cobro)}
                      value={cobro.clienteId}
                      onChange={(clienteId) => actualizarCobro(cobro.clave, { clienteId, incluir: Boolean(clienteId) && !cobro.plazo && aNumero(cobro.monto) > 0 })}
                      disabled={cargandoClientes || !puedeCobrar}
                      error={!cobro.clienteId ? "Elegí el cliente del cobro." : null}
                    />
                    <MoneyField
                      label="Monto"
                      hint={cobro.montoTexto ? `En el texto: ${cobro.montoTexto}` : "No vino el monto en el texto"}
                      value={cobro.monto}
                      onChange={(monto) => actualizarCobro(cobro.clave, { monto, incluir: Boolean(cobro.clienteId) && !cobro.plazo && aNumero(monto) > 0 })}
                      disabled={!puedeCobrar}
                    />
                    <SelectField
                      label="Método"
                      options={METODO_PAGO}
                      value={cobro.metodo}
                      onChange={(metodo) => actualizarCobro(cobro.clave, { metodo })}
                      disabled={!puedeCobrar}
                    />
                    <TextField
                      label="Referencia"
                      value={cobro.referencia}
                      onChange={(referencia) => actualizarCobro(cobro.clave, { referencia })}
                      placeholder="Nro. de transferencia, cheque…"
                      disabled={!puedeCobrar}
                    />
                  </div>
                  {cobro.fechaTexto || cobro.fecha ? (
                    <p className="admin-ia-match">
                      {`Fecha en el texto: «${cobro.fechaTexto ?? "—"}»`}
                      {cobro.fecha ? ` → ${cobro.fecha}` : " (no pudimos leerla)"}
                      {". El cobro se sella con la fecha del registro."}
                    </p>
                  ) : null}
                </article>
              ))}
            </section>
          ) : null}

          {pendientes > 0 ? (
            <AdminNote tone="warn">
              {`Resolvé ${listar(pendientes, "registro", "registros")}: elegí si refieren a un existente o marcalos como «Crear nuevo».`}
            </AdminNote>
          ) : null}
          <div className="admin-dialog-foot">
            <span className="admin-dialog-spacer" />
            <AdminButton icon="arrow-left" onClick={() => setFase("entrada")} disabled={creando}>
              Volver
            </AdminButton>
            <AdminButton
              variant="primary"
              icon="check"
              busy={creando}
              disabled={creando || totalIncluidos === 0 || pendientes > 0}
              onClick={() => void aplicarTodo()}
            >
              {`Aplicar todo (${totalIncluidos})`}
            </AdminButton>
          </div>
        </>
      ) : null}

      {fase === "listo" && resultado ? (
        <>
          <AdminNote tone="ok">
            {partesCreadas.length > 0 ? `Creamos ${partesCreadas.join(", ")}.` : "No se creó ningún registro."}
          </AdminNote>
          {resultado.vinculados.clientes + resultado.vinculados.productos > 0 ? (
            <AdminNote tone="ok">
              {`Vinculamos ${[
                resultado.vinculados.clientes > 0 ? listar(resultado.vinculados.clientes, "cliente", "clientes") : null,
                resultado.vinculados.productos > 0 ? listar(resultado.vinculados.productos, "producto", "productos") : null,
              ]
                .filter(Boolean)
                .join(" y ")} a lo existente.`}
            </AdminNote>
          ) : null}
          {resultado.advertencias.map((advertencia) => (
            <AdminNote key={advertencia} tone="warn">
              {advertencia}
            </AdminNote>
          ))}
          {resultado.errores.length > 0 ? (
            <AdminNote tone="error">{`No pudimos aplicar ${resultado.errores.length} acción(es): ${resultado.errores.join(" · ")}`}</AdminNote>
          ) : null}
          <p className="admin-dialog-text">
            Lo aplicado quedó auditado como cualquier operación del panel (los cobros con su movimiento de tesorería); las
            pantallas abiertas se actualizaron solas.
          </p>
          <div className="admin-dialog-foot">
            <span className="admin-dialog-spacer" />
            <AdminButton
              icon="refresh"
              onClick={() => {
                setTexto("");
                setResultado(null);
                setError("");
                setAvisos([]);
                setFase("entrada");
              }}
            >
              Cargar otro texto
            </AdminButton>
            <AdminButton variant="primary" icon="check" onClick={onClose}>
              Listo
            </AdminButton>
          </div>
        </>
      ) : null}
    </AdminDialog>,
    document.getElementById(ADMIN_ROOT_ID) ?? document.body,
  );
}
