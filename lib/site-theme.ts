/**
 * Tema de las superficies públicas (27-09-2026, issue #83; landing de EventOS,
 * issue #133), sin React para usarse desde el layout servidor. Igual que el
 * portal del cliente: la preferencia vive en `localStorage` y se aplica como
 * `data-theme` en el contenedor de la superficie **antes del primer pintado**,
 * así el cambio no parpadea al recargar.
 *
 * Las superficies nacen oscuras (identidad de marca) y, si el visitante todavía
 * no eligió, siguen la preferencia del sistema operativo (claro → C1 · Aurora
 * viva). Comparten la misma preferencia —lo que el visitante eligió en el sitio
 * vale para la landing de producto— y no tienen toggle visible: el mecanismo
 * queda listo para una decisión posterior del dueño.
 */

export const SITE_THEME_KEY = "ledbox-site-theme";
export const SITE_ROOT_ID = "site-root";
/** Raíz de la landing de EventOS (`app/(product)/producto`). */
export const PRODUCT_ROOT_ID = "producto-root";

export type SiteTheme = "dark" | "light";

/**
 * Primer hijo de la superficie: fija el tema guardado —o el del sistema— antes
 * del primer pintado. Sin preferencia ni JS queda el oscuro del HTML.
 */
export function themeBootScript(rootId: string): string {
  return `(function(){var s=document.currentScript;var r=(s&&s.parentElement)||document.getElementById("${rootId}");if(!r||r.id!=="${rootId}")return;var t=null;try{t=window.localStorage.getItem("${SITE_THEME_KEY}");}catch(e){}if(t!=="light"&&t!=="dark"){try{t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}catch(e){t="dark";}}r.setAttribute("data-theme",t);})();`;
}

export const SITE_BOOT_SCRIPT = themeBootScript(SITE_ROOT_ID);

/** Landing de EventOS: misma preferencia que el sitio, su propia raíz. */
export const PRODUCT_BOOT_SCRIPT = themeBootScript(PRODUCT_ROOT_ID);
