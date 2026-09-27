"use client";

import { AdminIcon } from "@/components/admin/AdminIcons";

/**
 * Barra de las páginas imprimibles del portal (issue #79): el botón que abre el
 * diálogo del navegador para imprimir o guardar en PDF, y el enlace de vuelta.
 * Se oculta al imprimir (`portal-print-hide` en `@media print`).
 */
export function PortalPrintBar({ backHref, label }: { backHref: string; label?: string }) {
  return (
    <div className="portal-print-bar portal-print-hide">
      <a className="portal-btn portal-btn--ghost" href={backHref}>
        <AdminIcon name="arrow-left" size={14} />
        Volver
      </a>
      <span className="portal-dialog-spacer" />
      <button type="button" className="portal-btn portal-btn--primary" onClick={() => window.print()}>
        <AdminIcon name="print" size={14} />
        {label ?? "Imprimir o guardar PDF"}
      </button>
    </div>
  );
}
