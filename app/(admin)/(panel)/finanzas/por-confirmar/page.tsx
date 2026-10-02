import type { Metadata } from "next";
import { FinanzasModule } from "@/components/admin/modules/FinanzasModule";

export const metadata: Metadata = { title: "Finanzas · Por confirmar" };

/** Pagos esperados del portal por confirmar (issue #140): sección de `/finanzas`. */
export default function FinanzasPorConfirmarPage() {
  return <FinanzasModule section="por-confirmar" />;
}
