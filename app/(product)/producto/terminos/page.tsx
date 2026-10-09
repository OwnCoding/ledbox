import type { Metadata } from "next";
import Link from "next/link";
import { ProductoShell } from "@/components/producto/ProductoShell";
import { EVENTOS_LEGAL, eventosSupportUrl } from "@/lib/legal";
import { publicConfig } from "@/lib/public-config";

/**
 * Términos de servicio de EventOS (issue #168): condiciones del servicio para
 * las empresas que lo contratan, con el detalle comercial (planes y precios)
 * ligado a la propuesta aceptada —no se inventan valores— y las reglas de
 * cuenta, datos, disponibilidad y responsabilidad. Es pública e indexable.
 */

export const metadata: Metadata = {
  title: "Términos de EventOS",
  description:
    "Condiciones de uso del servicio EventOS: cuenta y acceso, planes y pagos, datos de la empresa, disponibilidad, soporte, propiedad intelectual, responsabilidad y ley aplicable.",
  alternates: { canonical: `${publicConfig.productUrl}/terminos` },
};

const supportUrl = eventosSupportUrl("Hola! Tengo una consulta sobre los términos de EventOS.");
const privacyUrl = `${publicConfig.productUrl}/privacidad`;

export default function TerminosEventosPage() {
  return (
    <ProductoShell>
      <div className="producto-legal">
        <nav className="crumbs" aria-label="Migas de pan">
          <ol>
            <li><Link href="/">Inicio</Link></li>
            <li><span aria-current="page">Términos</span></li>
          </ol>
        </nav>

        <header className="legal-head">
          <div className="sec-kicker">Legales · Servicio EventOS</div>
          <h1 className="prod-name">Términos de EventOS<span className="led">.</span></h1>
          <p className="prod-lede">
            Las condiciones para usar EventOS: quién puede acceder, qué se espera de cada empresa y del equipo,
            cómo se contratan los planes, qué pasa con los datos y hasta dónde llega nuestra responsabilidad.
          </p>
          <p className="catalog-note legal-note">
            Última actualización: {EVENTOS_LEGAL.termsVersion}. Al contratar o usar EventOS, la empresa acepta estos
            términos. El tratamiento de datos personales se rige por la{" "}
            <a href={privacyUrl}>política de privacidad</a>.
          </p>
        </header>

        <article className="legal-doc">
          <section aria-labelledby="legal-eventos-objeto">
            <h2 id="legal-eventos-objeto">1. Objeto y aceptación<span className="led">.</span></h2>
            <p>
              EventOS es un servicio de software en la nube para gestionar la operación de empresas de eventos:
              presupuestos y su aprobación por el cliente, eventos y checklist, inventario, proveedores, finanzas,
              tesorería y trazabilidad. Lo presta <strong>{EVENTOS_LEGAL.operator}</strong>, desde{" "}
              {EVENTOS_LEGAL.address}. Estos términos rigen para la empresa que contrata el servicio y para las
              personas que invita a su equipo.
            </p>
          </section>

          <section aria-labelledby="legal-eventos-cuenta">
            <h2 id="legal-eventos-cuenta">2. Cuenta, acceso y roles<span className="led">.</span></h2>
            <ul>
              <li>La cuenta pertenece a una <strong>empresa</strong>; las personas entran por invitación del equipo con un rol acotado ({EVENTOS_LEGAL.product} es multiempresa y cada empresa tiene sus datos aislados).</li>
              <li>El <strong>propietario de la cuenta</strong> administra usuarios, roles, empresa y claves de API, y es responsable de mantener esa administración al día.</li>
              <li>Cada persona cuida sus credenciales (contraseña, PIN y claves de API). Las claves de API se muestran una sola vez y se pueden revocar en cualquier momento.</li>
              <li>No se permite compartir accesos entre personas ni usar el servicio para suplantar a otra empresa.</li>
            </ul>
          </section>

          <section aria-labelledby="legal-eventos-uso">
            <h2 id="legal-eventos-uso">3. Uso aceptable<span className="led">.</span></h2>
            <ul>
              <li>Usar el servicio para su finalidad: gestionar la operación de la empresa y su relación con sus clientes.</li>
              <li>No intentar acceder a datos de otras empresas, vulnerar la seguridad, interferir con el servicio ni extraer información de forma masiva sin autorización.</li>
              <li>No cargar contenido ilícito ni datos personales que la empresa no tenga derecho a tratar.</li>
              <li>La <strong>demo pública</strong> es de solo lectura, con datos ficticios, y no se usa para cargar información real.</li>
            </ul>
          </section>

          <section aria-labelledby="legal-eventos-planes">
            <h2 id="legal-eventos-planes">4. Planes, límites y pagos<span className="led">.</span></h2>
            <p>
              Los planes, sus límites (por ejemplo, cantidad de usuarios o de eventos por mes) y el precio surgen de
              la <strong>propuesta comercial aceptada</strong> por la empresa. La aplicación aplica los límites del
              plan contratado de forma automática y avisa cuando el consumo se acerca al tope. La facturación, los
              plazos y los medios de pago son los de esa propuesta; ante cualquier duda, el canal de soporte
              resuelve.
            </p>
          </section>

          <section aria-labelledby="legal-eventos-datos">
            <h2 id="legal-eventos-datos">5. Datos de la empresa<span className="led">.</span></h2>
            <p>
              La información que la empresa carga en EventOS <strong>es de la empresa</strong>. LedBox la trata como
              encargado, solo para prestar el servicio, y no la usa para fines de otras empresas. El detalle de qué
              datos se tratan, cuánto se conservan y cómo se ejercen los derechos está en la{" "}
              <a href={privacyUrl}>política de privacidad</a>. La empresa puede exportar la información que la
              aplicación ofrece y pedir asistencia por el canal de soporte.
            </p>
          </section>

          <section aria-labelledby="legal-eventos-disponibilidad">
            <h2 id="legal-eventos-disponibilidad">6. Disponibilidad, mantenimiento y soporte<span className="led">.</span></h2>
            <ul>
              <li>Buscamos que el servicio esté disponible de forma continua, con mantenimiento planificado cuando haga falta; el <Link href="/status">estado del servicio</Link> se publica con la verificación real de la plataforma.</li>
              <li>Los respaldos de la base corren a diario y su restauración está probada.</li>
              <li>El soporte se atiende por el WhatsApp publicado: <a href={supportUrl} target="_blank" rel="noopener noreferrer">{EVENTOS_LEGAL.contactPhone}</a>.</li>
              <li>El servicio puede evolucionar: mejoras y ajustes no reducen las funciones esenciales contratadas.</li>
            </ul>
          </section>

          <section aria-labelledby="legal-eventos-propiedad">
            <h2 id="legal-eventos-propiedad">7. Propiedad intelectual<span className="led">.</span></h2>
            <p>
              El software, la marca EventOS, sus interfaces y su documentación pertenecen a {EVENTOS_LEGAL.operator} y
              a sus licenciantes. La empresa recibe una licencia de uso no exclusiva, por el tiempo del contrato, para
              usar el servicio con su equipo. Los datos de la empresa no se licencian: siguen siendo suyos.
            </p>
          </section>

          <section aria-labelledby="legal-eventos-responsabilidad">
            <h2 id="legal-eventos-responsabilidad">8. Responsabilidad<span className="led">.</span></h2>
            <p>
              LedBox responde por el servicio según lo pactado y la ley aplicable. La empresa es responsable de la
              veracidad de los datos que carga, de las decisiones comerciales que toma con ellos y del uso que su
              equipo hace de las credenciales. Ninguna parte responde por daños indirectos o por hechos fuera de su
              control razonable (por ejemplo, interrupciones generales de internet o de proveedores de
              infraestructura). Nada de esto limita los derechos que la ley reconoce a los titulares de datos
              personales.
            </p>
          </section>

          <section aria-labelledby="legal-eventos-cambios">
            <h2 id="legal-eventos-cambios">9. Cambios y ley aplicable<span className="led">.</span></h2>
            <p>
              Podemos actualizar estos términos para reflejar cambios del servicio o de la normativa; publicamos la
              fecha de la última actualización y, si el cambio es significativo, lo avisamos en el panel. Rigen las
              leyes de la República del Paraguay y, para cualquier controversia, la jurisdicción de Asunción.
            </p>
            <p>
              Dudas o consultas: <a href={supportUrl} target="_blank" rel="noopener noreferrer">WhatsApp {EVENTOS_LEGAL.contactPhone}</a>.
            </p>
          </section>
        </article>
      </div>
    </ProductoShell>
  );
}
