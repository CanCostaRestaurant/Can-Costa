// Facturas EMITIDAS al cliente (facturas_venta) + datos fiscales del cliente.
// A diferencia de `facturas` (compras/gasto), estas son las que Can Costa emite
// cuando un cliente pide factura. Numeracion correlativa sin huecos por serie=ano.
// Idempotente. Ejecutar: node scripts/migrar-facturas-venta.cjs
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL no configurada"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

(async () => {
  try {
    // Datos fiscales del cliente (para poder emitirle factura).
    await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cif text`;
    await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS razon_social text`;
    await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS direccion_fiscal text`;

    // Enum de estado (crea solo si no existe).
    await sql`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'factura_venta_estado') THEN
        CREATE TYPE factura_venta_estado AS ENUM ('emitida', 'anulada');
      END IF;
    END $$`;

    await sql`
      CREATE TABLE IF NOT EXISTS facturas_venta (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        serie text NOT NULL,
        correlativo integer NOT NULL,
        numero text NOT NULL,
        fecha date NOT NULL,
        ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
        cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
        cliente_nombre text NOT NULL,
        cliente_cif text,
        cliente_direccion text,
        lineas jsonb NOT NULL,
        base numeric(12,2) NOT NULL,
        iva numeric(12,2) NOT NULL,
        iva_pct numeric(5,2) NOT NULL,
        total numeric(12,2) NOT NULL,
        estado factura_venta_estado NOT NULL DEFAULT 'emitida',
        emitida_por text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS facturas_venta_serie_corr_idx ON facturas_venta (serie, correlativo)`;
    await sql`CREATE INDEX IF NOT EXISTS facturas_venta_fecha_idx ON facturas_venta (fecha)`;
    await sql`CREATE INDEX IF NOT EXISTS facturas_venta_ticket_idx ON facturas_venta (ticket_id)`;
    // Numeracion sin huecos: no puede repetirse el correlativo dentro de una serie.
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS facturas_venta_serie_corr_uq ON facturas_venta (serie, correlativo)`;

    const [c] = await sql`SELECT count(*)::int AS n FROM facturas_venta`;
    console.log("OK -> facturas_venta lista (filas:", c.n + ") y columnas fiscales en clientes");
    await sql.end();
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
