/**
 * Validación pura de lo que envía el cliente al firmar (issue #79).
 *
 * La firma dibujada viaja como data URL PNG (capturada en el canvas del portal)
 * y se valida por bytes reales (magic bytes PNG) y tamaño. La tipográfica viaja
 * como el nombre escrito, con letras y separadores razonables. Todo se decide
 * acá para que el endpoint no duplique reglas.
 */

export const SIGNATURE_MAX_DRAWN_BYTES = 512 * 1024;
/** Un trazo real (aunque sea corto) pesa más que un canvas vacío. */
export const SIGNATURE_MIN_DRAWN_BYTES = 300;
export const SIGNATURE_MAX_TYPED_NAME = 120;
export const SIGNATURE_MIN_TYPED_NAME = 2;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const TYPED_NAME_PATTERN = /^[\p{L}\p{M}.'’\- ]+$/u;

export type SignatureSubmission =
  | { kind: "drawn"; data: Uint8Array; mime: "image/png" }
  | { kind: "typed"; name: string };

export type SignatureSubmissionResult =
  | { ok: true; value: SignatureSubmission; signerName: string }
  | { ok: false; error: string };

function isPng(data: Uint8Array): boolean {
  return data.length >= 8 && PNG_MAGIC.every((byte, index) => data[index] === byte);
}

/** Decodifica una data URL PNG; `null` si no tiene la forma esperada. */
export function decodePngDataUrl(input: unknown): Uint8Array | null {
  if (typeof input !== "string") return null;
  const match = input.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[1], "base64");
    return buffer.length > 0 ? new Uint8Array(buffer) : null;
  } catch {
    return null;
  }
}

/**
 * Normaliza el envío del cliente según el método configurado en la solicitud.
 * `fallbackName` es el nombre del destinatario cuando el método tipográfico no
 * trae uno (nunca se firma sin un nombre real).
 */
export function parseSignatureSubmission(
  method: string,
  raw: unknown,
  fallbackName: string,
): SignatureSubmissionResult {
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;

  if (method === "TYPED") {
    const name = String(record?.name ?? raw ?? "").replace(/\s+/g, " ").trim();
    if (name.length < SIGNATURE_MIN_TYPED_NAME) return { ok: false, error: "Escribí tu nombre completo para firmar." };
    if (name.length > SIGNATURE_MAX_TYPED_NAME) {
      return { ok: false, error: `El nombre no puede superar los ${SIGNATURE_MAX_TYPED_NAME} caracteres.` };
    }
    if (!TYPED_NAME_PATTERN.test(name)) {
      return { ok: false, error: "El nombre solo puede tener letras, espacios, puntos, guiones y apóstrofes." };
    }
    return { ok: true, value: { kind: "typed", name }, signerName: name };
  }

  // Método dibujado (el default): data URL PNG del canvas.
  const data = decodePngDataUrl(record?.dataUrl ?? raw);
  if (!data) return { ok: false, error: "No pudimos leer la firma dibujada. Probá de nuevo." };
  if (data.length < SIGNATURE_MIN_DRAWN_BYTES) return { ok: false, error: "Dibujá tu firma dentro del recuadro antes de continuar." };
  if (data.length > SIGNATURE_MAX_DRAWN_BYTES) {
    return { ok: false, error: "La firma es demasiado pesada. Limpiá el recuadro y probá de nuevo." };
  }
  if (!isPng(data)) return { ok: false, error: "La firma no es una imagen válida. Probá de nuevo." };
  return { ok: true, value: { kind: "drawn", data, mime: "image/png" }, signerName: fallbackName };
}
