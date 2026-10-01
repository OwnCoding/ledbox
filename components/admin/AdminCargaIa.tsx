"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizarBusqueda } from "owncoding-ui/utils";
import { adminApiGet, adminSend, requestAdminRefresh } from "@/lib/admin-api";
import { ADMIN_ROOT_ID } from "@/lib/admin-theme";
import { publicConfig } from "@/lib/public-config";
import {
  IA_TEXTO_MAX,
  IA_TIPOS,
  IA_TIPO_LABEL,
  type IaAnalisis,
  type IaClienteRef,
  type IaTipo,
} from "@/lib/ia-carga";
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

/**
 * «Carga con IA» (issue #120): el diálogo de pegado, revisión y creación.
 *
 * El panel crea con los **endpoints existentes** (clientes, eventos y
 * productos): mismos permisos, mismo aislamiento por empresa y misma auditoría.
 * El análisis server-side no escribe nada y el texto pegado no se persiste
 * (docs/PRIVACIDAD.md T10); sin proveedor configurado el diálogo lo avisa.
 *
 * El botón que lo abre vive en `AdminCargaIaButton.tsx` y este diálogo llega
 * diferido (patrón de la paleta de búsqueda).
 */

type ConfigIa = { configurada: boolean; modelo: string | null; tipos: IaTipo[] };

type ClienteEdit = {
  clave: string;
  incluir: boolean;
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
  candidatos: IaClienteRef[];
  inicio: string;
  fin: string;
  lugar: string;
  ciudad: string;
  avisos: string[];
};

type ProductoEdit = {
  clave: string;
  incluir: boolean;
  nombre: string;
  categoria: string;
  cantidad: string;
  precioLista: string;
  precioMayorista: string;
  precioMinimo: string;
  avisos: string[];
};

type ClienteOpcion = { value: string; label: string };

type Resultado = {
  creados: { clientes: number; eventos: number; productos: number };
  errores: string[];
  advertencias: string[];
};

const TIPO_CLIENTE: Array<{ value: string; label: string }> = [
  { value: "FINAL", label: "Cliente final" },
  { value: "RESELLER", label: "Mayorista" },
];

const aTexto = (valor: number | null | undefined) => (valor === null || valor === undefined ? "" : String(valor));

const aNumero = (valor: string): number => {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : 0;
};

const listar = (cantidad: number, singular: string, plural: string) => `${cantidad} ${cantidad === 1 ? singular : plural}`;

/** Diálogo del asistente: entrada, revisión editable y creación con confirmación. */
export function AdminCargaIaDialog({ onClose }: { onClose: () => void }) {
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
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [opcionesCliente, setOpcionesCliente] = useState<ClienteOpcion[]>([]);
  const [cargandoClientes, setCargandoClientes] = useState(false);

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
    }),
    [clientes, eventos, productos],
  );
  const totalIncluidos = incluidos.clientes + incluidos.eventos + incluidos.productos;

  const actualizarCliente = (clave: string, patch: Partial<ClienteEdit>) =>
    setClientes((actuales) => actuales.map((fila) => (fila.clave === clave ? { ...fila, ...patch } : fila)));
  const actualizarEvento = (clave: string, patch: Partial<EventoEdit>) =>
    setEventos((actuales) => actuales.map((fila) => (fila.clave === clave ? { ...fila, ...patch } : fila)));
  const actualizarProducto = (clave: string, patch: Partial<ProductoEdit>) =>
    setProductos((actuales) => actuales.map((fila) => (fila.clave === clave ? { ...fila, ...patch } : fila)));

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
    setClientes(
      registros.clientes.map((cliente) => ({
        clave: siguienteClave("cliente"),
        incluir: true,
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
        nombre: producto.nombre,
        categoria: producto.categoria,
        cantidad: String(producto.cantidad),
        precioLista: aTexto(producto.precioLista),
        precioMayorista: aTexto(producto.precioMayorista),
        precioMinimo: aTexto(producto.precioMinimo),
        avisos: producto.avisos,
      })),
    );
    setResultado(null);
    setFase("revision");
    void cargarClientes();
  }

  async function crearTodo() {
    if (creando || totalIncluidos === 0) return;
    setCreando(true);
    setError("");
    const creados = { clientes: 0, eventos: 0, productos: 0 };
    const errores: string[] = [];
    const advertencias: string[] = [];
    const indice = new Map<string, string>();

    for (const cliente of clientes.filter((fila) => fila.incluir)) {
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

    requestAdminRefresh();
    setResultado({ creados, errores, advertencias });
    setCreando(false);
    setFase("listo");
  }

  function opcionesDeCliente(evento: EventoEdit): ClienteOpcion[] {
    const opciones: ClienteOpcion[] = [{ value: "", label: "— Elegí el cliente —" }, ...opcionesCliente];
    for (const candidato of evento.candidatos) {
      if (!opciones.some((opcion) => opcion.value === candidato.id)) {
        opciones.push({ value: candidato.id, label: candidato.nombre });
      }
    }
    return opciones;
  }

  const partesDetectadas = [
    listar(clientes.length, "cliente", "clientes"),
    listar(eventos.length, "evento", "eventos"),
    listar(productos.length, "producto", "productos"),
  ];

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
            placeholder={"Ejemplo:\nJuan Pérez (empresa Constructora Sur) — 0981 123 456, juan@sur.com.py\nEvento: cierre de año, 20/12/2026, salón Los Lapachos, Asunción\nProducto: pantalla LED 3x2, cantidad 4, lista 1.500.000"}
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
            Detectamos <strong>{partesDetectadas.join(", ")}</strong>. Revisá, corregí o descartá: nada se crea sin tu
            confirmación.
          </p>
          {avisos.length > 0 ? <AdminNote tone="warn">{avisos.join(" ")}</AdminNote> : null}
          {error ? <AdminNote tone="error">{error}</AdminNote> : null}

          {clientes.length + eventos.length + productos.length === 0 ? (
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
              {clientes.map((cliente) => (
                <article key={cliente.clave} className="admin-ia-card" data-off={!cliente.incluir}>
                  <header className="admin-ia-card-head">
                    <span className="admin-ia-card-title">{cliente.nombre}</span>
                    <SwitchField
                      label="Crear"
                      checked={cliente.incluir}
                      onChange={(incluir) => actualizarCliente(cliente.clave, { incluir })}
                    />
                  </header>
                  {cliente.avisos.length > 0 ? <AdminNote tone="warn">{cliente.avisos.join(" ")}</AdminNote> : null}
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
                      label="Crear"
                      checked={evento.incluir}
                      disabled={!evento.clienteId}
                      onChange={(incluir) => actualizarEvento(evento.clave, { incluir })}
                    />
                  </header>
                  {evento.avisos.length > 0 ? <AdminNote tone="warn">{evento.avisos.join(" ")}</AdminNote> : null}
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
                      options={opcionesDeCliente(evento)}
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
              {productos.map((producto) => (
                <article key={producto.clave} className="admin-ia-card" data-off={!producto.incluir}>
                  <header className="admin-ia-card-head">
                    <span className="admin-ia-card-title">{producto.nombre}</span>
                    <SwitchField
                      label="Crear"
                      checked={producto.incluir}
                      onChange={(incluir) => actualizarProducto(producto.clave, { incluir })}
                    />
                  </header>
                  {producto.avisos.length > 0 ? <AdminNote tone="warn">{producto.avisos.join(" ")}</AdminNote> : null}
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
                </article>
              ))}
            </section>
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
              disabled={creando || totalIncluidos === 0}
              onClick={() => void crearTodo()}
            >
              {`Crear todo (${totalIncluidos})`}
            </AdminButton>
          </div>
        </>
      ) : null}

      {fase === "listo" && resultado ? (
        <>
          <AdminNote tone="ok">
            {resultado.creados.clientes + resultado.creados.eventos + resultado.creados.productos > 0
              ? `Creamos ${[
                  resultado.creados.clientes > 0 ? listar(resultado.creados.clientes, "cliente", "clientes") : null,
                  resultado.creados.eventos > 0 ? listar(resultado.creados.eventos, "evento", "eventos") : null,
                  resultado.creados.productos > 0 ? listar(resultado.creados.productos, "producto", "productos") : null,
                ]
                  .filter(Boolean)
                  .join(", ")}.`
              : "No se creó ningún registro."}
          </AdminNote>
          {resultado.advertencias.map((advertencia) => (
            <AdminNote key={advertencia} tone="warn">
              {advertencia}
            </AdminNote>
          ))}
          {resultado.errores.length > 0 ? (
            <AdminNote tone="error">{`No pudimos crear ${resultado.errores.length} registro(s): ${resultado.errores.join(" · ")}`}</AdminNote>
          ) : null}
          <p className="admin-dialog-text">
            Los registros creados ya quedaron auditados como cualquier alta del panel; las pantallas abiertas se
            actualizaron solas.
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
