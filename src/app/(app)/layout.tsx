import { cookies } from "next/headers";
import { COOKIE_SESION, verificarSesion, type RolUsuario } from "@/lib/auth";
import { FinaWidget } from "@/components/fina-widget";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const secreto = process.env.AUTH_SECRET;
  let nombre = "Propietario";
  let rol: RolUsuario = "admin";
  if (secreto) {
    const almacen = await cookies();
    const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
    if (sesion.ok) {
      nombre = sesion.nombre;
      rol = sesion.rol;
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar nombre={nombre} rol={rol} />
      <main className="max-w-[1120px] flex-1 px-10 pt-8 pb-16 max-md:px-5 max-md:pt-6">{children}</main>
      {/* Fina ve todos los números: solo para quien puede verlos */}
      {(rol === "admin" || rol === "gestor") && <FinaWidget />}
    </div>
  );
}
