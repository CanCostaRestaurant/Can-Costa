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
  time,
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
// ventas_dia  (facturación diaria de sala; de momento manual/seed,
//              en Fase 3 la alimentará el import del TPV)
// ---------------------------------------------------------------------

export const ventasDia = pgTable("ventas_dia", {
  id: uuid("id").primaryKey().defaultRandom(),
  fecha: date("fecha").notNull().unique(),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  origen: text("origen").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------
// platos  (escandallos: coste = Σ ingredientes × último precio + merma)
// ---------------------------------------------------------------------

export const platos = pgTable("platos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  emoji: text("emoji").notNull().default("🍽️"),
  pvp: numeric("pvp", { precision: 12, scale: 2 }), // precio en carta; null = sin fijar
  mermaPct: numeric("merma_pct", { precision: 5, scale: 2 }).notNull().default("10"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Una línea por ingrediente. Dos variantes:
//  - con producto_id + cantidad → coste vivo (cantidad × último precio)
//  - sin producto (descripcion + coste_fijo) → importe fijo (especias, varios…)
export const platoIngredientes = pgTable(
  "plato_ingredientes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platoId: uuid("plato_id")
      .notNull()
      .references(() => platos.id, { onDelete: "cascade" }),
    productoId: uuid("producto_id").references(() => productos.id, { onDelete: "set null" }),
    descripcion: text("descripcion"),
    cantidad: numeric("cantidad", { precision: 12, scale: 3 }), // en la unidad del producto
    costeFijo: numeric("coste_fijo", { precision: 12, scale: 4 }),
    orden: integer("orden"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("plato_ingredientes_plato_idx").on(t.platoId)],
);

// ---------------------------------------------------------------------
// TPV: mesas, tickets y líneas de venta
// ---------------------------------------------------------------------

export const mesaZonaEnum = pgEnum("mesa_zona", ["sala", "terraza", "barra"]);

export const mesaFormaEnum = pgEnum("mesa_forma", ["cuadrada", "redonda", "alargada"]);

// La capacidad deja la distribución lista para el futuro módulo de RESERVAS
// (cover manager): asignar la mejor mesa a una reserva de N comensales.
// pos_x/pos_y (0-100, % del plano) sitúan la mesa en el plano del local.
export const mesas = pgTable("mesas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(), // "Mesa 1", "Barra 2"…
  zona: mesaZonaEnum("zona").notNull().default("sala"),
  capacidad: integer("capacidad").notNull().default(4),
  forma: mesaFormaEnum("forma").notNull().default("cuadrada"),
  combinable: boolean("combinable").notNull().default(true), // puede juntarse con otra cercana

  posX: integer("pos_x"), // null = sin colocar en el plano
  posY: integer("pos_y"),
  orden: integer("orden"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ticketEstadoEnum = pgEnum("ticket_estado", ["abierto", "cobrado", "anulado"]);
export const metodoPagoEnum = pgEnum("metodo_pago", ["efectivo", "tarjeta"]);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mesaId: uuid("mesa_id").references(() => mesas.id, { onDelete: "set null" }), // null = para llevar
    estado: ticketEstadoEnum("estado").notNull().default("abierto"),
    comensales: integer("comensales"),
    metodoPago: metodoPagoEnum("metodo_pago"), // se fija al cobrar
    total: numeric("total", { precision: 12, scale: 2 }), // se fija al cobrar
    abiertoAt: timestamp("abierto_at", { withTimezone: true }).notNull().defaultNow(),
    cobradoAt: timestamp("cobrado_at", { withTimezone: true }),
  },
  (t) => [index("tickets_estado_idx").on(t.estado), index("tickets_cobrado_idx").on(t.cobradoAt)],
);

// Cada línea congela descripción y PVP del momento de la comanda.
export const ticketLineas = pgTable(
  "ticket_lineas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    platoId: uuid("plato_id").references(() => platos.id, { onDelete: "set null" }), // null = línea libre (bebida, extra…)
    descripcion: text("descripcion").notNull(),
    cantidad: integer("cantidad").notNull().default(1),
    precioUnitario: numeric("precio_unitario", { precision: 12, scale: 2 }).notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ticket_lineas_ticket_idx").on(t.ticketId)],
);

// ---------------------------------------------------------------------
// RESERVAS (cover manager): asignación de mesa vía lib/reservas/asignador
// ---------------------------------------------------------------------

// Clientes: se generan AUTOMÁTICAMENTE desde las reservas. La identidad se
// resuelve en lib/clientes/identidad.ts (teléfono > email > nombre+apellido).
export const clientes = pgTable("clientes", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  telefono: text("telefono"),
  email: text("email"),
  notas: text("notas"), // alergias, preferencias, VIP…
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reservaEstadoEnum = pgEnum("reserva_estado", [
  "confirmada",
  "sentada",
  "no_show",
  "cancelada",
]);

export const reservas = pgTable(
  "reservas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    telefono: text("telefono"),
    email: text("email"),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    comensales: integer("comensales").notNull(),
    fecha: date("fecha").notNull(),
    hora: time("hora").notNull(),
    duracionMin: integer("duracion_min").notNull().default(90),
    zonaPreferida: mesaZonaEnum("zona_preferida"), // null = sin preferencia
    mesaId: uuid("mesa_id").references(() => mesas.id, { onDelete: "set null" }), // null = sin mesa (aviso)
    mesa2Id: uuid("mesa2_id").references(() => mesas.id, { onDelete: "set null" }), // segunda mesa al juntar
    estado: reservaEstadoEnum("estado").notNull().default("confirmada"),
    notas: text("notas"),
    origen: text("origen").notNull().default("manual"), // futuro: 'web'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reservas_fecha_idx").on(t.fecha), index("reservas_mesa_idx").on(t.mesaId)],
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
