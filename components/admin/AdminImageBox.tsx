"use client";

import { useEffect, useState } from "react";
import type { AdminIconName } from "@/lib/admin-types";
import { AdminIcon } from "./AdminIcons";

/**
 * Caja de imagen única del panel (issues #98, #109 y #125): tamaño fijo,
 * `object-fit: cover` y **fallback al ícono**: nunca queda un cuadro roto. La
 * usan la lista de inventario y el preview de la Carga con IA.
 */
export function AdminImageBox({
  imageUrl,
  size = 26,
  icon = "inventory",
  title,
}: {
  imageUrl: string | null | undefined;
  size?: number;
  /** Ícono del fallback cuando no hay imagen (o la que hay falla). */
  icon?: AdminIconName;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);

  // Una imagen nueva (otro ítem u otra URL) vuelve a intentar cargarla.
  useEffect(() => setFailed(false), [imageUrl]);

  return (
    <span className="admin-item-thumb" style={{ width: size, height: size }} aria-hidden="true" title={title}>
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <AdminIcon name={icon} size={Math.max(12, Math.round(size * 0.5))} />
      )}
    </span>
  );
}
