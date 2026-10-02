"use client";

import { useEffect, useState } from "react";
import type { AdminTone } from "@/lib/admin-format";
import { AdminBadge } from "./AdminUI";

/**
 * Vista cuadrícula del panel (issue #57).
 *
 * Es el hermano de `AdminBoard` para los módulos que no son un pipeline por
 * estados: en lugar de columnas, tarjetas con los datos clave de la fila y el
 * pie anclado abajo (misma altura por fila). El módulo describe las tarjetas;
 * la grilla no conoce ningún endpoint ni decide acciones.
 *
 * El estado de la vista (lista ⇄ cuadrícula) lo recuerda `useAdminModuleView`
 * de `AdminBoard`: una sola mecánica para todo el panel.
 */

export type AdminCardField = {
  /** Etiqueta del dato («Cantidad», «Teléfono», «Deuda vencida»). */
  label: string;
  /** Valor ya formateado por el módulo (moneda, fecha, texto, badge). */
  value: React.ReactNode;
  /** Explicación completa del dato para el `title`. */
  title?: string;
};

export type AdminCardData = {
  id: string;
  /** Identidad de la tarjeta (ítem, cliente, proveedor). */
  title: React.ReactNode;
  /** Texto completo del encabezado para el `title`. */
  titleTooltip?: string;
  /** Línea secundaria: empresa, contacto, SKU. */
  subtitle?: string | null;
  /** Etiquetas propias de la fila (estado, tipo, avisos). */
  badges?: Array<{ label: string; tone?: AdminTone; title?: string }>;
  /** Datos clave en pares etiqueta/valor. */
  fields?: AdminCardField[];
  /** Acciones de la tarjeta; el pie queda anclado abajo. */
  footer?: React.ReactNode;
};

/**
 * Ancho máximo del layout compacto (auditoría móvil, issues #140 y #155).
 *
 * Es el mismo punto donde el shell pasa a drawer (≤980 px): en vez de exigir el
 * desplazamiento horizontal de la tabla, la lista se cuenta como tarjetas
 * (entidad, estado, fecha/monto y acción principal). En escritorio manda la
 * densidad de la tabla.
 */
export const ADMIN_COMPACT_MAX_WIDTH = 980;

/**
 * ¿La lista va en tarjetas? La regla es una sola para todo el panel: la usan
 * las listas que reemplazan su `AdminTable` por `AdminCardGrid` en pantalla
 * chica. Antes de montar devuelve `false` (el SSR no conoce la ventana), así el
 * primer render coincide con el del servidor y no hay parpadeo de hidratación.
 */
export function useAdminCompactList(maxWidth = ADMIN_COMPACT_MAX_WIDTH): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [maxWidth]);

  return compact;
}

/** Grilla de tarjetas con pie anclado: `repeat(auto-fill, minmax(15rem, 1fr))`. */
export function AdminCardGrid({ label, cards }: { label: string; cards: AdminCardData[] }) {
  return (
    <ul className="admin-cards" aria-label={label}>
      {cards.map((card) => (
        <li key={card.id} className="admin-cards-item">
          <div className="admin-cards-head">
            <span className="admin-cards-title" title={card.titleTooltip}>
              {card.title}
            </span>
            {card.badges && card.badges.length > 0 ? (
              <span className="admin-cards-badges">
                {card.badges.map((badge) => (
                  <AdminBadge key={badge.label} tone={badge.tone} title={badge.title} label={badge.title}>
                    {badge.label}
                  </AdminBadge>
                ))}
              </span>
            ) : null}
          </div>
          {card.subtitle ? <p className="admin-cards-sub">{card.subtitle}</p> : null}
          {card.fields && card.fields.length > 0 ? (
            <dl className="admin-cards-fields">
              {card.fields.map((field) => (
                <div key={field.label} className="admin-cards-field">
                  <dt>{field.label}</dt>
                  <dd title={field.title}>{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {card.footer ? <div className="admin-cards-foot">{card.footer}</div> : null}
        </li>
      ))}
    </ul>
  );
}
