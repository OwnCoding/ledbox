import type { Metadata } from "next";
import { FinanzasModule } from "@/components/admin/modules/FinanzasModule";

export const metadata: Metadata = { title: "Finanzas · Gastos" };

/** Gastos de la operación del período (issue #140): sección de `/finanzas`. */
export default function FinanzasGastosPage() {
  return <FinanzasModule section="gastos" />;
}
