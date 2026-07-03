// Núcleo del pipeline de ingesta de documentos: base64 → IA → factura con
// líneas en la bandeja (o Rechazadas si es un duplicado). Lo usan el
// dropzone de /documentos y el lector del buzón de correo.
import { and, eq, ne } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";
import { extraerFactura } from "@/lib/ia/extraer-factura";

export const TIPOS_SOPORTADOS = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
export const TAMANO_MAXIMO = 7 * 1024 * 1024;

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

export async function procesarBufferDocumento(entrada: {
  base64: string;
  mediaType: string;
  origen: "foto" | "pdf" | "email" | "manual";
}): Promise<{ ok: boolean; error?: string; facturaId?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Base de datos no configurada" };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "Falta configurar ANTHROPIC_API_KEY en el servidor" };
  }

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
      db
        .insert(schema.facturas)
        .values({ estado: "procesando", origen: entrada.origen })
        .returning({ id: schema.facturas.id }),
    );
    facturaId = creada.id;
  } catch (e) {
    console.error("[procesarBufferDocumento] preparación falló:", e instanceof Error ? e.message : e);
    resetDb();
    return { ok: false, error: "La base de datos no responde ahora mismo — vuelve a intentarlo" };
  }

  try {
    const datos = await conPlazo(
      extraerFactura({
        base64: entrada.base64,
        mediaType: entrada.mediaType,
        productos: catalogo,
        proveedores: proveedoresConocidos,
      }),
      120_000, // la lectura con visión puede tardar
    );

    // Proveedor: id conocido → usarlo; nombre nuevo → alta automática con la
    // categoría de gasto que haya inferido la IA.
    const idsProveedores = new Set(proveedoresConocidos.map((p) => p.id));
    let proveedorId = datos.proveedor_id && idsProveedores.has(datos.proveedor_id) ? datos.proveedor_id : null;
    if (!proveedorId && datos.proveedor?.trim()) {
      const categoriaNueva = CATEGORIAS_GASTO.includes(datos.categoria_proveedor as CategoriaGasto)
        ? (datos.categoria_proveedor as CategoriaGasto)
        : "materia_prima";
      const [nuevo] = await conPlazo(
        db
          .insert(schema.proveedores)
          .values({ nombre: datos.proveedor.trim(), categoria: categoriaNueva })
          .returning({ id: schema.proveedores.id }),
      );
      proveedorId = nuevo.id;
    }

    const fechaValida = datos.fecha && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? datos.fecha : null;
    const tipo = datos.tipo === "albaran" || datos.tipo === "ticket" ? datos.tipo : "factura";
    const numero = datos.numero?.slice(0, 60) ?? null;
    const totalTxt = numeroSano(datos.total)?.toFixed(2) ?? null;

    // Duplicados (error no subsanable, como haddock): mismo proveedor y mismo
    // nº de documento, o misma fecha + mismo importe → carpeta Rechazadas.
    let motivoRechazo: string | null = null;
    if (proveedorId) {
      const previas = await conPlazo(
        db
          .select({
            numero: schema.facturas.numero,
            fecha: schema.facturas.fecha,
            total: schema.facturas.total,
          })
          .from(schema.facturas)
          .where(
            and(
              eq(schema.facturas.proveedorId, proveedorId),
              ne(schema.facturas.id, facturaId),
              ne(schema.facturas.estado, "rechazada"),
              ne(schema.facturas.estado, "error"),
            ),
          ),
      );
      const dup = previas.find(
        (p) =>
          (numero && p.numero === numero) ||
          (fechaValida && totalTxt && p.fecha === fechaValida && p.total === totalTxt),
      );
      if (dup) {
        motivoRechazo =
          numero && dup.numero === numero
            ? `Ya existe un documento de este proveedor con el número ${numero}`
            : `Ya existe un documento de este proveedor con la misma fecha y el mismo importe (${totalTxt} €)`;
      }
    }

    await conPlazo(
      db
        .update(schema.facturas)
        .set({
          proveedorId,
          proveedorTexto: datos.proveedor ?? null,
          numero,
          fecha: fechaValida,
          base: numeroSano(datos.base)?.toFixed(2) ?? null,
          iva: numeroSano(datos.iva)?.toFixed(2) ?? null,
          total: totalTxt,
          tipo,
          datosIa: datos,
          estado: motivoRechazo ? "rechazada" : "revisar",
          motivoRechazo,
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
    console.error("[procesarBufferDocumento] lectura falló:", mensaje);
    await db
      .update(schema.facturas)
      .set({ estado: "error", datosIa: { error: mensaje }, updatedAt: new Date() })
      .where(eq(schema.facturas.id, facturaId))
      .catch(() => resetDb());
    return { ok: false, error: "No se pudo leer el documento — prueba con una foto más nítida o un PDF", facturaId };
  }

  return { ok: true, facturaId };
}
