import type { Metadata } from "next";
import { FinanzasModule } from "@/components/admin/modules/FinanzasModule";

export const metadata: Metadata = { title: "Finanzas · Tesorería" };

/** Cuentas y movimientos de tesorería (issue #140): sección de `/finanzas`. */
export default function FinanzasTesoreriaPage() {
  return <FinanzasModule section="tesoreria" />;
}
