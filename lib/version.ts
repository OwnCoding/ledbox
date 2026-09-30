import { hayVersionNueva, partesVersion } from "owncoding-ui/utils";

import packageJson from "../package.json";

/**
 * Fuente única de la versión visible del panel: la de `package.json`.
 * Se muestra en el pie del panel; el flujo de `prepare` (validación) y
 * `publish` (deploy en Owncoding) está documentado en el README.
 *
 * La comparación de versiones (`v2.1.9` < `v2.1.10`, con prefijos y sufijos de
 * build) delega en `owncoding-ui/utils` (Tanda 1 del plan #100): el aviso de
 * «versión nueva» será el único consumidor de `nuevaVersionDisponible` cuando
 * el panel lea la versión publicada. `partesVersion` queda como desglose para
 * el día que haga falta comparar por partes.
 */
export const APP_VERSION: string = packageJson.version;
export const APP_VERSION_LABEL = `v${APP_VERSION}`;

/** Partes numéricas de una versión (`v2.1.52+abc` → `[2, 1, 52]`). */
export { partesVersion };

/** ¿La versión publicada es más nueva que la de la app? (`hayVersionNueva` de la librería). */
export function nuevaVersionDisponible(publicada: string | null | undefined): boolean {
  return hayVersionNueva(APP_VERSION, publicada ?? "");
}
