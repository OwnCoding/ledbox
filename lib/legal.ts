import { whatsappUrl } from "@/lib/public-config";

/**
 * Datos legales y canales públicos de EventOS (issue #168).
 *
 * Una sola fuente para las páginas de privacidad, términos, estado y el pie de
 * la superficie. La identificación registral (razón social/RUC) la confirma el
 * dueño: mientras `NEXT_PUBLIC_EVENTOS_LEGAL_REGISTRATION` esté vacía, las
 * páginas no la inventan ni muestran un marcador; se completa en un solo lugar
 * cuando el dato quede aprobado.
 */
export const EVENTOS_LEGAL = {
  operator: "LedBox Paraguay",
  product: "EventOS",
  address: "Asunción, Paraguay",
  contactPhone: "+595 982 029 217",
  registration: (process.env.NEXT_PUBLIC_EVENTOS_LEGAL_REGISTRATION || "").trim(),
  privacyVersion: "02-10-2026",
  termsVersion: "02-10-2026",
} as const;

/** Canal de soporte de EventOS (el WhatsApp publicado de la empresa). */
export function eventosSupportUrl(topic = "Hola! Necesito soporte con EventOS."): string {
  return whatsappUrl(topic);
}
