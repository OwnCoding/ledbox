import type { Metadata } from "next";
import { FirmasModule } from "@/components/admin/modules/FirmasModule";

export const metadata: Metadata = { title: "Firmas" };

export default function FirmasPage() {
  return <FirmasModule />;
}
