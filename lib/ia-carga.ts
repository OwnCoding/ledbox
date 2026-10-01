/**
 * «Carga con IA» (issue #120): contrato compartido del asistente.
 *
 * Módulo **puro** (sin React y sin servidor) con los límites, las etiquetas y
 * los tipos que cruzan la frontera: el route handler devuelve registros con
 * esta forma y el diálogo del panel los dibuja y los edita. El servidor valida
 * la salida del proveedor contra este mismo contrato (§3.2 del plan #100:
 * «buscar antes de crear»; acá el objeto es el contrato de la función, no un
 * componente).
 */

/** Largo máximo del texto pegado, en caracteres. */
export const IA_TEXTO_MAX = 20_000;

/** Máximo de registros por tipo en una pasada (el prompt también lo pide). */
export const IA_REGISTROS_MAX = 25;

/** Llamadas por organización dentro de la ventana del rate-limit (15 min). */
export const IA_RATE_LIMIT = 10;

/** Tope de tokens de la respuesta del modelo. */
export const IA_TOKENS_MAX = 4_000;

/** Timeout de la llamada al proveedor. */
export const IA_TIMEOUT_MS = 30_000;

export const IA_TIPOS = ["clientes", "eventos", "productos"] as const;

/** Tipo de registro que el asistente puede detectar y crear. */
export type IaTipo = (typeof IA_TIPOS)[number];

export const IA_TIPO_LABEL: Record<IaTipo, string> = {
  clientes: "Clientes",
  eventos: "Eventos",
  productos: "Productos",
};

/** Cliente detectado (preview editable; `avisos` explica lo que falta o dudó la IA). */
export type IaCliente = {
  nombre: string;
  empresa: string | null;
  /** `FINAL` (cliente final) o `RESELLER` (mayorista). */
  tipo: "FINAL" | "RESELLER";
  ruc: string | null;
  telefono: string | null;
  correo: string | null;
  avisos: string[];
};

/** Referencia mínima de un cliente existente para resolver el evento. */
export type IaClienteRef = { id: string; nombre: string };

/** Evento detectado; el cliente se resuelve por nombre contra la cartera. */
export type IaEvento = {
  nombre: string;
  /** Nombre tal como apareció en el texto (para mostrar y para re-matchear). */
  clienteNombre: string | null;
  /** Cliente existente resuelto; `null` si no hubo coincidencia única. */
  clienteId: string | null;
  /** Candidatos cuando el nombre es ambiguo (hasta 8). */
  candidatos: IaClienteRef[];
  /** Fecha de inicio en `YYYY-MM-DD`; `null` si no se pudo leer. */
  inicio: string | null;
  /** Fecha de fin en `YYYY-MM-DD`; `null` si no se pudo leer. */
  fin: string | null;
  lugar: string | null;
  ciudad: string | null;
  avisos: string[];
};

/** Producto/ítem de inventario detectado. */
export type IaProducto = {
  nombre: string;
  categoria: string;
  cantidad: number;
  /** Precios unitarios en guaraníes enteros; `null` si no venían en el texto. */
  precioLista: number | null;
  precioMayorista: number | null;
  precioMinimo: number | null;
  avisos: string[];
};

/** Resultado de una pasada: lo detectado por tipo (los no pedidos van vacíos). */
export type IaAnalisis = {
  clientes: IaCliente[];
  eventos: IaEvento[];
  productos: IaProducto[];
  /** Notas globales de la pasada (registros descartados, recortes). */
  avisos: string[];
};
