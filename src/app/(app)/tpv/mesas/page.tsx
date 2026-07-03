import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHead } from "@/components/ui";
import { getDb, schema } from "@/lib/db";
import { asc } from "drizzle-orm";
import { MesasClient, type MesaFila } from "./mesas-client";

export const dynamic = "force-dynamic";

export default async function MesasPage() {
  const db = getDb();
  let mesas: MesaFila[] = [];
  if (db) {
    try {
      const filas = await db.select().from(schema.mesas).orderBy(asc(schema.mesas.orden), asc(schema.mesas.nombre));
      mesas = filas.map((m) => ({
        id: m.id,
        nombre: m.nombre,
        zona: m.zona,
        capacidad: m.capacidad,
        activo: m.activo,
      }));
    } catch {
      mesas = [];
    }
  }

  return (
    <section className="anim-in">
      <Link
        href="/tpv"
        className="mb-3.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold text-ink-soft transition-colors hover:bg-chip hover:text-ink"
      >
        <ArrowLeft className="size-[15px]" /> Volver al TPV
      </Link>
      <PageHead
        titulo="Distribución del restaurante"
        subtitulo="Mesas, zonas y capacidades · la base del futuro módulo de reservas"
      />
      <MesasClient mesas={mesas} />
    </section>
  );
}
