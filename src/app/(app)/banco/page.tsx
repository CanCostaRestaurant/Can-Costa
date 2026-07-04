import { cookies } from "next/headers";
import { COOKIE_SESION, verificarSesion, type RolUsuario } from "@/lib/auth";
import { BancoClient } from "./banco-client";

export const dynamic = "force-dynamic";

async function rolActual(): Promise<RolUsuario> {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) return "admin";
  const almacen = await cookies();
  const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
  return sesion.ok ? sesion.rol : "admin";
}

export default async function BancoPage() {
  // A /banco solo llegan admin/gestor (proxy), así que ven las tres pestañas.
  const rol = await rolActual();
  const gestion = rol === "admin" || rol === "gestor";
  return <BancoClient mostrarRecibidas={gestion} mostrarEmitidas={gestion} />;
}
