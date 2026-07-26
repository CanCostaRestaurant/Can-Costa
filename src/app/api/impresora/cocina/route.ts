// Impresora de comandas de cocina — protocolo Star CloudPRNT.
//
// La impresora (Star TSP143IV, mC-Print…) se configura con esta URL y la
// SONDEA ella sola cada pocos segundos por WiFi — sin PC intermediario:
//   POST  → "¿hay trabajo?"  respondemos { jobReady, mediaTypes, jobToken }
//   GET   → "dame el trabajo" servimos el ticket en text/plain (48 col)
//   DELETE→ "impreso OK"      sellamos impresa_at y pasa al siguiente
//
// Cada pase (comanda) sale por papel UNA vez, además de en la pantalla /cocina.
// Auth: ?clave=IMPRESORA_SECRET en la URL (la impresora no sabe hacer login).
// Sin la variable en Vercel el endpoint queda INERTE (503) — se activa el día
// que llegue la impresora creando la variable y punto.
import { NextResponse, type NextRequest } from "next/server";
import { asc, isNull } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

export const maxDuration = 15;

type Autorizacion = { ok: true } | { ok: false; res: NextResponse };

function autorizar(req: NextRequest): Autorizacion {
  const secreto = process.env.IMPRESORA_SECRET;
  if (!secreto) {
    return { ok: false, res: NextResponse.json({ error: "Impresora sin configurar" }, { status: 503 }) };
  }
  if (req.nextUrl.searchParams.get("clave") !== secreto) {
    return { ok: false, res: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  return { ok: true };
}

// La comanda más antigua que aún no ha salido por papel.
async function siguientePorImprimir() {
  const db = getDb();
  if (!db) return null;
  const [fila] = await conPlazo(
    db
      .select()
      .from(schema.comandas)
      .where(isNull(schema.comandas.impresaAt))
      .orderBy(asc(schema.comandas.createdAt))
      .limit(1),
  );
  return fila ?? null;
}

// Texto plano para térmica de 80mm (48 columnas), sin acentos (codepage).
const sinAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ñÑ]/g, (c) => (c === "ñ" ? "n" : "N"));

function renderTicket(c: typeof schema.comandas.$inferSelect): string {
  const RAYA = "-".repeat(48);
  const hora = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(c.createdAt);

  const lineas: string[] = [
    "COCINA - CAN COSTA",
    RAYA,
    `${sinAcentos(c.mesaNombre).toUpperCase()}   ·   ${c.pase}o PASE   ·   ${hora}`,
    RAYA,
  ];
  for (const it of c.items) {
    const nombre = sinAcentos(it.descripcion).toUpperCase();
    if (it.quitar) {
      lineas.push(`** QUITAR ${it.cantidad}x ${nombre} **`);
    } else {
      lineas.push(`${String(it.cantidad).padStart(2)}x ${nombre}`);
    }
    if (it.nota) lineas.push(`     >> ${sinAcentos(it.nota)}`);
  }
  if (c.nota) {
    lineas.push(RAYA, `NOTA: ${sinAcentos(c.nota)}`);
  }
  lineas.push(RAYA, "", "", "");
  return lineas.join("\n");
}

// POST: la impresora pregunta si hay trabajo (y reporta su estado).
export async function POST(req: NextRequest) {
  const auth = autorizar(req);
  if (!auth.ok) return auth.res;
  try {
    const c = await siguientePorImprimir();
    return NextResponse.json({
      jobReady: c !== null,
      mediaTypes: ["text/plain"],
      ...(c ? { jobToken: c.id } : {}),
    });
  } catch (e) {
    console.error("[impresora] POST falló:", e instanceof Error ? e.message : e);
    resetDb();
    return NextResponse.json({ jobReady: false, mediaTypes: ["text/plain"] });
  }
}

// GET: la impresora recoge el trabajo.
export async function GET(req: NextRequest) {
  const auth = autorizar(req);
  if (!auth.ok) return auth.res;
  try {
    const c = await siguientePorImprimir();
    if (!c) return new NextResponse(null, { status: 404 });
    return new NextResponse(renderTicket(c), {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    console.error("[impresora] GET falló:", e instanceof Error ? e.message : e);
    resetDb();
    return new NextResponse(null, { status: 404 });
  }
}

// DELETE: la impresora confirma que salió por papel → sellamos y siguiente.
export async function DELETE(req: NextRequest) {
  const auth = autorizar(req);
  if (!auth.ok) return auth.res;
  try {
    const db = getDb();
    if (!db) return new NextResponse(null, { status: 200 });
    const token = req.nextUrl.searchParams.get("token");
    if (token) {
      await conPlazo(
        db.update(schema.comandas).set({ impresaAt: new Date() }).where(eq(schema.comandas.id, token)),
      );
    } else {
      // Sin token (firmware antiguo): sellar la más antigua pendiente.
      const c = await siguientePorImprimir();
      if (c) {
        await conPlazo(db.update(schema.comandas).set({ impresaAt: new Date() }).where(eq(schema.comandas.id, c.id)));
      }
    }
    return new NextResponse(null, { status: 200 });
  } catch (e) {
    console.error("[impresora] DELETE falló:", e instanceof Error ? e.message : e);
    resetDb();
    return new NextResponse(null, { status: 200 });
  }
}
