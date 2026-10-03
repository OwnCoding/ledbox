import Link from "next/link";
import { ProductoShell } from "@/components/producto/ProductoShell";
import { eventosSupportUrl } from "@/lib/legal";
import { publicConfig } from "@/lib/public-config";

/**
 * 404 propia de EventOS (issue #168): misma piel que la landing, código grande,
 * explicación y rutas de recuperación reales (inicio, demo, panel, legales,
 * estado, soporte y el sitio de LedBox). El `app/not-found.tsx` la elige cuando
 * la visita es de la superficie del producto.
 */
export function EventosNotFound() {
  return (
    <ProductoShell>
      <section className="producto-error" aria-labelledby="eventos-404">
        <p className="producto-kicker">EventOS · Error 404</p>
        <p className="producto-error-code" aria-hidden="true">404</p>
        <h1 id="eventos-404">
          No encontramos esa página<span>.</span>
        </h1>
        <p className="producto-lede">
          El enlace que buscás no existe, cambió de lugar o quedó mal escrito. Estas son las rutas para seguir:
        </p>

        <div className="producto-cta">
          <Link className="producto-button" href="/">
            Volver al inicio
          </Link>
          <a className="producto-button producto-button--ghost" href={publicConfig.demoUrl} target="_blank" rel="noreferrer">
            Abrir la demo
          </a>
        </div>

        <nav className="producto-error-links" aria-label="Rutas de recuperación">
          <a href={`${publicConfig.adminUrl}/login`}>Ingresar al panel</a>
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
          <Link href="/status">Estado</Link>
          <a href={eventosSupportUrl("Hola! Necesito ayuda: una página de EventOS no existe.")} target="_blank" rel="noopener noreferrer">
            Soporte
          </a>
          <a href={publicConfig.siteUrl}>Sitio de LedBox</a>
        </nav>
      </section>
    </ProductoShell>
  );
}
