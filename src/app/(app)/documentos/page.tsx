import { cookies } from "next/headers";
import { COOKIE_SESION, verificarSesion, type RolUsuario } from "@/lib/auth";
import { getFacturas, getProductosConHistorico } from "@/lib/db/queries";
import { FacturasClient } from "./facturas-client";

export const dynamic = "force-dynamic";

// Rol de la sesión (para decidir si se ve la pestaña Emitidas/facturación).
async function rolActual(): Promise<RolUsuario> {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) return "admin";
  const almacen = await cookies();
  const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
  return sesion.ok ? sesion.rol : "admin";
}

export default async function DocumentosPage() {
  const [facturas, productos, rol] = await Promise.all([
    getFacturas(),
    getProductosConHistorico(),
    rolActual(),
  ]);
  return (
    <FacturasClient
      facturas={facturas}
      productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio }))}
      puedeEmitidas={rol === "admin" || rol === "gestor"}
    />
  );
}
