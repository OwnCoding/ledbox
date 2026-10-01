/**
 * «Carga con IA» (issues #120 y #122): contrato compartido del asistente.
 *
 * Módulo **puro** (sin React y sin servidor) con los límites, las etiquetas y
 * los tipos que cruzan la frontera: el route handler devuelve registros con
 * esta forma y el diálogo del panel los dibuja y los edita. El servidor valida
 * la salida del proveedor contra este mismo contrato.
 *
 * #122 agrega: matching contra lo existente (candidatos con confianza y acción
 * «crear»/«vincular») y los **cobros** («me pagó X») como acción registrable.
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

/** Confianza (0–100) desde la que un candidato es «claro»: se propone vincular. */
export const IA_MATCH_CLARO = 85;

/** Confianza desde la que un candidato se muestra como posible (dudoso). */
export const IA_MATCH_DUDOSO = 60;

export const IA_TIPOS = ["clientes", "eventos", "productos", "cobros"] as const;

/** Tipo de registro que el asistente puede detectar. */
export type IaTipo = (typeof IA_TIPOS)[number];

export const IA_TIPO_LABEL: Record<IaTipo, string> = {
  clientes: "Clientes",
  eventos: "Eventos",
  productos: "Productos",
  cobros: "Cobros",
};

/**
 * Acción de un registro detectado. La arquitectura deja lugar a más acciones
 * (hoy: crear, vincular a un existente y registrar un cobro).
 */
export type IaAccion = "crear" | "vincular" | "registrar_pago";

export const IA_ACCION_LABEL: Record<IaAccion, string> = {
  crear: "Crear nuevo",
  vincular: "Vincular a existente",
  registrar_pago: "Registrar cobro",
};

/** Candidato existente para vincular: id, nombre y confianza del match (0–100). */
export type IaCandidato = {
  id: string;
  nombre: string;
  /** Similitud 0–100 con lo detectado. */
  confianza: number;
  /** Pista del match («RUC 80012345-6», «SKU PL-001», «empresa»), si la hay. */
  detalle: string | null;
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
  /** `vincular` cuando hay un candidato claro; el dueño puede cambiarla a `crear`. */
  accion: Extract<IaAccion, "crear" | "vincular">;
  existenteId: string | null;
  existenteNombre: string | null;
  confianza: number | null;
  /** Candidatos con confianza (hasta 8). */
  candidatos: IaCandidato[];
  avisos: string[];
};

/** Evento detectado; el cliente se resuelve por nombre contra la cartera. */
export type IaEvento = {
  nombre: string;
  /** Nombre tal como apareció en el texto (para mostrar y para re-matchear). */
  clienteNombre: string | null;
  /** Cliente existente resuelto; `null` si no hubo coincidencia única. */
  clienteId: string | null;
  /** Candidatos cuando el nombre es ambiguo (hasta 8). */
  candidatos: IaCandidato[];
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
  /** SKU mencionado en el texto (solo se usa para el match; el alta no lo lleva). */
  sku: string | null;
  categoria: string;
  cantidad: number;
  /** Precios unitarios en guaraníes enteros; `null` si no venían en el texto. */
  precioLista: number | null;
  precioMayorista: number | null;
  precioMinimo: number | null;
  /** `vincular` cuando ya existe un ítem claro; el dueño puede cambiarla a `crear`. */
  accion: Extract<IaAccion, "crear" | "vincular">;
  existenteId: string | null;
  existenteNombre: string | null;
  confianza: number | null;
  candidatos: IaCandidato[];
  avisos: string[];
};

/**
 * Cobro detectado («X me pagó Y»): se registra con el endpoint de Finanzas del
 * cobro ya recibido (permiso `finance.write`). El monto y la fecha viajan
 * resueltos y con el texto original para mostrarlos en el preview.
 */
export type IaCobro = {
  accion: Extract<IaAccion, "registrar_pago">;
  clienteNombre: string | null;
  clienteId: string | null;
  candidatos: IaCandidato[];
  /** Monto resuelto en guaraníes enteros; `null` si no se pudo leer. */
  monto: number | null;
  /** El monto tal como vino en el texto («750 mil»), para el preview. */
  montoTexto: string | null;
  /** Fecha resuelta `YYYY-MM-DD` (el cobro se sella con la fecha del registro). */
  fecha: string | null;
  /** La fecha tal como vino («ayer»), para el preview. */
  fechaTexto: string | null;
  /** Método canónico de `PAYMENT_METHODS` o `null`. */
  metodo: string | null;
  referencia: string | null;
  avisos: string[];
};

/** Resultado de una pasada: lo detectado por tipo (los no pedidos van vacíos). */
export type IaAnalisis = {
  clientes: IaCliente[];
  eventos: IaEvento[];
  productos: IaProducto[];
  cobros: IaCobro[];
  /** Notas globales de la pasada (registros descartados, recortes). */
  avisos: string[];
};
