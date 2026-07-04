// Retiradas de efectivo del cajón + snapshot en el cierre. Idempotente.
// Ejecutar: node scripts/migrar-retiradas-caja.cjs
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL no configurada"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

(async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS retiradas_caja (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        fecha date NOT NULL,
        importe numeric(12,2) NOT NULL,
        motivo text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`CREATE INDEX IF NOT EXISTS retiradas_caja_fecha_idx ON retiradas_caja (fecha)`;
    await sql`ALTER TABLE cierres_caja ADD COLUMN IF NOT EXISTS retiradas numeric(12,2) NOT NULL DEFAULT 0`;
    const [c] = await sql`SELECT count(*)::int AS n FROM retiradas_caja`;
    console.log("OK → retiradas_caja lista (filas:", c.n + ") y columna retiradas en cierres_caja");
    await sql.end();
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
