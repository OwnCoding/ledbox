/**
 * Consulta pública de RUC del sitio (issue #104).
 *
 * Réplica mínima del patrón del grupo (`MobOS/backend/lib/ruc.ts`): normaliza lo
 * que llega por la URL con la misma máscara del sitio (`rucInput`, issue #101),
 * valida la forma del RUC paraguayo y consulta un **proveedor configurado por
 * entorno**. En público no hay sesión ni tabla de consultas: la cuota la pone el
 * rate-limit por IP (`app/api/ruc/route.ts`) y la única huella es el bucket del
 * rate-limit (IP + ventana); no se guardan consultas ni datos.
 *
 * El proveedor se configura con `RUC_PROVEEDOR_URL` (base) y, si hace falta,
 * `RUC_PROVEEDOR_TOKEN` (Bearer). Se llama `GET <base>?ruc=<numero>` y tiene que
 * devolver `{ name, fullRuc?, simulado? }` (la forma que consume el `RucField`
 * de `owncoding-ui`). Sin proveedor configurado, el endpoint responde con un
 * error claro y `manualEntryAllowed: true`: el formulario se completa a mano.
 */

import { rucInput } from "@/lib/field-rules";

export type RucDatos = {
  /** Razón social que se ofrece en el formulario. */
  name: string;
  /** RUC completo (con dígito verificador) si el proveedor lo devuelve. */
  fullRuc?: string;
  /** Marca de resultado simulado (demo); el sitio público no la usa. */
  simulado?: boolean;
};

/** Forma del RUC paraguayo: 5 a 8 dígitos y dígito verificador opcional. */
export const RUC_PATTERN = /^\d{5,8}(-\d)?$/;

/** Normaliza el número que llega por la URL con la máscara del sitio. */
export function normalizarRuc(valor: string | null | undefined): string {
  return rucInput(String(valor ?? "").trim(), 20);
}

/** ¿Tiene forma de RUC paraguayo? (misma regla que el endpoint usa para rechazar). */
export function rucConForma(valor: string): boolean {
  return RUC_PATTERN.test(valor);
}

/** ¿Hay proveedor configurado en el entorno? */
export function proveedorRucConfigurado(): boolean {
  return Boolean(process.env.RUC_PROVEEDOR_URL);
}

/** Consulta el proveedor; `null` si no encuentra la razón social. */
export async function consultarRucProveedor(numero: string): Promise<RucDatos | null> {
  const base = process.env.RUC_PROVEEDOR_URL;
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("ruc", numero);
  const token = process.env.RUC_PROVEEDOR_TOKEN;
  const respuesta = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal: AbortSignal.timeout(6000),
    cache: "no-store",
  });
  // 404 del proveedor = no hay datos (se completa a mano), no una falla.
  if (respuesta.status === 404) return null;
  if (!respuesta.ok) throw new Error(`El proveedor de RUC respondió ${respuesta.status}.`);
  const datos = (await respuesta.json().catch(() => null)) as RucDatos | null;
  if (!datos?.name) return null;
  return {
    name: String(datos.name),
    fullRuc: datos.fullRuc ? String(datos.fullRuc) : undefined,
    simulado: datos.simulado ? true : undefined,
  };
}
