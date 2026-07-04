import { cookies } from "next/headers";
import { COOKIE_SESION, verificarSesion, type RolUsuario } from "@/lib/auth";
import { getFacturasEmitidas } from "@/lib/db/queries";
import { FacturacionClient } from "./facturacion-client";

export const dynamic = "force-dynamic";

// Rol de la sesión (para decidir si se ve la pestaña Recibidas/documentos).
async function rolActual(): Promise<RolUsuario> {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) return "admin";
  const almacen = await cookies();
  const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
  return sesion.ok ? sesion.rol : "admin";
}

function mesActualMadrid(): string {
  // "YYYY-MM" en la zona de Madrid.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
}

export default async function FacturacionPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  const elegido = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : mesActualMadrid();
  const [datos, rol] = await Promise.all([getFacturasEmitidas(elegido), rolActual()]);
  return <FacturacionClient datos={datos} puedeRecibidas={rol === "admin" || rol === "gestor"} />;
}
