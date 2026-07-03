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
  "rechazada", // error no subsanable (p. ej. duplicado): aceptar o eliminar
]);

export const facturaOrigenEnum = pgEnum("factura_origen", [
  "foto",
  "pdf",
  "email",
  "manual",
]);

// Categoría del gasto (como haddock): solo las 4 primeras alimentan Productos.
export const gastoCategoriaEnum = pgEnum("gasto_categoria", [
  "materia_prima",
  "bebidas",
  "limpieza",
  "consumibles",
  "gestoria",
  "alquiler",
  "suministros",
  "otros",
]);

export const documentoTipoEnum = pgEnum("documento_tipo", ["factura", "albaran", "ticket"]);

// De dónde salen los productos de un proveedor: albaranes (más a tiempo
// real, por defecto) o facturas (si sus albaranes vienen sin importes).
export const proveedorFuenteEnum = pgEnum("proveedor_fuente", ["albaranes", "facturas"]);

// ---------------------------------------------------------------------
// proveedores
// ---------------------------------------------------------------------

export const proveedores = pgTable("proveedores", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  cif: text("cif"),
  email: text("email"), // buzón desde el que llegan sus facturas (pipeline correo)
  telefono: text("telefono"),
  categoria: gastoCategoriaEnum("categoria").notNull().default("materia_prima"),
  fuenteProductos: proveedorFuenteEnum("fuente_productos").notNull().default("albaranes"),
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
    precioPactado: numeric("precio_pactado", { precision: 12, scale: 4 }), // tarifa acordada con el proveedor; null = usar referencia
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
    tipo: documentoTipoEnum("tipo").notNull().default("factura"),
    categoria: gastoCategoriaEnum("categoria"), // null = hereda la del proveedor
    pagada: boolean("pagada").notNull().default(false),
    incidencia: text("incidencia"), // incidencia de compra registrada en el documento
    motivoRechazo: text("motivo_rechazo"), // por qué está en rechazadas (p. ej. duplicado)
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
// ajustes  (preferencias del sistema, una sola fila)
// ---------------------------------------------------------------------

export const ajustes = pgTable("ajustes", {
  id: integer("id").primaryKey().default(1),
  conIva: boolean("con_iva").notNull().default(true), // dashboard con o sin IVA
  ventasConTotal: boolean("ventas_con_total").notNull().default(true), // ventas con total o con base
  ivaVentasPct: numeric("iva_ventas_pct", { precision: 5, scale: 2 }).notNull().default("10"), // IVA automático de ventas
  toleranciaConciliacion: numeric("tolerancia_conciliacion", { precision: 8, scale: 2 }).notNull().default("1"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------
// usuarios  (roles como haddock: admin, documentos, gestor, chef)
// ---------------------------------------------------------------------

export const usuarioRolEnum = pgEnum("usuario_rol", ["admin", "documentos", "gestor", "chef"]);

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  rol: usuarioRolEnum("rol").notNull().default("admin"),
  contrasena: text("contrasena").notNull(), // hash HMAC con AUTH_SECRET, nunca en claro
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const platoTipoEnum = pgEnum("plato_tipo", ["entrante", "principal", "postre", "bebida", "otro"]);

export const platos = pgTable("platos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  emoji: text("emoji").notNull().default("🍽️"), // fallback visual cuando no hay foto
  fotoUrl: text("foto_url"), // foto del plato: data URL comprimida (sin Storage aún)
  tipoPlato: platoTipoEnum("tipo_plato").notNull().default("principal"),
  esPreparacion: boolean("es_preparacion").notNull().default(false), // sub-receta (vinagreta…): usable como ingrediente, sin PVP
  pvp: numeric("pvp", { precision: 12, scale: 2 }), // precio en carta; null = sin fijar
  mermaPct: numeric("merma_pct", { precision: 5, scale: 2 }).notNull().default("10"),
  margenObjetivo: numeric("margen_objetivo", { precision: 5, scale: 2 }), // % de margen esperado; null = sin objetivo
  raciones: numeric("raciones", { precision: 8, scale: 2 }).notNull().default("1"), // raciones que salen de la receta
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
    preparacionId: uuid("preparacion_id").references(() => platos.id, { onDelete: "set null" }), // sub-receta como ingrediente
    descripcion: text("descripcion"),
    cantidad: numeric("cantidad", { precision: 12, scale: 3 }), // en la unidad del producto (o raciones de la preparación)
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
    reservaId: uuid("reserva_id").references(() => reservas.id, { onDelete: "set null" }), // null = walk-in
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }), // → gasto por cliente
    estado: ticketEstadoEnum("estado").notNull().default("abierto"),
    comensales: integer("comensales"),
    metodoPago: metodoPagoEnum("metodo_pago"), // se fija al cobrar
    total: numeric("total", { precision: 12, scale: 2 }), // se fija al cobrar
    abiertoAt: timestamp("abierto_at", { withTimezone: true }).notNull().defaultNow(),
    cobradoAt: timestamp("cobrado_at", { withTimezone: true }),
  },
  (t) => [
    index("tickets_estado_idx").on(t.estado),
    index("tickets_cobrado_idx").on(t.cobradoAt),
    index("tickets_cliente_idx").on(t.clienteId),
  ],
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
  notas: text("notas"),
  etiquetas: jsonb("etiquetas").$type<string[]>().notNull().default([]), // VIP, Familiar, Vino blanco…
  restricciones: text("restricciones"), // alergias e intolerancias
  preferencias: text("preferencias"), // comida y bebida
  preferenciaMesa: text("preferencia_mesa"), // terraza, rincón, lejos de la puerta…
  idioma: text("idioma"),
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
    // Confirmación automática al cliente (null = no enviada):
    notifEmailAt: timestamp("notif_email_at", { withTimezone: true }),
    notifSmsAt: timestamp("notif_sms_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reservas_fecha_idx").on(t.fecha), index("reservas_mesa_idx").on(t.mesaId)],
);

// Mandos del cover manager editables desde /reservas/ajustes (doblaje por
// tamaño de grupo, turnos de servicio, cupo por tramo…). Una sola fila
// jsonb: el shape vive en lib/reservas/config.ts (MandosReservas).
export const reservasConfig = pgTable("reservas_config", {
  id: integer("id").primaryKey().default(1),
  config: jsonb("config").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
