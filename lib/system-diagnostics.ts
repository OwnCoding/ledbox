/**
 * Sanitización del detalle técnico (issue #169).
 *
 * `/estado/sistema` es visible para OWNER/ADMIN, pero los mensajes crudos de
 * infraestructura no tienen por qué mostrarse ahí: el error real de `pg_dump`
 * viene con `usuario@host:puerto/base` y con las versiones del cliente y del
 * servidor, y un error de Prisma puede traer la URL de conexión entera. Este
 * módulo deja el mensaje legible para el panel y el correo de alerta; el texto
 * crudo se registra solo en los logs del servidor.
 *
 * Es puro (sin I/O) para probarlo y para reusarlo desde `system-status.ts`.
 */

/** Tope defensivo: un mensaje de diagnóstico no debería ser un muro de texto. */
const MAX_DIAGNOSTIC_LENGTH = 240;

const REDACTED_DATABASE = "la base de datos";
const REDACTED_HOST = "el servidor";
const REDACTED_VERSION = "versión del motor";
const REDACTED_PATH = "ruta interna";

/**
 * Devuelve el mensaje listo para mostrar: sin coordenadas de la base
 * (usuario@host:puerto/base), sin URLs de conexión, sin versiones de PostgreSQL
 * ni de `pg_dump` y sin rutas absolutas del contenedor. Lo que no es técnico
 * queda tal cual; `null`/vacío sigue siendo `null`.
 */
export function sanitizeDiagnosticMessage(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let text = raw;

  // URLs de conexión (pueden traer usuario y contraseña).
  text = text.replace(/\b(?:postgres(?:ql)?|psql|pg|mysql|mongodb(?:\+srv)?):\/\/[^\s)"']+/gi, REDACTED_DATABASE);
  // Coordenadas `usuario@host:puerto/base` (el formato del error de pg_dump).
  text = text.replace(/\b[\w.+-]+@[\w.-]+:\d{3,5}(?:\/[\w.-]+)?/g, REDACTED_DATABASE);
  // `host:puerto` suelto (nombres con letra o IPv4; nunca un horario HH:MM).
  text = text.replace(
    /\b(?:[a-zA-Z][\w-]*(?:\.[\w-]+)*|\d{1,3}(?:\.\d{1,3}){3}):\d{3,5}\b/g,
    REDACTED_HOST,
  );
  // Versiones del motor y del cliente (`server version: 18.6`, `pg_dump version: 15.4`).
  text = text.replace(
    /\b(?:server|client|pg_dump|psql|postgres(?:ql)?)\s*version\s*[:=]?\s*\d+(?:\.\d+){0,3}/gi,
    REDACTED_VERSION,
  );
  // `PostgreSQL 18.6` / `Postgres 15`.
  text = text.replace(/\bpostgres(?:ql)?\s+\d+(?:\.\d+){1,3}/gi, "PostgreSQL");
  // La frase de desajuste no agrega versiones, pero se traduce al idioma del panel.
  text = text.replace(/\bbecause of server version mismatch\b/gi, "por un desajuste de versiones");
  text = text.replace(/\bserver version mismatch\b/gi, "desajuste de versiones");
  // Las dos versiones seguidas se leen una sola vez.
  text = text.replace(/(?:versión del motor)(?:[\s;·,]+versión del motor)+/g, REDACTED_VERSION);
  // Rutas absolutas del contenedor (`/data/backups/…`, `/usr/lib/postgresql/…`).
  text = text.replace(/(?<![\w:])\/(?:[\w.@+-]+\/)+[\w.@+-]+/g, REDACTED_PATH);

  text = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > MAX_DIAGNOSTIC_LENGTH ? `${text.slice(0, MAX_DIAGNOSTIC_LENGTH - 1).trimEnd()}…` : text;
}

/**
 * Registro del detalle crudo en los logs del servidor, una sola vez por
 * mensaje y proceso: el panel puede refrescarse muchas veces durante un
 * incidente y no queremos inundar el log. Devuelve el mensaje sanitizado.
 */
const loggedDiagnostics = new Set<string>();

export function logAndSanitizeDiagnostic(scope: string, raw: string | null | undefined): string | null {
  const clean = sanitizeDiagnosticMessage(raw);
  if (typeof raw === "string" && raw.trim() && clean !== raw.trim() && !loggedDiagnostics.has(raw)) {
    loggedDiagnostics.add(raw);
    // Log restringido del servidor: acá sí queda el detalle técnico completo.
    console.error(`[system] detalle técnico (${scope}, solo servidor): ${raw}`);
  }
  return clean;
}
