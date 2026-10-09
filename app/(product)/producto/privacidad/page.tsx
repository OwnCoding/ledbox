import type { Metadata } from "next";
import Link from "next/link";
import { ProductoShell } from "@/components/producto/ProductoShell";
import { EVENTOS_LEGAL, eventosSupportUrl } from "@/lib/legal";
import { publicConfig } from "@/lib/public-config";

/**
 * Política de privacidad de EventOS (issue #168, Ley 7593/2025): trata la
 * plataforma como producto separado del sitio de alquiler de LedBox. El texto
 * sigue el registro interno de tratamientos (`docs/PRIVACIDAD.md`); los datos
 * registrales los confirma el dueño (`EVENTOS_LEGAL.registration`) y no se
 * inventan. Es pública e indexable.
 */

export const metadata: Metadata = {
  title: "Privacidad de EventOS",
  description:
    "Cómo trata EventOS los datos de las empresas, sus clientes y el equipo: roles, finalidades, base legal, conservación, destinatarios, seguridad y derechos del titular (Ley 7593/2025).",
  alternates: { canonical: `${publicConfig.productUrl}/privacidad` },
};

const rightsUrl = eventosSupportUrl("Hola! Quiero ejercer mis derechos sobre mis datos en EventOS.");

export default function PrivacidadEventosPage() {
  return (
    <ProductoShell>
      <div className="producto-legal">
        <nav className="crumbs" aria-label="Migas de pan">
          <ol>
            <li><Link href="/">Inicio</Link></li>
            <li><span aria-current="page">Privacidad</span></li>
          </ol>
        </nav>

        <header className="legal-head">
          <div className="sec-kicker">Legales · Ley 7593/2025</div>
          <h1 className="prod-name">Privacidad de EventOS<span className="led">.</span></h1>
          <p className="prod-lede">
            Cómo trata EventOS los datos que viven en la plataforma: qué tratamos, para qué, quién responde,
            cuánto conservamos, con quién se comparte y cómo ejercer tus derechos.
          </p>
          <p className="catalog-note legal-note">
            Última actualización: {EVENTOS_LEGAL.privacyVersion}. Esta es la política de la plataforma EventOS.
            La política del sitio de alquiler de LedBox está en{" "}
            <a href={`${publicConfig.siteUrl}/privacidad`}>ledbox.online/privacidad</a>.
          </p>
        </header>

        <article className="legal-doc">
          <section aria-labelledby="legal-eventos-responsable">
            <h2 id="legal-eventos-responsable">1. Quiénes somos y qué cubre esta política<span className="led">.</span></h2>
            <p>
              <strong>EventOS</strong> es la plataforma de gestión para empresas de eventos operada por{" "}
              <strong>{EVENTOS_LEGAL.operator}</strong>, desde {EVENTOS_LEGAL.address}. Esta política aplica al
              sitio <a href={publicConfig.productUrl}>eventos.ledbox.online</a>, a la demo pública, al panel{" "}
              <a href={publicConfig.adminUrl}>app.ledbox.online</a> y a los portales de presupuesto y firma que
              las empresas comparten con sus clientes.
            </p>
            <dl className="prod-facts legal-facts">
              <div><dt>Operador</dt><dd>{EVENTOS_LEGAL.operator} · EventOS</dd></div>
              <div><dt>Domicilio</dt><dd>{EVENTOS_LEGAL.address}</dd></div>
              {EVENTOS_LEGAL.registration ? (
                <div><dt>Datos registrales</dt><dd>{EVENTOS_LEGAL.registration}</dd></div>
              ) : null}
              <div>
                <dt>Contacto</dt>
                <dd>
                  <a href={rightsUrl} target="_blank" rel="noopener noreferrer">WhatsApp {EVENTOS_LEGAL.contactPhone}</a>
                </dd>
              </div>
            </dl>
            <p>
              <strong>Roles.</strong> Cuando una empresa usa EventOS, <strong>la empresa es la responsable</strong> de
              los datos de su operación (sus clientes y contactos, eventos, presupuestos, pagos, archivos y firmas).
              LedBox trata esos datos <strong>por cuenta de la empresa</strong> —como encargado— y solo para prestar el
              servicio. Para los datos de cuenta y seguridad del equipo del panel, las consultas comerciales y la
              demo, <strong>LedBox es el responsable</strong>.
            </p>
          </section>

          <section aria-labelledby="legal-eventos-datos">
            <h2 id="legal-eventos-datos">2. Qué datos tratamos<span className="led">.</span></h2>
            <ul>
              <li>
                <strong>Cuenta y equipo:</strong> nombre, correo, rol y membresías, avatar, credenciales
                (contraseñas y PIN siempre con hash), sesiones, invitaciones y claves de API (solo se guarda su
                hash y un prefijo para listarlas).
              </li>
              <li>
                <strong>Operación de la empresa:</strong> clientes y contactos, eventos y tareas, presupuestos e
                ítems, inventario y asignaciones, proveedores y promotoras, cobros y pagos, facturas, tesorería y
                conciliación bancaria, adjuntos y comprobantes.
              </li>
              <li>
                <strong>Portales de clientes:</strong> acceso con link o token, primera vista y aprobación del
                presupuesto (con nombre y nota), pedidos de cambio, comprobantes y firma. En la firma, la IP y el
                navegador se guardan como hash con una clave secreta: nunca en claro.
              </li>
              <li>
                <strong>Demo pública:</strong> datos ficticios de una operación simulada; no se mezclan con datos
                reales y la sesión es de solo lectura.
              </li>
              <li>
                <strong>Seguridad y trazabilidad:</strong> auditoría de cambios con el actor real, registro de
                correos enviados (sin el cuerpo), límites de uso por IP y respaldos de la base.
              </li>
              <li>
                <strong>«Carga con IA» (opcional):</strong> el texto que pega un miembro del equipo se envía al
                proveedor de inteligencia artificial configurado para ordenarlo en registros que la persona revisa
                y confirma. Ese texto no se persiste en EventOS y la llamada se audita sin su contenido.
              </li>
            </ul>
          </section>

          <section aria-labelledby="legal-eventos-finalidades">
            <h2 id="legal-eventos-finalidades">3. Para qué y con qué base legal<span className="led">.</span></h2>
            <ul>
              <li>
                <strong>Prestar el servicio</strong> (crear la cuenta, gestionar eventos, presupuestos, inventario,
                cobros y portales) — ejecución del contrato entre la empresa y LedBox.
              </li>
              <li>
                <strong>Responder consultas comerciales</strong> de la landing y la demo — consentimiento, que
                podés revocar cuando quieras.
              </li>
              <li>
                <strong>Cumplir obligaciones legales, contables y fiscales</strong> cuando corresponda — cumplimiento
                de una obligación legal.
              </li>
              <li>
                <strong>Seguridad y trazabilidad</strong> (auditoría, prevención de abuso, respaldo e idempotencia
                financiera) — interés legítimo de proteger el servicio y su historial.
              </li>
            </ul>
            <p>
              No vendemos ni cedemos datos para publicidad de terceros y no tomamos decisiones automatizadas con
              efectos jurídicos sobre las personas.
            </p>
          </section>

          <section aria-labelledby="legal-eventos-conservacion">
            <h2 id="legal-eventos-conservacion">4. Minimización y conservación<span className="led">.</span></h2>
            <p>
              Pedimos y guardamos solo lo necesario para las finalidades de arriba. Los plazos vigentes son:
              consultas no convertidas, 24 meses sin actividad; auditoría, 24 meses (los eventos financieros
              acompañan al plazo fiscal); registros de correo, 12 meses; sesiones, 30 días después de vencer o
              revocarse; invitaciones, 90 días; tokens de recuperación, 30 minutos; límites de uso, 24 horas; y
              respaldos, 30 días.
            </p>
            <p>
              Los documentos con efecto contractual o fiscal (presupuestos aprobados, cobros, facturas, firmas y
              libros) se conservan durante el plazo legal aplicable —criterio operativo: 10 años— y no se purgan.
              El historial financiero no se borra: cuando un dato deja de ser necesario se bloquea o se anonimiza.
            </p>
          </section>

          <section aria-labelledby="legal-eventos-destinatarios">
            <h2 id="legal-eventos-destinatarios">5. Destinatarios y transferencias<span className="led">.</span></h2>
            <p>
              Los datos de cada empresa están aislados: no se comparten con otras empresas que usan EventOS. Pueden
              acceder a ellos, solo para operar el servicio:
            </p>
            <ul>
              <li><strong>Infraestructura:</strong> proveedores que alojan la aplicación y la base de datos.</li>
              <li><strong>Correo transaccional:</strong> el proveedor que entrega invitaciones, recuperaciones y avisos del sistema.</li>
              <li><strong>Mensajería:</strong> cuando elegís continuar por WhatsApp, el mensaje viaja por ese servicio con sus propias condiciones.</li>
              <li><strong>Asistente de IA (opcional):</strong> el proveedor que ordena el texto pegado en «Carga con IA», solo con ese texto.</li>
              <li><strong>Autoridades públicas:</strong> cuando una norma o un requerimiento válido lo exija.</li>
            </ul>
            <p>Si alguno de esos proveedores opera desde otro país, el acceso se limita a lo necesario para prestar el servicio.</p>
          </section>

          <section aria-labelledby="legal-eventos-seguridad">
            <h2 id="legal-eventos-seguridad">6. Seguridad<span className="led">.</span></h2>
            <p>
              El acceso exige sesión y cada operación se valida contra los permisos del rol y de la empresa activa.
              Las contraseñas y los PIN se guardan con hash, las claves de API solo con hash, el tráfico viaja
              cifrado (HTTPS), hay límites de uso en los accesos y enlaces públicos, y la base se respalda a diario
              con restauración probada. Si ocurre un incidente que afecte datos personales, lo evaluamos y
              comunicamos lo que corresponda a la empresa y, cuando la ley lo exija, a la autoridad de control.
            </p>
          </section>

          <section aria-labelledby="legal-eventos-derechos">
            <h2 id="legal-eventos-derechos">7. Tus derechos<span className="led">.</span></h2>
            <p>Como titular de los datos podés ejercer en cualquier momento:</p>
            <ul>
              <li><strong>Acceso:</strong> saber qué datos tuyos tratamos y con qué finalidad.</li>
              <li><strong>Rectificación:</strong> corregir los datos inexactos o incompletos.</li>
              <li><strong>Supresión:</strong> pedir que eliminemos tus datos cuando ya no sean necesarios.</li>
              <li><strong>Oposición:</strong> oponerte a tratamientos determinados, por ejemplo a comunicaciones comerciales.</li>
              <li><strong>Portabilidad:</strong> recibir tus datos en un formato legible y reutilizable.</li>
              <li><strong>Revocación del consentimiento:</strong> retirarlo en cualquier momento, sin afectar lo ya realizado.</li>
            </ul>
            <p>
              <strong>Canal:</strong> WhatsApp{" "}
              <a href={rightsUrl} target="_blank" rel="noopener noreferrer">{EVENTOS_LEGAL.contactPhone}</a>.{" "}
              <strong>Plazo:</strong> respondemos en un máximo de <strong>30 días corridos</strong>. El ejercicio es
              gratuito; solo podemos pedirte los datos mínimos para verificar tu identidad y proteger la información.
              Si sos cliente de una empresa que usa EventOS, tu pedido principal corresponde a esa empresa (es la
              responsable de su operación); igual podés escribirnos y lo canalizamos.
            </p>
          </section>

          <section aria-labelledby="legal-eventos-cambios">
            <h2 id="legal-eventos-cambios">8. Cambios en esta política<span className="led">.</span></h2>
            <p>
              Podemos actualizar esta política para reflejar cambios normativos o del servicio. Publicamos siempre la
              fecha de la última actualización y, si el cambio es significativo, lo avisamos en el panel.
            </p>
          </section>

          <section aria-labelledby="legal-eventos-autoridad">
            <h2 id="legal-eventos-autoridad">9. Autoridad de control<span className="led">.</span></h2>
            <p>
              En Paraguay, la autoridad de aplicación de la Ley 7593/2025 «De Protección de Datos Personales» es la
              Agencia Nacional de Protección de Datos Personales, dependiente del MITIC. Podés presentar allí un
              reclamo si considerás que tus derechos no fueron atendidos.
            </p>
          </section>
        </article>
      </div>
    </ProductoShell>
  );
}
