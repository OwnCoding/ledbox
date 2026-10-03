import { headers } from "next/headers";
import Link from "next/link";
import { EventosNotFound } from "@/components/producto/EventosNotFound";
import { siteProfileForHost } from "@/lib/public-config";

/**
 * 404 raíz: cada superficie muestra su identidad (issue #168). En el host de
 * EventOS —o al previsualizar `/producto/*` en desarrollo— va la 404 del
 * producto con sus rutas de recuperación; en el resto, la tarjeta genérica.
 * El middleware deja `x-pathname` en la request, así el 404 de desarrollo sabe
 * de qué superficie es aun sin el subdominio.
 */
export default async function NotFound() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "";
  const pathname = requestHeaders.get("x-pathname") || "";
  const onEventos = siteProfileForHost(host).kind === "eventos" || pathname === "/producto" || pathname.startsWith("/producto/");
  if (onEventos) return <EventosNotFound />;
  return <main className="not-found-page"><div className="not-found-card"><span className="admin-card-index">LedBox · 404</span><p className="not-found-code">404</p><h1>Página no encontrada</h1><p>El enlace que buscás no existe o fue movido.</p><Link className="btn-led" href="/">Volver al inicio →</Link></div></main>;
}
