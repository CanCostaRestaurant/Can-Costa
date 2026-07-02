// =====================================================================
// Schema Drizzle — Can Costa (food cost & compras)
//
// Fase 1: COMPRAS
//   - proveedores      (maestro de proveedores)
//   - productos        (catálogo; nombre canónico + último precio)
//   - facturas         (cabecera de factura/albarán, con estado de revisión)
//   - factura_lineas   (líneas extraídas de cada factura)
//   - precios          (histórico de precios por producto; alimenta
//                       sparklines de la pantalla Precios y, en Fase 2,
//                       el recálculo de escandallos)
//
// Las tablas auth.* y storage.* las gestiona Supabase y NO se declaran aquí.
// =====================================================================

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  date,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------

export const productoFamiliaEnum = pgEnum("producto_familia", [
  "pescado",
  "carne",
  "fruta-verdura",
  "seco",
  "bebida",
  "otros",
]);

export const facturaEstadoEnum = pgEnum("factura_estado", [
  "procesando", // subida, la IA aún está leyendo
  "revisar", // leída, pendiente de que el usuario valide las líneas
  "validada", // confirmada; sus líneas ya alimentan el histórico de precios
  "error", // la IA no pudo leerla
]);

export const facturaOrigenEnum = pgEnum("factura_origen", [
  "foto",
  "pdf",
  "email",
  "manual",
]);

// ---------------------------------------------------------------------
// proveedores
// ---------------------------------------------------------------------

export const proveedores = pgTable("proveedores", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  cif: text("cif"),
  email: text("email"), // buzón desde el que llegan sus facturas (pipeline correo)
  telefono: text("telefono"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------
// productos
// ---------------------------------------------------------------------

export const productos = pgTable(
  "productos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(), // nombre canónico ("Merluza fresca")
    familia: productoFamiliaEnum("familia").notNull().default("otros"),
    unidad: text("unidad").notNull().default("kg"), // unidad de referencia del precio: kg, L, ud
    proveedorId: uuid("proveedor_id").references(() => proveedores.id, {
      onDelete: "set null",
    }),
    // Denormalizados para lectura rápida de la tabla de Precios (evita N+1):
    ultimoPrecio: numeric("ultimo_precio", { precision: 12, scale: 4 }),
    ultimaCompra: date("ultima_compra"),
    activo: boolean("activo").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("productos_familia_idx").on(t.familia)],
);

// ---------------------------------------------------------------------
// facturas  (cabecera de factura o albarán)
// ---------------------------------------------------------------------

export const facturas = pgTable(
  "facturas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proveedorId: uuid("proveedor_id").references(() => proveedores.id, {
      onDelete: "set null",
    }),
    proveedorTexto: text("proveedor_texto"), // lo que leyó la IA antes de mapear a un proveedor
    numero: text("numero"), // nº de factura o albarán
    fecha: date("fecha"),
    base: numeric("base", { precision: 12, scale: 2 }), // sin IVA
    iva: numeric("iva", { precision: 12, scale: 2 }),
    total: numeric("total", { precision: 12, scale: 2 }),
    estado: facturaEstadoEnum("estado").notNull().default("procesando"),
    origen: facturaOrigenEnum("origen").notNull().default("manual"),
    documentoUrl: text("documento_url"), // fichero en Supabase Storage
    datosIa: jsonb("datos_ia"), // respuesta cruda de la extracción, para depurar
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("facturas_estado_idx").on(t.estado),
    index("facturas_fecha_idx").on(t.fecha),
  ],
);

// ---------------------------------------------------------------------
// factura_lineas  (una fila por producto de la factura)
// ---------------------------------------------------------------------

export const facturaLineas = pgTable(
  "factura_lineas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facturaId: uuid("factura_id")
      .notNull()
      .references(() => facturas.id, { onDelete: "cascade" }),
    productoId: uuid("producto_id").references(() => productos.id, {
      onDelete: "set null",
    }),
    descripcion: text("descripcion").notNull(), // texto crudo de la línea ("TOMATE PERA CAJA 5KG")
    cantidad: numeric("cantidad", { precision: 12, scale: 3 }),
    unidad: text("unidad"), // unidad de la línea tal cual viene en la factura
    precioUnitario: numeric("precio_unitario", { precision: 12, scale: 4 }),
    total: numeric("total", { precision: 12, scale: 2 }),
    // Variación vs la última compra del mismo producto; se calcula al validar.
    variacionPct: numeric("variacion_pct", { precision: 6, scale: 2 }),
    orden: integer("orden"), // posición dentro de la factura
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("factura_lineas_factura_idx").on(t.facturaId),
    index("factura_lineas_producto_idx").on(t.productoId),
  ],
);

// ---------------------------------------------------------------------
// precios  (histórico: un punto por compra de un producto)
// ---------------------------------------------------------------------

export const precios = pgTable(
  "precios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productoId: uuid("producto_id")
      .notNull()
      .references(() => productos.id, { onDelete: "cascade" }),
    precio: numeric("precio", { precision: 12, scale: 4 }).notNull(), // por unidad de referencia del producto
    unidad: text("unidad"),
    fecha: date("fecha").notNull(),
    proveedorId: uuid("proveedor_id").references(() => proveedores.id, {
      onDelete: "set null",
    }),
    facturaId: uuid("factura_id").references(() => facturas.id, {
      onDelete: "set null",
    }),
    lineaId: uuid("linea_id").references(() => facturaLineas.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("precios_producto_fecha_idx").on(t.productoId, t.fecha)],
);
