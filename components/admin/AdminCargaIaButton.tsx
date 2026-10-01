"use client";

import { AdminIcon } from "./AdminIcons";

/**
 * Botón del topbar de «Carga con IA» (issue #120). Vive separado del diálogo
 * para que el shell solo cargue esta pieza: el diálogo llega diferido recién al
 * abrirlo (mismo patrón que la paleta de búsqueda).
 */
export function AdminCargaIaButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="admin-searchbtn admin-iabtn"
      onClick={onOpen}
      aria-label="Carga con IA"
      aria-haspopup="dialog"
      title="Carga con IA · pegá un texto y revisá antes de crear"
    >
      <AdminIcon name="sparkles" size={15} />
      <span className="admin-searchbtn-label">Carga con IA</span>
    </button>
  );
}
