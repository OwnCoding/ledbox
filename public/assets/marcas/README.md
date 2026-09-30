# Logos de las marcas — franja «Marcas que confiaron en LedBox»

Assets oficiales de las marcas que se muestran en la franja `#marcas` de la
landing. Sin hotlinks: el archivo vive acá. La franja lo detecta sola, sin tocar
código, y dibuja el logo con `next/image` a **alto fijo de 30 px**.

## Cómo sumar un logo

1. Guardá el archivo acá con el **slug de la marca** como nombre:
   `tigo.svg`, `personal.png`, `banco-atlas.webp`, …
2. Listo: en el próximo build la franja muestra el logo. Si no hay archivo, la
   franja dibuja el nombre (nunca un cuadro roto).

Slugs de las marcas actuales (las define `lib/brand-logos.ts`):

| Marca | Archivo |
| --- | --- |
| Tigo | `tigo.*` |
| Personal | `personal.*` |
| Bancard | `bancard.*` |
| Cervepar | `cervepar.*` |
| Coca-Cola | `coca-cola.*` |
| Pilsen | `pilsen.*` |
| Banco Atlas | `banco-atlas.*` |
| Claro | `claro.*` |
| ueno | `ueno.*` |
| Shopping del Sol | `shopping-del-sol.*` |

## Formato del archivo

- `.svg` (preferido), `.webp` o `.png`, con fondo transparente.
- Tiene que declarar su tamaño: `width`/`height` o `viewBox` en el SVG; el
  PNG/WebP trae las medidas en su cabecera. Sin medidas legibles, la franja cae
  al nombre (no se muestra un cuadro roto).
- El logo se dibuja en **silueta monocroma** (el mismo gris de los nombres), así
  se ve bien en modo oscuro y claro sin subir dos variantes. Conviene un archivo
  grande (2× o más) y con los márgenes ajustados: la silueta recorta el fondo
  transparente, no la forma.
- Si hay dos archivos con el mismo slug, gana `.svg`, después `.webp` y después
  `.png`.
