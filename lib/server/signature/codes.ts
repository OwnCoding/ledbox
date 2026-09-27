import { randomBytes } from "node:crypto";
import { formatSignatureCode, SIGNATURE_CODE_ALPHABET } from "@/lib/public-config";

/**
 * Código público de una solicitud de firma (issue #79): 20 caracteres (100
 * bits) del alfabeto sin ambigüedades, generados con azar del sistema y
 * agrupados de a cuatro para poder dictarlos por teléfono. Es la única
 * credencial del link `/firma/[codigo]`.
 */

const CODE_LENGTH = 20;

/** Código nuevo en grupos de cuatro (`XXXX-XXXX-XXXX-XXXX-XXXX`). */
export function generateSignatureCode(): string {
  const chars: string[] = [];
  while (chars.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      // Descarta el resto para no sesgar el alfabeto (32 símbolos: 256 / 32 = 8).
      if (byte >= 256 - (256 % SIGNATURE_CODE_ALPHABET.length)) continue;
      chars.push(SIGNATURE_CODE_ALPHABET[byte % SIGNATURE_CODE_ALPHABET.length]);
      if (chars.length === CODE_LENGTH) break;
    }
  }
  return formatSignatureCode(chars.join(""));
}
