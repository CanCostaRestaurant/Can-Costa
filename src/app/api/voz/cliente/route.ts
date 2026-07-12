// Tool del agente de voz: ¿conocemos a quien llama? Busca la ficha de
// cliente por teléfono (el del llamante o el que dicte) y devuelve lo que
// una recepcionista de verdad sabría: su nombre, si es habitual, alergias y
// preferencias apuntadas, y si ya tiene una reserva próxima (anti-duplicados).
// Es lo que hace que el agente suene "de la casa": saludar por el nombre.
import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { conPlazo, getDb, schema } from "@/lib/db";
import { autorizado, contextoFechas, fechaHablada, hoyMadrid } from "../comun";

export const maxDuration = 15;

// Comparar por los últimos 9 dígitos: "+34 602 63 86 13" == "602638613".
const nueveFinales = (t: string) => t.replace(/\D/g, "").slice(-9);

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let cuerpo: { telefono?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo JSON no válido" }, { status: 400 });
  }

  const buscado = nueveFinales(cuerpo.telefono ?? "");
  if (buscado.length < 9) {
    return NextResponse.json({ ok: false, error: "telefono debe tener al menos 9 dígitos" }, { status: 400 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, error: "Sin base de datos" }, { status: 500 });

  try {
    const candidatos = await conPlazo(
      db
        .select({
          id: schema.clientes.id,
          nombre: schema.clientes.nombre,
          telefono: schema.clientes.telefono,
          etiquetas: schema.clientes.etiquetas,
          restricciones: schema.clientes.restricciones,
          preferencias: schema.clientes.preferencias,
        })
        .from(schema.clientes)
        .where(isNotNull(schema.clientes.telefono)),
    );
    const cliente = candidatos.find((c) => nueveFinales(c.telefono ?? "") === buscado);

    if (!cliente) {
      return NextResponse.json({
        ok: true,
        conocido: false,
        mensaje: "Cliente nuevo: no le conocemos. Trato normal, sin mencionar que no está en el sistema.",
      });
    }

    const visitas = await conPlazo(
      db
        .select({
          fecha: schema.reservas.fecha,
          hora: schema.reservas.hora,
          comensales: schema.reservas.comensales,
        })
        .from(schema.reservas)
        .where(
          and(
            eq(schema.reservas.clienteId, cliente.id),
            inArray(schema.reservas.estado, ["confirmada", "sentada"]),
          ),
        )
        .orderBy(desc(schema.reservas.fecha)),
    );

    const hoy = hoyMadrid();
    const pasadas = visitas.filter((v) => v.fecha < hoy);
    const proxima = [...visitas].reverse().find((v) => v.fecha >= hoy) ?? null;

    return NextResponse.json({
      ok: true,
      conocido: true,
      ...contextoFechas(),
      nombre: cliente.nombre,
      veces_que_ha_venido: pasadas.length,
      ultima_visita: pasadas[0] ? fechaHablada(pasadas[0].fecha) : null,
      proxima_reserva: proxima
        ? {
            fecha: proxima.fecha,
            fecha_hablada: fechaHablada(proxima.fecha),
            hora: String(proxima.hora).slice(0, 5),
            comensales: proxima.comensales,
          }
        : null,
      alergias: cliente.restricciones || null,
      preferencias: cliente.preferencias || null,
      etiquetas: cliente.etiquetas ?? [],
      mensaje:
        "Cliente conocido: salúdale por su nombre con naturalidad, SIN recitar sus datos. Usa alergias/preferencias solo cuando toque. Si tiene proxima_reserva y pide reservar, comprueba que no sea un duplicado.",
    });
  } catch (e) {
    console.error("voz/cliente", e);
    return NextResponse.json({ ok: false, error: "No se pudo consultar" }, { status: 500 });
  }
}
