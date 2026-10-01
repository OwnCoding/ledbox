"use client";

import { detectInventoryImageMime, INVENTORY_IMAGE_MAX_BYTES } from "./admin-types";

/**
 * Preparación de la foto del ítem en el navegador (issue #109), con el mismo
 * patrón del comprobante del portal (`portal-proof-image.ts`): la firma real se
 * valida por **magic bytes** y la foto se comprime con canvas, sin librerías,
 * conservando su relación de aspecto. Viaja al panel como **multipart**; el
 * servidor vuelve a validar el contenido y el tope de 2 MB.
 */

const PHOTO_MAX_SIDE = 1600;
/** Calidades de salida: se baja hasta entrar en el tope de 2 MB. */
const QUALITIES = [0.82, 0.7, 0.55];

export type PreparedInventoryPhoto = {
  blob: Blob;
  /** Nombre del archivo del multipart (el servidor decide el tipo por contenido). */
  fileName: string;
  /** Vista previa local (data URL) mientras la foto no está guardada. */
  dataUrl: string;
};

export type PrepareInventoryPhotoResult =
  | { ok: true; photo: PreparedInventoryPhoto }
  | { ok: false; error: string };

type LoadedImage = { image: CanvasImageSource; width: number; height: number; release: () => void };

async function loadImageSource(file: Blob): Promise<LoadedImage | null> {
  if (typeof createImageBitmap === "function") {
    try {
      // `from-image` respeta la orientación EXIF de las fotos de celular.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Safari viejo o formato raro: se reintenta con `<img>`.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("No pudimos leer la imagen."));
      element.src = url;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/** Valida y prepara la foto elegida en el navegador (canvas, sin librerías). */
export async function prepareInventoryPhoto(file: File): Promise<PrepareInventoryPhotoResult> {
  if (file.size === 0) return { ok: false, error: "El archivo está vacío; probá con otra foto." };
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!detectInventoryImageMime(header)) {
    return { ok: false, error: "El archivo no es un JPG, PNG o WebP real: revisá que no esté renombrado." };
  }

  const loaded = await loadImageSource(file);
  if (!loaded || loaded.width < 1 || loaded.height < 1) {
    loaded?.release();
    return { ok: false, error: "No pudimos leer la imagen; probá con otra foto." };
  }

  try {
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(loaded.width, loaded.height));
    const width = Math.max(1, Math.round(loaded.width * scale));
    const height = Math.max(1, Math.round(loaded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { ok: false, error: "No pudimos procesar la imagen en este navegador." };
    context.drawImage(loaded.image, 0, 0, width, height);

    let blob: Blob | null = null;
    for (const quality of QUALITIES) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size > 0 && blob.size <= INVENTORY_IMAGE_MAX_BYTES) break;
    }
    if (!blob || blob.size === 0) return { ok: false, error: "No pudimos comprimir la foto; probá con otra." };
    if (blob.size > INVENTORY_IMAGE_MAX_BYTES) {
      return { ok: false, error: "La foto sigue superando los 2 MB después de comprimirla; probá con otra." };
    }

    const dataUrl = await blobToDataUrl(blob);
    if (!dataUrl) return { ok: false, error: "No pudimos preparar la foto; probá de nuevo." };
    return {
      ok: true,
      photo: { blob, fileName: blob.type === "image/png" ? "foto.png" : "foto.webp", dataUrl },
    };
  } finally {
    loaded.release();
  }
}
