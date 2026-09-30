/**
 * Marcas de la franja «Marcas que confiaron en LedBox» (`#marcas`, landing) —
 * issue #87.
 *
 * Fuente única: acá viven el listado y el orden de las marcas, y de acá sale el
 * logo de cada una. El archivo se busca en `public/assets/marcas/<slug>` con
 * extensión `.svg`, `.webp` o `.png` (asset del repo, sin hotlinks); sin archivo
 * —o si el archivo no se puede medir— la franja dibuja el nombre, nunca un
 * cuadro roto (`docs/REGLAS-GENERALES.md` §3).
 *
 * Solo servidor: lee el disco para resolver qué logos existen. La página de
 * landing es un componente de servidor que llama a `brandLogos()` y le pasa la
 * lista ya resuelta a la isla cliente (`components/public/LandingPage.tsx`).
 *
 * Para sumar un logo no se toca código: se guarda el archivo en
 * `public/assets/marcas/` con el slug de la marca y el próximo build lo muestra.
 */

import { closeSync, openSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";

export type BrandLogo = {
  /** URL pública del asset del repo (ej.: `/assets/marcas/tigo.svg`). */
  src: string;
  /** Medidas reales del archivo, para reservar el espacio y no mover la franja. */
  width: number;
  height: number;
};

export type Brand = {
  /** Nombre visible de la marca (el fallback cuando no hay logo). */
  name: string;
  /** Slug del archivo en `public/assets/marcas`. */
  slug: string;
  /** Logo del repo o `null` para dibujar el nombre. */
  logo: BrandLogo | null;
};

/** Marcas de la franja, en el orden en que se muestran. */
const BRANDS = [
  "Tigo",
  "Personal",
  "Bancard",
  "Cervepar",
  "Coca-Cola",
  "Pilsen",
  "Banco Atlas",
  "Claro",
  "ueno",
  "Shopping del Sol",
];

/** Extensiones aceptadas, en orden de preferencia si hay más de un archivo. */
const EXTENSIONS = ["svg", "webp", "png"] as const;
type Extension = (typeof EXTENSIONS)[number];

const MARCA_DIR = join(process.cwd(), "public", "assets", "marcas");

type Size = { width: number; height: number };

/**
 * Slug del archivo de una marca: minúsculas, sin acentos y con guiones
 * (`Coca-Cola` → `coca-cola`, `Shopping del Sol` → `shopping-del-sol`).
 */
export function brandSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Primeros bytes del archivo (marca + cabecera); `null` si no se puede leer. */
function readHead(path: string, bytes: number): Buffer | null {
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const buffer = Buffer.alloc(bytes);
    const read = readSync(fd, buffer, 0, bytes, 0);
    return buffer.subarray(0, read);
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** Medidas de un PNG: cabecera IHDR (bytes 16–24, big-endian). */
function pngSize(head: Buffer): Size | null {
  if (head.length < 24) return null;
  if (head[0] !== 0x89 || head.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

/**
 * Medidas de un WebP (VP8X extendido, VP8 con pérdida o VP8L sin pérdida).
 * Solo se usa la cabecera: no hace falta decodificar la imagen.
 */
function webpSize(head: Buffer): Size | null {
  if (head.length < 16 || head.toString("ascii", 0, 4) !== "RIFF") return null;
  if (head.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = head.toString("ascii", 12, 16);
  if (kind === "VP8X" && head.length >= 30) {
    const width = 1 + head.readUIntLE(24, 3);
    const height = 1 + head.readUIntLE(27, 3);
    return { width, height };
  }
  if (kind === "VP8 " && head.length >= 30) {
    if (head[23] !== 0x9d || head[24] !== 0x01 || head[25] !== 0x2a) return null;
    return { width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff };
  }
  if (kind === "VP8L" && head.length >= 25) {
    if (head[20] !== 0x2f) return null;
    const bits = head.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** Medidas de un SVG: `width`/`height` en px o, si no, el `viewBox`. */
function svgSize(head: string): Size | null {
  const root = head.match(/<svg[^>]*>/i)?.[0];
  if (!root) return null;
  const attribute = (name: string) => root.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
  const pixels = (value: string | undefined) => {
    const match = value?.trim().match(/^([\d.]+)\s*(?:px)?$/i);
    return match ? Math.round(Number(match[1])) : null;
  };
  const width = pixels(attribute("width"));
  const height = pixels(attribute("height"));
  if (width && height) return { width, height };
  const viewBox = attribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: Math.round(viewBox[2]), height: Math.round(viewBox[3]) };
  }
  return null;
}

/** Medidas reales de un logo a partir de su cabecera, según la extensión. */
export function logoSize(head: Buffer, extension: string): Size | null {
  if (extension === "png") return pngSize(head);
  if (extension === "webp") return webpSize(head);
  if (extension === "svg") return svgSize(head.toString("utf8"));
  return null;
}

/** Archivo ganador por slug: si hay varios, gana el de extensión preferida. */
function bestFiles(dir: string): Map<string, { extension: Extension; file: string }> {
  const best = new Map<string, { extension: Extension; file: string }>();
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return best; // todavía no hay carpeta de logos: todo cae al nombre
  }
  for (const file of files) {
    const match = /^(.+)\.(svg|webp|png)$/i.exec(file);
    if (!match) continue;
    const slug = match[1].toLowerCase();
    const extension = match[2].toLowerCase() as Extension;
    const current = best.get(slug);
    if (current && EXTENSIONS.indexOf(extension) >= EXTENSIONS.indexOf(current.extension)) continue;
    best.set(slug, { extension, file });
  }
  return best;
}

/** Logo de una marca: asset del repo medido, o `null` para caer al nombre. */
function resolveLogo(dir: string, entry: { extension: Extension; file: string } | undefined): BrandLogo | null {
  if (!entry) return null;
  const head = readHead(join(dir, entry.file), entry.extension === "svg" ? 8192 : 64);
  const size = head && logoSize(head, entry.extension);
  if (!size || size.width < 1 || size.height < 1) {
    console.warn(`[marcas] no se pudieron leer las medidas de ${entry.file}; la franja muestra el nombre.`);
    return null;
  }
  return { src: `/assets/marcas/${entry.file}`, width: size.width, height: size.height };
}

/**
 * Marcas de la franja con su logo resuelto (o `null`). Recorre el directorio de
 * assets en cada llamada: sumar un archivo no requiere tocar código.
 */
export function brandLogos(dir: string = MARCA_DIR): Brand[] {
  const files = bestFiles(dir);
  return BRANDS.map((name) => {
    const slug = brandSlug(name);
    return { name, slug, logo: resolveLogo(dir, files.get(slug)) };
  });
}
