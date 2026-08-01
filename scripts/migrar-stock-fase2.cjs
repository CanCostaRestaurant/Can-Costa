// Fase 2 del stock: tipo de movimiento 'merma' (apunte manual: se cayo una
// caja, se paso de fecha...). Idempotente. Ejecutar: node scripts/migrar-stock-fase2.cjs
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL no configurada"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

(async () => {
  try {
    await sql`ALTER TYPE stock_mov_tipo ADD VALUE IF NOT EXISTS 'merma'`;
    console.log("OK -> stock_mov_tipo += 'merma'");
    await sql.end();
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
