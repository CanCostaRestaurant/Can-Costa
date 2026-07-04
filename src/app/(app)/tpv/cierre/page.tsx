import { redirect } from "next/navigation";

// El cierre de caja tiene su propia pantalla (/caja). Mantenemos la ruta vieja
// viva redirigiendo, por si hay enlaces guardados.
export default async function CierrePage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams;
  redirect(dia ? `/caja?dia=${encodeURIComponent(dia)}` : "/caja");
}
