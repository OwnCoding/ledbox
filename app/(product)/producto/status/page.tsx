import type { Metadata } from "next";
import Link from "next/link";
import { ProductoShell } from "@/components/producto/ProductoShell";
import { StatusLive } from "@/components/producto/StatusLive";
import { EVENTOS_LEGAL, eventosSupportUrl } from "@/lib/legal";
import { publicConfig } from "@/lib/public-config";
import { APP_VERSION_LABEL } from "@/lib/version";

/**
 * Estado público de EventOS (issue #168): muestra la verificación real de la
 * plataforma (`/api/health`: proceso y base) sin inventar métricas ni
 * historial. El detalle interno del equipo (respaldos, versiones) sigue en el
 * panel, en Estado → Sistema, con sesión y permisos.
 */

export const metadata: Metadata = {
  title: "Estado de EventOS",
  description:
    "Estado actual del servicio EventOS: disponibilidad de la plataforma y de la base de datos, verificada en vivo, con el canal de soporte para reportar problemas.",
  alternates: { canonical: `${publicConfig.productUrl}/status` },
};

const supportUrl = eventosSupportUrl("Hola! Quiero reportar un problema con EventOS.");

export default function EstadoEventosPage() {
  return (
    <ProductoShell>
      <div className="producto-legal">
        <nav className="crumbs" aria-label="Migas de pan">
          <ol>
            <li><Link href="/">Inicio</Link></li>
            <li><span aria-current="page">Estado</span></li>
          </ol>
        </nav>

        <header className="legal-head">
          <div className="sec-kicker">Operación · Servicio EventOS</div>
          <h1 className="prod-name">Estado del servicio<span className="led">.</span></h1>
          <p className="prod-lede">
            La verificación en vivo de la plataforma: si el panel, los portales y los sitios responden y si la base
            de datos está accesible. Sin métricas inventadas: lo que ves sale del health real de EventOS.
          </p>
        </header>

        <StatusLive />

        <section className="producto-status-help" aria-labelledby="status-ayuda">
          <h2 id="status-ayuda">Si algo no funciona<span className="led">.</span></h2>
          <p>
            Reportalo por WhatsApp con el nombre de tu empresa y lo que estabas haciendo:{" "}
            <a href={supportUrl} target="_blank" rel="noopener noreferrer">{EVENTOS_LEGAL.contactPhone}</a>. Si es
            una incidencia general, la vas a ver reflejada acá.
          </p>
          <div className="producto-cta">
            <a className="producto-button" href={supportUrl} target="_blank" rel="noopener noreferrer">
              Escribir a soporte
            </a>
            <a className="producto-button producto-button--ghost" href={`${publicConfig.adminUrl}/login`}>
              Ingresar al panel
            </a>
          </div>
          <p className="producto-note">
            El equipo de la empresa ve el detalle interno (respaldos y versiones) en el panel, en Estado → Sistema.
            Versión de la aplicación: {APP_VERSION_LABEL}.
          </p>
        </section>

        <section className="producto-status-help" aria-labelledby="status-alcance">
          <h2 id="status-alcance">Qué verifica esta página<span className="led">.</span></h2>
          <ul>
            <li><strong>Plataforma web:</strong> el proceso que sirve el panel, los portales de clientes y los sitios.</li>
            <li><strong>Base de datos:</strong> la conexión de la aplicación con la base donde viven los datos.</li>
            <li><strong>Respaldos:</strong> corren a diario y su estado se revisa desde el panel (Estado → Sistema).</li>
          </ul>
          <p>
            La consulta se hace desde tu navegador cada 60 segundos contra el health público del servicio. Si la
            página no puede verificar, lo muestra como «sin conexión con la verificación» en lugar de asumir que
            todo está bien.
          </p>
        </section>
      </div>
    </ProductoShell>
  );
}
