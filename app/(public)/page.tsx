import { LandingPage } from "@/components/public/LandingPage";
import { brandLogos } from "@/lib/brand-logos";

/**
 * Landing pública. Página de servidor (issue #87): resuelve una sola vez los
 * logos de la franja `#marcas` desde `public/assets/marcas` y se los pasa a la
 * isla cliente, que mantiene carrito, diálogos y resto de la interactividad.
 */
export default function HomePage() {
  return <LandingPage brands={brandLogos()} />;
}
