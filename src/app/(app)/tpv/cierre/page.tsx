import { redirect } from "next/navigation";

// El cierre de caja se hace ahora desde Ventas (donde ya ves las ventas del
// día). Mantenemos la ruta viva redirigiendo, por si hay enlaces guardados.
export default async function CierrePage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams;
  redirect(dia ? `/ventas?dia=${encodeURIComponent(dia)}` : "/ventas");
}
