"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { leerBuzon } from "@/lib/correo/leer-buzon";
import { procesarBufferDocumento, TAMANO_MAXIMO, TIPOS_SOPORTADOS } from "@/lib/documentos/procesar";

const CATEGORIAS_GASTO = [
  "materia_prima",
  "bebidas",
  "limpieza",
  "consumibles",
  "gestoria",
  "alquiler",
  "suministros",
  "personal",
  "otros",
] as const;
type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];

function numeroSano(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

// ── Edición de líneas en la bandeja (solo facturas en estado 'revisar') ──

async function facturaEnRevision(facturaId: string) {
  const db = getDb();
  if (!db) return null;
  const [factura] = await conPlazo(db.select().from(schema.facturas).where(eq(schema.facturas.id, facturaId)));
  return factura?.estado === "revisar" ? factura : null;
}

export async function actualizarLineaFactura(
  lineaId: string,
  facturaId: string,
  datos: { productoId?: string | null; cantidad?: number | null; precioUnitario?: number | null },
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    if (!(await facturaEnRevision(facturaId))) {
      return { ok: false, error: "Solo se pueden corregir facturas pendientes de revisar" };
    }
    const [linea] = await conPlazo(
      db.select().from(schema.facturaLineas).where(eq(schema.facturaLineas.id, lineaId)),
    );
    if (!linea || linea.facturaId !== facturaId) return { ok: false, error: "Línea no encontrada" };

    const set: Record<string, unknown> = {};
    if (datos.productoId !== undefined) set.productoId = datos.productoId;
    const cantidad =
      datos.cantidad !== undefined ? datos.cantidad : linea.cantidad ? Number(linea.cantidad) : null;
    const precio =
      datos.precioUnitario !== undefined
        ? datos.precioUnitario
        : linea.precioUnitario
          ? Number(linea.precioUnitario)
          : null;
    if (datos.cantidad !== undefined) {
      if (datos.cantidad !== null && (!Number.isFinite(datos.cantidad) || datos.cantidad <= 0)) {
        return { ok: false, error: "Cantidad no válida" };
      }
      set.cantidad = datos.cantidad?.toFixed(3) ?? null;
    }
    if (datos.precioUnitario !== undefined) {
      if (datos.precioUnitario !== null && (!Number.isFinite(datos.precioUnitario) || datos.precioUnitario < 0)) {
        return { ok: false, error: "Precio no válido" };
      }
      set.precioUnitario = datos.precioUnitario?.toFixed(4) ?? null;
    }
    // El importe de la línea se recalcula si hay cantidad y precio.
    if (cantidad !== null && precio !== null) set.total = (cantidad * precio).toFixed(2);

    await conPlazo(db.update(schema.facturaLineas).set(set).where(eq(schema.facturaLineas.id, lineaId)));
    revalidatePath("/documentos");
    return { ok: true };
  } catch (e) {
    console.error("[actualizarLineaFactura] falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

export async function eliminarLineaFactura(
  lineaId: string,
  facturaId: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    if (!(await facturaEnRevision(facturaId))) {
      return { ok: false, error: "Solo se pueden corregir facturas pendientes de revisar" };
    }
    await conPlazo(db.delete(schema.facturaLineas).where(eq(schema.facturaLineas.id, lineaId)));
    revalidatePath("/documentos");
    return { ok: true };
  } catch (e) {
    console.error("[eliminarLineaFactura] falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

export async function agregarLineaFactura(
  facturaId: string,
  datos: { descripcion: string; cantidad?: number; precioUnitario?: number; productoId?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!datos.descripcion.trim()) return { ok: false, error: "Indica la descripción de la línea" };
  try {
    if (!(await facturaEnRevision(facturaId))) {
      return { ok: false, error: "Solo se pueden corregir facturas pendientes de revisar" };
    }
    const cantidad = numeroSano(datos.cantidad ?? null);
    const precio = numeroSano(datos.precioUnitario ?? null);
    await conPlazo(
      db.insert(schema.facturaLineas).values({
        facturaId,
        productoId: datos.productoId ?? null,
        descripcion: datos.descripcion.trim().slice(0, 200),
        cantidad: cantidad?.toFixed(3) ?? null,
        precioUnitario: precio?.toFixed(4) ?? null,
        total: cantidad !== null && precio !== null ? (cantidad * precio).toFixed(2) : null,
        orden: 99,
      }),
    );
    revalidatePath("/documentos");
    return { ok: true };
  } catch (e) {
    console.error("[agregarLineaFactura] falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

// Pipeline foto/PDF → IA → factura con líneas en la bandeja (estado revisar).
// El núcleo vive en lib/documentos/procesar.ts (compartido con el buzón).
export async function procesarDocumento(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "No se recibió ningún archivo" };
  }
  if (!TIPOS_SOPORTADOS.includes(archivo.type)) {
    return { ok: false, error: "Formato no soportado: usa una foto (JPG/PNG) o un PDF" };
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return { ok: false, error: "Archivo demasiado grande (máximo 7 MB)" };
  }

  const resultado = await procesarBufferDocumento({
    base64: Buffer.from(await archivo.arrayBuffer()).toString("base64"),
    mediaType: archivo.type,
    origen: archivo.type === "application/pdf" ? "pdf" : "foto",
  });

  revalidatePath("/documentos");
  revalidatePath("/");
  return { ok: resultado.ok, error: resultado.error };
}

// Revisa el buzón de facturas a demanda (además del repaso automático diario).
export async function revisarBuzon(): Promise<{
  ok: boolean;
  error?: string;
  procesados?: number;
  aviso?: string;
}> {
  const resultado = await leerBuzon();
  if (resultado.procesados > 0) {
    revalidatePath("/documentos");
    revalidatePath("/");
  }
  return resultado;
}

// Valida una factura en bandeja: vuelca sus líneas al histórico de precios,
// actualiza el último precio de cada producto y deja la variación calculada.
export async function validarFactura(facturaId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };

  try {
    const [factura] = await conPlazo(
      db.select().from(schema.facturas).where(eq(schema.facturas.id, facturaId)),
    );
    if (!factura) return { ok: false, error: "Factura no encontrada" };
    if (factura.estado !== "revisar") return { ok: false, error: "La factura no está pendiente de revisar" };

    const lineas = await conPlazo(
      db.select().from(schema.facturaLineas).where(eq(schema.facturaLineas.facturaId, facturaId)),
    );

    const fecha = factura.fecha ?? new Date().toISOString().slice(0, 10);

    await conPlazo(
      db.transaction(async (tx) => {
      for (const linea of lineas) {
        if (!linea.productoId || !linea.precioUnitario) continue;

        const [producto] = await tx
          .select()
          .from(schema.productos)
          .where(eq(schema.productos.id, linea.productoId));
        if (!producto) continue;

        const precio = Number(linea.precioUnitario);
        const previo = producto.ultimoPrecio ? Number(producto.ultimoPrecio) : null;
        const variacion = previo && previo > 0 ? ((precio - previo) / previo) * 100 : null;

        await tx.insert(schema.precios).values({
          productoId: linea.productoId,
          precio: linea.precioUnitario,
          unidad: linea.unidad ?? producto.unidad,
          fecha,
          proveedorId: factura.proveedorId,
          facturaId: factura.id,
          lineaId: linea.id,
        });

        await tx
          .update(schema.productos)
          .set({ ultimoPrecio: linea.precioUnitario, ultimaCompra: fecha, updatedAt: new Date() })
          .where(eq(schema.productos.id, linea.productoId));

        if (variacion !== null) {
          await tx
            .update(schema.facturaLineas)
            .set({ variacionPct: variacion.toFixed(2) })
            .where(eq(schema.facturaLineas.id, linea.id));
        }
      }

      await tx
        .update(schema.facturas)
        .set({ estado: "validada", updatedAt: new Date() })
        .where(eq(schema.facturas.id, facturaId));
      }),
      15_000, // transacción con varias sentencias
    );
  } catch (e) {
    console.error("[validarFactura] falló:", e instanceof Error ? e.message : e);
    resetDb();
    return {
      ok: false,
      error: "La base de datos no responde ahora mismo — vuelve a intentarlo en unos minutos",
    };
  }

  revalidatePath("/");
  revalidatePath("/documentos");
  revalidatePath("/productos");
  revalidatePath("/incidencias");
  return { ok: true };
}

// "No es un duplicado, acéptalo": una rechazada pasa a la bandeja normal.
export async function aceptarRechazada(facturaId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    const [factura] = await conPlazo(db.select().from(schema.facturas).where(eq(schema.facturas.id, facturaId)));
    if (!factura) return { ok: false, error: "Documento no encontrado" };
    if (factura.estado !== "rechazada") return { ok: false, error: "Este documento no está rechazado" };
    await conPlazo(
      db
        .update(schema.facturas)
        .set({ estado: "revisar", motivoRechazo: null, updatedAt: new Date() })
        .where(eq(schema.facturas.id, facturaId)),
    );
    revalidatePath("/documentos");
    return { ok: true };
  } catch (e) {
    console.error("[aceptarRechazada] falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

// Eliminar un documento rechazado o con error (sus líneas caen en cascada).
export async function eliminarFactura(facturaId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  try {
    const [factura] = await conPlazo(db.select().from(schema.facturas).where(eq(schema.facturas.id, facturaId)));
    if (!factura) return { ok: false, error: "Documento no encontrado" };
    if (factura.estado !== "rechazada" && factura.estado !== "error") {
      return { ok: false, error: "Solo se pueden eliminar documentos rechazados o con error" };
    }
    await conPlazo(db.delete(schema.facturas).where(eq(schema.facturas.id, facturaId)));
    revalidatePath("/documentos");
    return { ok: true };
  } catch (e) {
    console.error("[eliminarFactura] falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}

// Tipo de documento, categoría del gasto, pagada e incidencia: editables en
// cualquier estado (haddock los pide al subir; aquí la IA los rellena y el
// usuario los corrige donde haga falta).
export async function actualizarDocumento(
  facturaId: string,
  datos: {
    tipo?: "factura" | "albaran" | "ticket";
    categoria?: CategoriaGasto | null;
    pagada?: boolean;
    incidencia?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (datos.tipo !== undefined) {
    if (!["factura", "albaran", "ticket"].includes(datos.tipo)) return { ok: false, error: "Tipo no válido" };
    set.tipo = datos.tipo;
  }
  if (datos.categoria !== undefined) {
    if (datos.categoria !== null && !CATEGORIAS_GASTO.includes(datos.categoria)) {
      return { ok: false, error: "Categoría no válida" };
    }
    set.categoria = datos.categoria;
  }
  if (datos.pagada !== undefined) set.pagada = datos.pagada;
  if (datos.incidencia !== undefined) set.incidencia = datos.incidencia?.trim() || null;

  try {
    await conPlazo(db.update(schema.facturas).set(set).where(eq(schema.facturas.id, facturaId)));
    revalidatePath("/documentos");
    revalidatePath("/incidencias");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    console.error("[actualizarDocumento] falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo" };
  }
}
