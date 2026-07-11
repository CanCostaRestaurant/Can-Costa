// Layout de la web pública del restaurante: añade la serif de display
// (Cormorant Garamond, la fórmula fine-dining: pesos light en mayúsculas con
// tracking ancho) sin tocar las fuentes del CRM. El nombre y los datos salen
// de los mandos (Ajustes de reservas), así que renombrar el restaurante
// actualiza la web entera sin tocar código.
import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { cargarMandos } from "@/lib/reservas/mandos-db";
import "./web.css";

const serif = Cormorant_Garamond({
  variable: "--font-serifweb",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const mandos = await cargarMandos();
  const nombre = mandos.restaurante.nombre;
  return {
    title: `${nombre} · Restaurant · Barcelona`,
    description: `${nombre} — cocina mediterránea de mercado en Barcelona. Producto de lonja y payés, fuego lento y vinos vivos. Reserva tu mesa online, sin comisiones.`,
  };
}

export default function WebLayout({ children }: { children: React.ReactNode }) {
  return <div className={serif.variable}>{children}</div>;
}
