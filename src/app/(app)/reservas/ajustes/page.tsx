import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cargarMandos } from "@/lib/reservas/mandos-db";
import { AjustesReservasClient } from "./ajustes-client";

export const dynamic = "force-dynamic";

export default async function AjustesReservasPage() {
  const mandos = await cargarMandos();

  return (
    <section className="anim-in">
      <Link
        href="/reservas"
        className="mb-3.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold text-ink-soft transition-colors hover:bg-chip hover:text-ink"
      >
        <ArrowLeft className="size-[15px]" />
        Reservas
      </Link>
      <AjustesReservasClient inicial={mandos} />
    </section>
  );
}
