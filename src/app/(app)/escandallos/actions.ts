"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { conPlazo, getDb, resetDb, schema } from "@/lib/db";

type Resultado = { ok: boolean; error?: string; id?: string };

const SIN_BD = { ok: false, error: "Base de datos no configurada" };
const BD_CAIDA = {
  ok: false,
  error: "La base de datos no responde ahora mismo — vuelve a intentarlo en unos minutos",
};

function fallo(contexto: string, e: unknown): Resultado {
  console.error(`[escandallos] ${contexto} falló:`, e instanceof Error ? e.message : e);
  resetDb();
  return BD_CAIDA;
}

function revalidar(platoId?: string): void {
  revalidatePath("/escandallos");
  if (platoId) revalidatePath(`/escandallos/${platoId}`);
}

export async function crearPlato(): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    const [nuevo] = await conPlazo(
      db.insert(schema.platos).values({ nombre: "Nuevo plato", emoji: "🍽️" }).returning({ id: schema.platos.id }),
    );
    revalidar();
    return { ok: true, id: nuevo.id };
  } catch (e) {
    return fallo("crearPlato", e);
  }
}

export async function actualizarPlato(
  id: string,
  datos: {
    nombre?: string;
    emoji?: string;
    pvp?: number | null;
    mermaPct?: number;
    margenObjetivo?: number | null;
    tipoPlato?: "entrante" | "principal" | "postre" | "bebida" | "otro";
    esPreparacion?: boolean;
    raciones?: number;
  },
): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (datos.nombre !== undefined) {
    if (!datos.nombre.trim()) return { ok: false, error: "El nombre no puede estar vacío" };
    set.nombre = datos.nombre.trim();
  }
  if (datos.emoji !== undefined) set.emoji = datos.emoji.trim() || "🍽️";
  if (datos.pvp !== undefined) {
    if (datos.pvp !== null && (!Number.isFinite(datos.pvp) || datos.pvp < 0)) {
      return { ok: false, error: "PVP no válido" };
    }
    set.pvp = datos.pvp === null ? null : datos.pvp.toFixed(2);
  }
  if (datos.mermaPct !== undefined) {
    if (!Number.isFinite(datos.mermaPct) || datos.mermaPct < 0 || datos.mermaPct > 100) {
      return { ok: false, error: "La merma debe estar entre 0 y 100%" };
    }
    set.mermaPct = datos.mermaPct.toFixed(2);
  }
  if (datos.margenObjetivo !== undefined) {
    if (datos.margenObjetivo !== null && (!Number.isFinite(datos.margenObjetivo) || datos.margenObjetivo < 0 || datos.margenObjetivo >= 100)) {
      return { ok: false, error: "El margen esperado debe estar entre 0 y 99%" };
    }
    set.margenObjetivo = datos.margenObjetivo === null ? null : datos.margenObjetivo.toFixed(2);
  }
  if (datos.tipoPlato !== undefined) {
    if (!["entrante", "principal", "postre", "bebida", "otro"].includes(datos.tipoPlato)) {
      return { ok: false, error: "Tipo de plato no válido" };
    }
    set.tipoPlato = datos.tipoPlato;
  }
  if (datos.esPreparacion !== undefined) {
    // Una preparación no puede contener otras preparaciones: si el plato ya
    // usa alguna, no se puede convertir.
    if (datos.esPreparacion) {
      const lineas = await conPlazo(
        db.select().from(schema.platoIngredientes).where(eq(schema.platoIngredientes.platoId, id)),
      );
      if (lineas.some((l) => l.preparacionId)) {
        return { ok: false, error: "Este plato usa preparaciones: quítalas antes de convertirlo en preparación" };
      }
    }
    set.esPreparacion = datos.esPreparacion;
  }
  if (datos.raciones !== undefined) {
    if (!Number.isFinite(datos.raciones) || datos.raciones <= 0) {
      return { ok: false, error: "Las raciones deben ser mayores que 0" };
    }
    set.raciones = datos.raciones.toFixed(2);
  }

  try {
    await conPlazo(db.update(schema.platos).set(set).where(eq(schema.platos.id, id)));
    revalidar(id);
    return { ok: true };
  } catch (e) {
    return fallo("actualizarPlato", e);
  }
}

// Foto del plato. Llega ya comprimida desde el cliente como data URL
// (image/jpeg|png, ~640px). null = quitar la foto (vuelve al emoji).
// Tope defensivo de 1,5 MB por si el navegador no comprimió bien.
export async function guardarFotoPlato(id: string, fotoUrl: string | null): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;

  if (fotoUrl !== null) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(fotoUrl)) {
      return { ok: false, error: "El archivo no es una imagen válida" };
    }
    if (fotoUrl.length > 1_500_000) {
      return { ok: false, error: "La imagen es demasiado grande; prueba con otra foto" };
    }
  }

  try {
    await conPlazo(
      db.update(schema.platos).set({ fotoUrl, updatedAt: new Date() }).where(eq(schema.platos.id, id)),
    );
    revalidar(id);
    return { ok: true };
  } catch (e) {
    return fallo("guardarFotoPlato", e);
  }
}

export async function eliminarPlato(id: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    // Borrado suave: el plato deja de listarse pero conserva su historia.
    await conPlazo(
      db.update(schema.platos).set({ activo: false, updatedAt: new Date() }).where(eq(schema.platos.id, id)),
    );
    revalidar(id);
    return { ok: true };
  } catch (e) {
    return fallo("eliminarPlato", e);
  }
}

export async function agregarIngrediente(
  platoId: string,
  datos: {
    productoId?: string;
    preparacionId?: string;
    cantidad?: number;
    descripcion?: string;
    costeFijo?: number;
  },
): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;

  const esProducto = Boolean(datos.productoId);
  const esPreparacion = Boolean(datos.preparacionId);
  if (esProducto || esPreparacion) {
    if (!datos.cantidad || !Number.isFinite(datos.cantidad) || datos.cantidad <= 0) {
      return { ok: false, error: "Indica la cantidad del ingrediente" };
    }
  } else {
    if (!datos.descripcion?.trim()) return { ok: false, error: "Indica la descripción de la línea" };
    if (datos.costeFijo === undefined || !Number.isFinite(datos.costeFijo) || datos.costeFijo < 0) {
      return { ok: false, error: "Indica el importe de la línea" };
    }
  }

  try {
    if (esPreparacion) {
      // Solo UN nivel: un plato usa preparaciones, una preparación no.
      if (datos.preparacionId === platoId) return { ok: false, error: "Un plato no puede contenerse a sí mismo" };
      const [[plato], [prep]] = await Promise.all([
        conPlazo(db.select().from(schema.platos).where(eq(schema.platos.id, platoId))),
        conPlazo(db.select().from(schema.platos).where(eq(schema.platos.id, datos.preparacionId!))),
      ]);
      if (!plato || !prep) return { ok: false, error: "Plato o preparación no encontrados" };
      if (plato.esPreparacion) {
        return { ok: false, error: "Una preparación no puede contener otras preparaciones" };
      }
      if (!prep.esPreparacion) return { ok: false, error: "Ese plato no está marcado como preparación" };
    }

    await conPlazo(
      db.insert(schema.platoIngredientes).values({
        platoId,
        productoId: esProducto ? datos.productoId : null,
        preparacionId: esPreparacion ? datos.preparacionId : null,
        cantidad: esProducto || esPreparacion ? datos.cantidad!.toFixed(3) : null,
        descripcion: esProducto || esPreparacion ? null : datos.descripcion!.trim(),
        costeFijo: esProducto || esPreparacion ? null : datos.costeFijo!.toFixed(4),
        orden: 99,
      }),
    );
    revalidar(platoId);
    return { ok: true };
  } catch (e) {
    return fallo("agregarIngrediente", e);
  }
}

export async function actualizarIngrediente(
  id: string,
  platoId: string,
  datos: { cantidad?: number; costeFijo?: number },
): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;

  const set: Record<string, unknown> = {};
  if (datos.cantidad !== undefined) {
    if (!Number.isFinite(datos.cantidad) || datos.cantidad <= 0) return { ok: false, error: "Cantidad no válida" };
    set.cantidad = datos.cantidad.toFixed(3);
  }
  if (datos.costeFijo !== undefined) {
    if (!Number.isFinite(datos.costeFijo) || datos.costeFijo < 0) return { ok: false, error: "Importe no válido" };
    set.costeFijo = datos.costeFijo.toFixed(4);
  }
  if (Object.keys(set).length === 0) return { ok: true };

  try {
    await conPlazo(db.update(schema.platoIngredientes).set(set).where(eq(schema.platoIngredientes.id, id)));
    revalidar(platoId);
    return { ok: true };
  } catch (e) {
    return fallo("actualizarIngrediente", e);
  }
}

export async function eliminarIngrediente(id: string, platoId: string): Promise<Resultado> {
  const db = getDb();
  if (!db) return SIN_BD;
  try {
    await conPlazo(db.delete(schema.platoIngredientes).where(eq(schema.platoIngredientes.id, id)));
    revalidar(platoId);
    return { ok: true };
  } catch (e) {
    return fallo("eliminarIngrediente", e);
  }
}
