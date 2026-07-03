// Repaso automático del buzón de facturas. Lo dispara el cron de Vercel
// (diario en plan Hobby) o una petición autorizada con el secreto.
import { NextResponse, type NextRequest } from "next/server";
import { leerBuzon } from "@/lib/correo/leer-buzon";

export const maxDuration = 300; // varios adjuntos con visión pueden tardar

export async function GET(req: NextRequest) {
  const esCronVercel = req.headers.get("x-vercel-cron") !== null;
  const secreto = process.env.CRON_SECRET;
  const autorizado =
    esCronVercel || (secreto && req.headers.get("authorization") === `Bearer ${secreto}`);
  if (!autorizado) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const resultado = await leerBuzon();
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}
