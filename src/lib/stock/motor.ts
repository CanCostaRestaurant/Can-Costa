// Motor de stock: mueve el inventario teórico con las operaciones reales.
//   ENTRADA  al validar una factura/albarán (mismo criterio fuente_productos
//            que el histórico de precios, para NO contar dos veces la misma
//            mercancía cuando llegan el albarán Y su factura).
//   VENTA    al cobrar un ticket: expande el escandallo de cada plato (espejo
//            EXACTO de la matemática de coste: merma incluida y sub-recetas de
//            un nivel) y descuenta los productos consumidos.
//   AJUSTE   al hacer un recuento físico: iguala el teórico a lo contado y
//            apunta la DESVIACIÓN (contado − teórico) en stock_recuentos.
// Todo idempotente: índices únicos parciales (un ticket/factura solo mueve una
// vez cada producto) + ON CONFLICT DO NOTHING; el stock denormalizado solo se
// toca por los movimientos que de verdad se insertaron. Las funciones de
// entrada/venta son BEST-EFFORT: nunca deben romper el cobro ni la validación.
import { and, eq, inArray, sql } from "drizzle-orm";
import { conPlazo, getDb, schema } from "@/lib/db";
import { convertirAUnidadProducto } from "./unidades";

type Db = NonNullable<ReturnType<typeof getDb>>;

type Movimiento = {
  productoId: string;
  tipo: "entrada" | "venta" | "ajuste" | "merma";
  cantidad: number; // + entrada, − venta/merma, ± ajuste
  facturaId?: string;
  ticketId?: string;
  recuentoId?: string;
  nota?: string;
};

// Inserta cada movimiento y actualiza productos.stock en UNA sola sentencia
// (CTE): o entran los dos efectos o ninguno — no puede quedar el libro mayor
// desincronizado del stock aunque la función muera a mitad. El ON CONFLICT
// (índices únicos parciales por ticket/factura+producto) hace el reintento
// inocuo: si el movimiento ya estaba, el UPDATE no toca nada.
async function aplicarMovimientos(db: Db, movimientos: Movimiento[]): Promise<number> {
  let aplicados = 0;
  for (const m of movimientos) {
    if (!Number.isFinite(m.cantidad) || Math.abs(m.cantidad) < 0.0005) continue;
    const res = await conPlazo(
      db.execute(sql`
        with ins as (
          insert into stock_movimientos (producto_id, tipo, cantidad, factura_id, ticket_id, recuento_id, nota)
          values (
            ${m.productoId}, ${m.tipo}::stock_mov_tipo, ${m.cantidad.toFixed(3)}::numeric,
            ${m.facturaId ?? null}, ${m.ticketId ?? null}, ${m.recuentoId ?? null},
            ${m.nota?.slice(0, 200) ?? null}
          )
          on conflict do nothing
          returning cantidad
        )
        update productos p
           set stock = coalesce(p.stock, 0) + ins.cantidad,
               updated_at = now()
          from ins
         where p.id = ${m.productoId}
        returning p.id
      `),
    );
    if ((res as unknown as unknown[]).length > 0) aplicados++;
  }
  return aplicados;
}

// ── ENTRADA: factura/albarán validado ───────────────────────────────────────

export async function registrarEntradaStock(db: Db, facturaId: string): Promise<{ aplicados: number }> {
  const [factura] = await conPlazo(db.select().from(schema.facturas).where(eq(schema.facturas.id, facturaId)));
  if (!factura) return { aplicados: 0 };

  // Mismo criterio que el histórico de precios: el proveedor dice qué documento
  // "cuenta" (albaranes por defecto; facturas si sus albaranes van sin importes).
  // Así validar el albarán Y su factura no duplica la mercancía.
  let fuente: "albaranes" | "facturas" = "albaranes";
  if (factura.proveedorId) {
    const [prov] = await conPlazo(
      db.select().from(schema.proveedores).where(eq(schema.proveedores.id, factura.proveedorId)),
    );
    if (prov) fuente = prov.fuenteProductos;
  }
  const cuenta = fuente === "facturas" ? factura.tipo === "factura" : factura.tipo !== "factura";
  if (!cuenta) return { aplicados: 0 };

  const lineas = await conPlazo(
    db.select().from(schema.facturaLineas).where(eq(schema.facturaLineas.facturaId, facturaId)),
  );
  const conProducto = lineas.filter((l) => l.productoId && l.cantidad !== null);
  if (conProducto.length === 0) return { aplicados: 0 };

  const productos = await conPlazo(
    db
      .select({ id: schema.productos.id, unidad: schema.productos.unidad })
      .from(schema.productos)
      .where(inArray(schema.productos.id, [...new Set(conProducto.map((l) => l.productoId!))])),
  );
  const unidadDe = new Map(productos.map((p) => [p.id, p.unidad]));

  // Varias líneas del mismo producto en una factura → se agregan (el índice
  // único es por factura+producto, así que el movimiento debe ir sumado).
  const porProducto = new Map<string, number>();
  for (const l of conProducto) {
    const unidad = unidadDe.get(l.productoId!);
    if (!unidad) continue;
    const cant = convertirAUnidadProducto(Number(l.cantidad), l.unidad, unidad);
    if (cant === null) continue; // unidad rara ("caja"…): mejor no sumar que sumar mal
    porProducto.set(l.productoId!, (porProducto.get(l.productoId!) ?? 0) + cant);
  }

  const movimientos: Movimiento[] = [...porProducto.entries()].map(([productoId, cantidad]) => ({
    productoId,
    tipo: "entrada",
    cantidad,
    facturaId,
    nota: factura.numero ? `${factura.tipo} ${factura.numero}` : factura.tipo,
  }));
  const aplicados = await aplicarMovimientos(db, movimientos);
  return { aplicados };
}

// ── VENTA: ticket cobrado → consumo vía escandallos ─────────────────────────

// Consumo de productos por 1 ración de cada plato, espejo EXACTO del coste:
//   directo:      cantidad_i × (1 + merma_plato/100) / raciones_plato
//   vía sub-receta: × cantidad_prep × (1 + merma_prep/100) / raciones_prep
// (un solo nivel de sub-recetas, igual que el cálculo de coste). Devuelve
// Map platoId → Map productoId → cantidad por ración.
async function consumoPorRacion(db: Db, platoIds: string[]): Promise<Map<string, Map<string, number>>> {
  const resultado = new Map<string, Map<string, number>>();
  if (platoIds.length === 0) return resultado;

  const lineas = await conPlazo(
    db
      .select()
      .from(schema.platoIngredientes)
      .where(inArray(schema.platoIngredientes.platoId, platoIds)),
  );

  const prepIds = [...new Set(lineas.map((l) => l.preparacionId).filter((x): x is string => x !== null))];
  const [platos, lineasPrep] = await Promise.all([
    conPlazo(
      db
        .select({ id: schema.platos.id, mermaPct: schema.platos.mermaPct, raciones: schema.platos.raciones })
        .from(schema.platos)
        // Solo ACTIVOS: el cálculo de coste ignora platos/preparaciones
        // desactivados (valen 0 €) — el stock debe espejarlo y no descontar.
        .where(and(inArray(schema.platos.id, [...new Set([...platoIds, ...prepIds])]), eq(schema.platos.activo, true))),
    ),
    prepIds.length
      ? conPlazo(
          db.select().from(schema.platoIngredientes).where(inArray(schema.platoIngredientes.platoId, prepIds)),
        )
      : Promise.resolve([]),
  ]);
  const meta = new Map(platos.map((p) => [p.id, { merma: Number(p.mermaPct), raciones: Number(p.raciones) || 1 }]));
  const ingsDePrep = new Map<string, typeof lineasPrep>();
  for (const l of lineasPrep) {
    const lista = ingsDePrep.get(l.platoId) ?? [];
    lista.push(l);
    ingsDePrep.set(l.platoId, lista);
  }

  for (const platoId of platoIds) {
    const m = meta.get(platoId);
    if (!m) continue;
    const factorPlato = (1 + m.merma / 100) / m.raciones;
    const consumo = new Map<string, number>();
    const suma = (productoId: string, cant: number) =>
      consumo.set(productoId, (consumo.get(productoId) ?? 0) + cant);

    for (const l of lineas.filter((x) => x.platoId === platoId)) {
      const cant = l.cantidad !== null ? Number(l.cantidad) : 0;
      if (l.productoId && cant > 0) {
        suma(l.productoId, cant * factorPlato);
      } else if (l.preparacionId && cant > 0) {
        const mp = meta.get(l.preparacionId);
        if (!mp) continue; // preparación desactivada: igual que el coste (0)
        const factorPrep = (1 + mp.merma / 100) / mp.raciones;
        for (const lp of ingsDePrep.get(l.preparacionId) ?? []) {
          const cantP = lp.cantidad !== null ? Number(lp.cantidad) : 0;
          if (lp.productoId && cantP > 0) {
            suma(lp.productoId, cant * factorPlato * cantP * factorPrep);
          }
          // prep dentro de prep: NO se expande (igual que el coste, un nivel)
        }
      }
      // líneas de coste fijo: sin consumo físico
    }
    resultado.set(platoId, consumo);
  }
  return resultado;
}

export async function registrarSalidaStock(db: Db, ticketId: string): Promise<{ aplicados: number }> {
  const lineas = await conPlazo(
    db.select().from(schema.ticketLineas).where(eq(schema.ticketLineas.ticketId, ticketId)),
  );
  const conPlato = lineas.filter((l) => l.platoId !== null);
  if (conPlato.length === 0) return { aplicados: 0 };

  const consumos = await consumoPorRacion(db, [...new Set(conPlato.map((l) => l.platoId!))]);

  const porProducto = new Map<string, number>();
  for (const l of conPlato) {
    const porRacion = consumos.get(l.platoId!);
    if (!porRacion) continue;
    for (const [productoId, cant] of porRacion) {
      porProducto.set(productoId, (porProducto.get(productoId) ?? 0) + cant * l.cantidad);
    }
  }

  const movimientos: Movimiento[] = [...porProducto.entries()].map(([productoId, cantidad]) => ({
    productoId,
    tipo: "venta",
    cantidad: -cantidad,
    ticketId,
  }));
  const aplicados = await aplicarMovimientos(db, movimientos);
  return { aplicados };
}

// ── AJUSTE: recuento físico → desviación ────────────────────────────────────

export async function recontarProducto(
  db: Db,
  productoId: string,
  contado: number,
  contadoPor: string | null,
): Promise<{ ok: boolean; desviacion: number; error?: string }> {
  // Todo dentro de la transacción, con la fila del producto BLOQUEADA
  // (for update): una venta que llegue a la vez espera y no se pisa el stock.
  const resultado = await conPlazo(
    db.transaction(async (tx) => {
      const [producto] = await tx
        .select()
        .from(schema.productos)
        .where(eq(schema.productos.id, productoId))
        .for("update");
      if (!producto) return null;

      // Primer recuento de la vida del producto: inicializa el stock sin
      // apuntar desviación (no había teórico con el que comparar).
      const inicial = producto.stock === null;
      const teorico = inicial ? contado : Number(producto.stock);
      const desviacion = Math.round((contado - teorico) * 1000) / 1000;

      const [recuento] = await tx
        .insert(schema.stockRecuentos)
        .values({
          productoId,
          teorico: teorico.toFixed(3),
          contado: contado.toFixed(3),
          desviacion: desviacion.toFixed(3),
          contadoPor,
        })
        .returning({ id: schema.stockRecuentos.id });

      if (desviacion !== 0) {
        await tx.insert(schema.stockMovimientos).values({
          productoId,
          tipo: "ajuste",
          cantidad: desviacion.toFixed(3),
          recuentoId: recuento.id,
          nota: inicial ? "recuento inicial" : "recuento",
        });
      }

      await tx
        .update(schema.productos)
        .set({ stock: contado.toFixed(3), updatedAt: new Date() })
        .where(eq(schema.productos.id, productoId));

      return { desviacion };
    }),
  );

  if (!resultado) return { ok: false, desviacion: 0, error: "Producto no encontrado" };
  return { ok: true, desviacion: resultado.desviacion };
}

// ── MERMA manual: "se cayó una caja", "se pasó de fecha"… ───────────────────
// Movimiento negativo directo con su motivo, sin esperar al recuento. Usa la
// misma sentencia atómica que el resto de movimientos.

export async function apuntarMermaProducto(
  db: Db,
  productoId: string,
  cantidad: number,
  motivo: string | null,
  quien: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { ok: false, error: "Cantidad no válida" };
  const nota = [motivo?.trim() || "merma", quien ? `(${quien})` : null].filter(Boolean).join(" ");
  const aplicados = await aplicarMovimientos(db, [
    { productoId, tipo: "merma", cantidad: -cantidad, nota },
  ]);
  return aplicados > 0 ? { ok: true } : { ok: false, error: "No se pudo apuntar la merma" };
}
