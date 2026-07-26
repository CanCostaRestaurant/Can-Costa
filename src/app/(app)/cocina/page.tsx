import type { Metadata } from "next";
import { cookies } from "next/headers";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth";
import { estadoCocina } from "./actions";
import { CocinaClient } from "./cocina-client";

export const dynamic = "force-dynamic";

// PWA propia: instalar DESDE esta página en la tablet de cocina crea la app
// "Cocina" (horizontal, icono carbón, arranca aquí) — el addon del pase.
export const metadata: Metadata = {
  title: "Cocina · Can Costa",
  manifest: "/manifest-cocina.webmanifest",
  appleWebApp: { capable: true, title: "Cocina", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-cocina.png" },
};

// La pantalla de cocina (KDS). Dos pieles según quién entra:
//  · tablets (roles tpv/chef) → kiosco oscuro a pantalla completa
//  · admin/gestor en el PC → página normal del CRM (con botón de kiosco)
// El servidor sirve la foto inicial; el cliente sondea cada pocos segundos.
async function esTabletDeCocina(): Promise<boolean> {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) return false;
  const almacen = await cookies();
  const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
  return sesion.ok && (sesion.rol === "tpv" || sesion.rol === "chef");
}

export default async function CocinaPage() {
  const [inicial, kiosco] = await Promise.all([estadoCocina(), esTabletDeCocina()]);
  return <CocinaClient inicial={inicial} kioscoInicial={kiosco} />;
}
