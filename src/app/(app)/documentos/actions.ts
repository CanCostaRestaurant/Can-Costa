"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { extraerFactura } from "@/lib/ia/extraer-factura";

const TIPOS_SOPORTADOS = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const TAMANO_MAXIMO = 7 * 1024 * 1024;

function numeroSano(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

// Pipeline foto/PDF → IA → factura con líneas en la bandeja (estado revisar).
export async function procesarDocumento(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "Falta configurar ANTHROPIC_API_KEY en el servidor" };
  }

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

  const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
  const origen = archivo.type === "application/pdf" ? ("pdf" as const) : ("foto" as const);

  let facturaId: string;
  let catalogo: { id: string; nombre: string; unidad: string }[];
  let proveedoresConocidos: { id: string; nombre: string }[];
  try {
    [catalogo, proveedoresConocidos] = await Promise.all([
      conPlazo(
        db
          .select({ id: schema.productos.id, nombre: schema.productos.nombre, unidad: schema.productos.unidad })
          .from(schema.productos)
          .where(eq(schema.productos.activo, true)),
      ),
      conPlazo(
        db.select({ id: schema.proveedores.id, nombre: schema.proveedores.nombre }).from(schema.proveedores),
      ),
    ]);
    const [creada] = await conPlazo(
      db.insert(schema.facturas).values({ estado: "procesando", origen }).returning({ id: schema.facturas.id }),
    );
    facturaId = creada.id;
  } catch (e) {
    console.error("[procesarDocumento] preparación falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo — vuelve a intentarlo" };
  }

  try {
    const datos = await conPlazo(
      extraerFactura({ base64, mediaType: archivo.type, productos: catalogo, proveedores: proveedoresConocidos }),
      120_000, // la lectura con visión puede tardar
    );

    // Proveedor: id conocido → usarlo; nombre nuevo → alta automática.
    const idsProveedores = new Set(proveedoresConocidos.map((p) => p.id));
    let proveedorId = datos.proveedor_id && idsProveedores.has(datos.proveedor_id) ? datos.proveedor_id : null;
    if (!proveedorId && datos.proveedor?.trim()) {
      const [nuevo] = await conPlazo(
        db
          .insert(schema.proveedores)
          .values({ nombre: datos.proveedor.trim() })
          .returning({ id: schema.proveedores.id }),
      );
      proveedorId = nuevo.id;
    }

    const fechaValida = datos.fecha && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? datos.fecha : null;
    await conPlazo(
      db
        .update(schema.facturas)
        .set({
          proveedorId,
          proveedorTexto: datos.proveedor ?? null,
          numero: datos.numero?.slice(0, 60) ?? null,
          fecha: fechaValida,
          base: numeroSano(datos.base)?.toFixed(2) ?? null,
          iva: numeroSano(datos.iva)?.toFixed(2) ?? null,
          total: numeroSano(datos.total)?.toFixed(2) ?? null,
          datosIa: datos,
          estado: "revisar",
          updatedAt: new Date(),
        })
        .where(eq(schema.facturas.id, facturaId)),
    );

    if (datos.lineas?.length) {
      const idsCatalogo = new Set(catalogo.map((p) => p.id));
      await conPlazo(
        db.insert(schema.facturaLineas).values(
          datos.lineas.map((l, i) => ({
            facturaId,
            productoId: l.producto_id && idsCatalogo.has(l.producto_id) ? l.producto_id : null,
            descripcion: (l.descripcion || "Línea sin descripción").slice(0, 200),
            cantidad: numeroSano(l.cantidad)?.toFixed(3) ?? null,
            unidad: l.unidad?.slice(0, 12) ?? null,
            precioUnitario: numeroSano(l.precio_unitario)?.toFixed(4) ?? null,
            total: numeroSano(l.total)?.toFixed(2) ?? null,
            orden: i + 1,
          })),
        ),
      );
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[procesarDocumento] lectura falló:", mensaje);
    await db
      .update(schema.facturas)
      .set({ estado: "error", datosIa: { error: mensaje }, updatedAt: new Date() })
      .where(eq(schema.facturas.id, facturaId))
      .catch(() => resetDb());
    revalidatePath("/documentos");
    return { ok: false, error: "No se pudo leer el documento — prueba con una foto más nítida o un PDF" };
  }

  revalidatePath("/documentos");
  revalidatePath("/");
  return { ok: true };
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
