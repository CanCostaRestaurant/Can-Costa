import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { conPlazo, getDb, resetDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Diagnóstico: ping a la BD desde la propia función de Vercel.
// Devuelve el error EXACTO y la latencia — imprescindible para distinguir
// "socket colgado" de "la BD rechaza" durante incidencias del pooler.
export async function GET() {
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, error: "sin DATABASE_URL" });

  const t0 = Date.now();
  try {
    await conPlazo(db.execute(sql`select 1`), 9_000);
    return NextResponse.json({ ok: true, ms: Date.now() - t0 });
  } catch (e) {
    resetDb();
    return NextResponse.json({
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
