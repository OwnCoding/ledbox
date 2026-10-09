import Link from "next/link";
import { publicConfig } from "@/lib/public-config";
import { eventosSupportUrl } from "@/lib/legal";
import { APP_VERSION_LABEL } from "@/lib/version";

/**
 * Pie de página único (issue #37): la misma fuente para todas las superficies.
 *
 * - `app` (panel, demo, portal): © 2026 EventOS · … · vX.Y.Z · Desarrollado por Owncoding.
 * - `product` (landing de EventOS, legales, estado y 404): lo mismo más los
 *   enlaces legales/estado/soporte y la empresa responsable (issue #168).
 * - `company` (sitio y landing de LedBox): © 2026 LedBox · EventOS vX.Y.Z · …
 * - `portal` (presupuesto del cliente): una sola línea con la empresa (LedBox),
 *   el sitio y el crédito del producto — antes eran dos footers pegados.
 *
 * La versión sale de `lib/version.ts` (fuente única: `package.json`).
 */
export function AppFooter({ variant = "app", className }: { variant?: "app" | "product" | "company" | "portal"; className?: string }) {
  const classes = ["app-footer", `app-footer--${variant}`, className].filter(Boolean).join(" ");
  if (variant === "portal") {
    return (
      <footer className={classes}>
        <span className="app-footer-text">
          LedBox Paraguay · Tecnología visual para eventos ·{" "}
          <a href={publicConfig.siteUrl} rel="noreferrer">
            ledbox.online
          </a>
        </span>
        <span className="app-footer-credit">
          © 2026 EventOS · {APP_VERSION_LABEL} · Desarrollado por{" "}
          <a href="https://owncoding.dev" target="_blank" rel="noopener noreferrer">
            Owncoding
          </a>
        </span>
      </footer>
    );
  }
  if (variant === "product") {
    return (
      <footer className={classes}>
        <span className="app-footer-text">
          © 2026 EventOS · {APP_VERSION_LABEL} · Todos los derechos reservados
        </span>
        <nav className="app-footer-links" aria-label="Legal, estado y soporte">
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
          <Link href="/status">Estado</Link>
          <a href={eventosSupportUrl()} target="_blank" rel="noopener noreferrer">Soporte</a>
        </nav>
        <span className="app-footer-credit">
          Operado por <a href={publicConfig.siteUrl} rel="noreferrer">LedBox Paraguay</a> · Desarrollado por{" "}
          <a href="https://owncoding.dev" target="_blank" rel="noopener noreferrer">
            Owncoding
          </a>
        </span>
      </footer>
    );
  }
  return (
    <footer className={classes}>
      <span className="app-footer-text">
        {variant === "company" ? (
          <>
            © 2026 LedBox · EventOS {APP_VERSION_LABEL} · Todos los derechos reservados ·{" "}
            <a href={`${publicConfig.siteUrl}/privacidad`}>Privacidad</a>
          </>
        ) : (
          <>© 2026 EventOS · Todos los derechos reservados · {APP_VERSION_LABEL}</>
        )}
      </span>
      <span className="app-footer-credit">
        Desarrollado por{" "}
        <a href="https://owncoding.dev" target="_blank" rel="noopener noreferrer">
          Owncoding
        </a>
      </span>
    </footer>
  );
}
