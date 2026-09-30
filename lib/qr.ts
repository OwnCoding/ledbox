import QRCode from "qrcode";
import type { QRCodeErrorCorrectionLevel } from "qrcode";
import { QR_OPCIONES, qrDataUrl as qrDataUrlDeLibreria } from "owncoding-ui/utils";

/**
 * QR del portal del cliente (issue #12). Un solo helper: el contenido siempre
 * es la URL pública del presupuesto (`cliente.ledbox.online/p/<código>`), nunca
 * el id interno ni datos de otra empresa.
 *
 * - `qrSvg`: SVG en texto para la hoja imprimible (nítido en PDF y a cualquier
 *   tamaño, sin request extra). La librería no publica un SVG, así que se
 *   genera acá con las mismas opciones (`QR_OPCIONES`) para que el QR del
 *   papel y el del diálogo no tengan juego propio.
 * - `qrDataUrl`: PNG en data URL para el diálogo del panel; la generación
 *   delega en `qrDataUrl` de `owncoding-ui/utils` (Tanda 1 del plan #100).
 *
 * Corrección de errores media y margen mínimo: el código se lee bien impreso en
 * papel y también desde la pantalla del celular.
 */

const QR_OPTIONS = {
  // El `.d.ts` de la librería tipa `nivel` como `string`; `qrcode` usa su union.
  errorCorrectionLevel: QR_OPCIONES.nivel as QRCodeErrorCorrectionLevel,
  margin: QR_OPCIONES.margen,
} as const;

export async function qrSvg(text: string, size = 200): Promise<string> {
  return QRCode.toString(text, { ...QR_OPTIONS, type: "svg", width: size });
}

export async function qrDataUrl(text: string, size = 220): Promise<string> {
  return qrDataUrlDeLibreria(text, { ancho: size });
}
