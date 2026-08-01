// Motor de stock (inventario teorico + desviaciones):
//   productos.stock          stock teorico actual (NULL = nunca inicializado)
//   stock_movimientos        libro mayor: entrada (factura validada), venta
//                            (ticket cobrado, via escandallo) y ajuste (recuento)
//   stock_recuentos          cada recuento fisico: teorico vs contado -> DESVIACION
//                            (ej: 10 comprados - 5 vendidos = 7 teoricos, cuentas 3
//                             -> desviacion -4 apuntada y el teorico pasa a 3)
// Idempotente. Ejecutar: node scripts/migrar-stock.cjs
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL no configurada"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

(async () => {
  try {
    await sql`ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock numeric(14,3)`;

    await sql`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_mov_tipo') THEN
        CREATE TYPE stock_mov_tipo AS ENUM ('entrada', 'venta', 'ajuste');
      END IF;
    END $$`;

    await sql`
      CREATE TABLE IF NOT EXISTS stock_recuentos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
        teorico numeric(14,3) NOT NULL,
        contado numeric(14,3) NOT NULL,
        desviacion numeric(14,3) NOT NULL,
        contado_por text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS stock_recuentos_producto_idx ON stock_recuentos (producto_id, created_at)`;

    await sql`
      CREATE TABLE IF NOT EXISTS stock_movimientos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
        tipo stock_mov_tipo NOT NULL,
        cantidad numeric(14,3) NOT NULL,
        factura_id uuid REFERENCES facturas(id) ON DELETE SET NULL,
        ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
        recuento_id uuid REFERENCES stock_recuentos(id) ON DELETE SET NULL,
        nota text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS stock_mov_producto_idx ON stock_movimientos (producto_id, created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS stock_mov_created_idx ON stock_movimientos (created_at)`;
    // Idempotencia: un ticket solo puede descontar UNA vez cada producto, y una
    // factura solo puede sumar UNA vez cada producto (reintentos/carreras).
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS stock_mov_venta_unica ON stock_movimientos (ticket_id, producto_id) WHERE tipo = 'venta'`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS stock_mov_entrada_unica ON stock_movimientos (factura_id, producto_id) WHERE tipo = 'entrada'`;

    console.log("OK -> productos.stock + stock_movimientos + stock_recuentos");
    await sql.end();
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
