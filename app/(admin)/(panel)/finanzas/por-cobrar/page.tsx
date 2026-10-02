import type { Metadata } from "next";
import { FinanzasModule } from "@/components/admin/modules/FinanzasModule";

export const metadata: Metadata = { title: "Finanzas · Por cobrar" };

/** Cobros a plazo e historial de cobros (issue #140): sección de `/finanzas`. */
export default function FinanzasPorCobrarPage() {
  return <FinanzasModule section="por-cobrar" />;
}
