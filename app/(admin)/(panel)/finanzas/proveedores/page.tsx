import type { Metadata } from "next";
import { FinanzasModule } from "@/components/admin/modules/FinanzasModule";

export const metadata: Metadata = { title: "Finanzas · Proveedores" };

/** Cuentas por pagar y pagos a proveedores (issue #140): sección de `/finanzas`. */
export default function FinanzasProveedoresPage() {
  return <FinanzasModule section="proveedores" />;
}
