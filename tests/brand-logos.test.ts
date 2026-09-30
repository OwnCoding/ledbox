import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { brandLogos, brandSlug, logoSize } from "../lib/brand-logos";

/**
 * Franja de marcas (issue #87): el listado vive en `lib/brand-logos.ts` y el
 * logo se resuelve por archivo en `public/assets/marcas/<slug>` (asset del
 * repo). Los tests cubren el contrato que consume la landing: slug por marca,
 * lectura de medidas por formato, preferencia de extensión y —sobre todo— que
 * sin archivo (o con un archivo ilegible) nunca haya imagen rota: se cae al
 * nombre.
 */

/** PNG mínimo con la cabecera IHDR real (no hace falta que la imagen sea válida). */
function pngHead(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

/** WebP VP8X (extendido): canvas —1 en 24 bits little-endian. */
function webpVp8x(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

/** WebP VP8L (sin pérdida): firma 0x2f y medidas empaquetadas en 14+14 bits. */
function webpVp8l(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(25);
  buffer.write("RIFF", 0, "ascii");
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8L", 12, "ascii");
  buffer[20] = 0x2f;
  buffer.writeUInt32LE((width - 1) | ((height - 1) << 14), 21);
  return buffer;
}

const withTempDir = (fn: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), "lbx-marcas-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("el slug del archivo sale del nombre de la marca", () => {
  assert.equal(brandSlug("Tigo"), "tigo");
  assert.equal(brandSlug("Coca-Cola"), "coca-cola");
  assert.equal(brandSlug("Shopping del Sol"), "shopping-del-sol");
  assert.equal(brandSlug("Banco Atlas"), "banco-atlas");
  assert.equal(brandSlug("ueno"), "ueno");
  assert.equal(brandSlug("  Cervepar  "), "cervepar");
  assert.equal(brandSlug("Itaú"), "itau");
});

test("las marcas de la franja son las del pedido, en orden", () => {
  const brands = brandLogos();
  assert.deepEqual(
    brands.map((brand) => brand.name),
    ["Tigo", "Personal", "Bancard", "Cervepar", "Coca-Cola", "Pilsen", "Banco Atlas", "Claro", "ueno", "Shopping del Sol"],
  );
  assert.deepEqual(brands.map((brand) => brand.slug), ["tigo", "personal", "bancard", "cervepar", "coca-cola", "pilsen", "banco-atlas", "claro", "ueno", "shopping-del-sol"]);
});

test("los logos son assets del repo, nunca un hotlink", () => {
  for (const brand of brandLogos()) {
    if (!brand.logo) continue;
    assert.ok(brand.logo.src.startsWith("/assets/marcas/"), `${brand.name} sirve un asset del repo`);
    assert.ok(brand.logo.width > 0 && brand.logo.height > 0, `${brand.name} declara medidas`);
  }
});

test("medidas por formato: PNG, WebP extendido y sin pérdida, y SVG", () => {
  assert.deepEqual(logoSize(pngHead(1448, 1086), "png"), { width: 1448, height: 1086 });
  assert.deepEqual(logoSize(webpVp8x(300, 200), "webp"), { width: 300, height: 200 });
  assert.deepEqual(logoSize(webpVp8l(64, 32), "webp"), { width: 64, height: 32 });
  const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${body}></svg>`);
  assert.deepEqual(logoSize(svg('width="120" height="40"'), "svg"), { width: 120, height: 40 });
  assert.deepEqual(logoSize(svg('width="64px" height="32px"'), "svg"), { width: 64, height: 32 });
  assert.deepEqual(logoSize(svg('viewBox="0 0 200 80"'), "svg"), { width: 200, height: 80 });
  assert.deepEqual(logoSize(svg('width="100%" height="100%" viewBox="0 0 48 24"'), "svg"), { width: 48, height: 24 });
});

test("un archivo ilegible no se convierte en imagen rota", () => {
  assert.equal(logoSize(Buffer.from("no soy una imagen"), "png"), null);
  assert.equal(logoSize(Buffer.alloc(4), "webp"), null);
  assert.equal(logoSize(Buffer.from("<svg>"), "svg"), null);
  assert.equal(logoSize(pngHead(8, 8), "gif"), null);
});

test("sin archivo la marca cae al nombre; con archivo se resuelve el logo", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "tigo.svg"), '<svg width="120" height="40" xmlns="http://www.w3.org/2000/svg"></svg>');
    writeFileSync(join(dir, "claro.png"), Buffer.from("png roto"));
    writeFileSync(join(dir, "personal.jpg"), pngHead(10, 10));
    const brands = brandLogos(dir);
    const byName = new Map(brands.map((brand) => [brand.name, brand]));
    assert.deepEqual(byName.get("Tigo")?.logo, { src: "/assets/marcas/tigo.svg", width: 120, height: 40 });
    assert.equal(byName.get("Claro")?.logo, null, "archivo ilegible → nombre");
    assert.equal(byName.get("Personal")?.logo, null, "extensión no soportada → nombre");
    assert.equal(byName.get("Pilsen")?.logo, null, "sin archivo → nombre");
    assert.equal(brands.length, 10, "las marcas sin logo no desaparecen de la franja");
  });
});

test("con dos archivos del mismo slug gana el de extensión preferida", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "bancard.png"), pngHead(10, 10));
    writeFileSync(join(dir, "bancard.svg"), '<svg width="20" height="10" xmlns="http://www.w3.org/2000/svg"></svg>');
    writeFileSync(join(dir, "cervepar.webp"), webpVp8x(30, 30));
    writeFileSync(join(dir, "cervepar.png"), pngHead(40, 40));
    const byName = new Map(brandLogos(dir).map((brand) => [brand.name, brand]));
    assert.equal(byName.get("Bancard")?.logo?.src, "/assets/marcas/bancard.svg");
    assert.equal(byName.get("Cervepar")?.logo?.src, "/assets/marcas/cervepar.webp");
  });
});
