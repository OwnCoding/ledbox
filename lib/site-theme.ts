/**
 * Tema del sitio público (27-09-2026, issue #83), sin React para usarse desde
 * el layout servidor. Igual que el portal del cliente: la preferencia vive en
 * `localStorage` y se aplica como `data-theme` en el contenedor del sitio
 * **antes del primer pintado**, así el cambio no parpadea al recargar.
 *
 * El sitio nace oscuro (identidad LedBox) y, si el visitante todavía no eligió,
 * sigue la preferencia del sistema operativo (claro → C1 · Aurora viva). No
 * tiene toggle visible: la preferencia se reserva para una decisión posterior
 * del dueño; el mecanismo ya queda listo.
 */

export const SITE_THEME_KEY = "ledbox-site-theme";
export const SITE_ROOT_ID = "site-root";

export type SiteTheme = "dark" | "light";

/**
 * Primer hijo de `.site`: fija el tema guardado —o el del sistema— antes del
 * primer pintado. Sin preferencia ni JS queda el oscuro del HTML.
 */
export const SITE_BOOT_SCRIPT = `(function(){var s=document.currentScript;var r=(s&&s.parentElement)||document.getElementById("${SITE_ROOT_ID}");if(!r||r.id!=="${SITE_ROOT_ID}")return;var t=null;try{t=window.localStorage.getItem("${SITE_THEME_KEY}");}catch(e){}if(t!=="light"&&t!=="dark"){try{t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}catch(e){t="dark";}}r.setAttribute("data-theme",t);})();`;
