import type { Metadata } from "next";
import { cookies } from "next/headers";
import { COOKIE_SESION, verificarSesion } from "@/lib/auth";
import { getMapaMesas, getPlatosTpv, getTicketDetalle } from "@/lib/db/queries";
import { ComanderoComanda } from "./comandero-comanda";
import { ComanderoMesas, type UsuarioComandero } from "./comandero-mesas";

export const dynamic = "force-dynamic";

// PWA propia: instalar "Añadir a pantalla de inicio" DESDE esta página crea
// la app "Comandero" (vertical, arranca aquí) — no la del TPV de tablet.
export const metadata: Metadata = {
  title: "Comandero · Taula 7",
  manifest: "/manifest-comandero.webmanifest",
  appleWebApp: { capable: true, title: "Comandero", statusBarStyle: "default" },
};

async function usuarioSesion(): Promise<UsuarioComandero> {
  const secreto = process.env.AUTH_SECRET;
  if (!secreto) return { nombre: "Propietario", rol: "admin" };
  const almacen = await cookies();
  const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
  return sesion.ok ? { nombre: sesion.nombre, rol: sesion.rol } : { nombre: "Propietario", rol: "admin" };
}

// COMANDERO: el TPV de bolsillo del camarero. Solo pasar pedidos — elegir
// mesa, marcar platos y enviarlos a cocina. Cobrar, caja y facturas se quedan
// en la tablet fija (/tpv): aquí ni aparecen.
export default async function ComanderoPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const { ticket } = await searchParams;

  if (ticket) {
    const [detalle, platos] = await Promise.all([getTicketDetalle(ticket), getPlatosTpv()]);
    if (detalle && detalle.estado === "abierto") {
      // key: al cambiar de ticket la comanda arranca de cero (estado local).
      return <ComanderoComanda key={detalle.id} ticket={detalle} platos={platos} />;
    }
    // Ticket inexistente o ya cobrado → a las mesas.
  }

  const [mapa, usuario] = await Promise.all([getMapaMesas(), usuarioSesion()]);
  return <ComanderoMesas mapa={mapa} usuario={usuario} />;
}
