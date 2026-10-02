import type { Metadata } from "next";
import { FinanzasModule } from "@/components/admin/modules/FinanzasModule";

export const metadata: Metadata = { title: "Finanzas · Conciliación" };

/** Conciliación bancaria contra los movimientos (issue #140): sección de `/finanzas`. */
export default function FinanzasConciliacionPage() {
  return <FinanzasModule section="conciliacion" />;
}
