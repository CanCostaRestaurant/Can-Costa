// Recordatorio del día de la cita por WhatsApp. Lo dispara el cron de Vercel
// (diario) o una petición autorizada con CRON_SECRET. Para cada reserva de HOY
// que siga viva, tenga teléfono y aún no se le haya recordado, manda la
// plantilla "¿confirmas?" y apunta recordatorio_at. La confirmación (respuesta
// del cliente) la recoge el webhook /api/webhooks/whatsapp.
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { conPlazo, getDb, schema } from "@/lib/db";
import { enviarPlantillaRecordatorio } from "@/lib/whatsapp/enviar";

export const maxDuration = 60;

function hoyMadrid(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}

export async function GET(req: NextRequest) {
  const esCronVercel = req.headers.get("x-vercel-cron") !== null;
  const secreto = process.env.CRON_SECRET;
  const autorizado = esCronVercel || (secreto && req.headers.get("authorization") === `Bearer ${secreto}`);
  if (!autorizado) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "Base de datos no configurada" }, { status: 503 });

  const hoy = hoyMadrid();
  try {
    // Reservas de hoy, aún activas, con teléfono y sin recordatorio previo.
    const pendientes = await conPlazo(
      db
        .select()
        .from(schema.reservas)
        .where(
          and(
            eq(schema.reservas.fecha, hoy),
            inArray(schema.reservas.estado, ["confirmada", "sentada"]),
            isNull(schema.reservas.recordatorioAt),
          ),
        ),
    );

    let enviados = 0;
    const fallos: string[] = [];
    for (const r of pendientes) {
      if (!r.telefono?.trim()) continue;
      const res = await enviarPlantillaRecordatorio({
        telefono: r.telefono,
        nombre: r.nombre.split(" ")[0],
        hora: r.hora.slice(0, 5),
        comensales: r.comensales,
      });
      if (res.enviado) {
        await conPlazo(
          db
            .update(schema.reservas)
            .set({ recordatorioAt: new Date(), updatedAt: new Date() })
            .where(eq(schema.reservas.id, r.id)),
        );
        enviados++;
      } else {
        fallos.push(`${r.nombre}: ${res.motivo}`);
      }
    }

    return NextResponse.json({ ok: true, fecha: hoy, candidatas: pendientes.length, enviados, fallos });
  } catch (e) {
    console.error("[cron/recordatorios] falló:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "fallo al enviar recordatorios" }, { status: 500 });
  }
}
