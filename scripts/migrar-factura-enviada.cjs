// Registro de envio por correo de una factura de venta (a quien y cuando).
// Idempotente. Ejecutar: node scripts/migrar-factura-enviada.cjs
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL no configurada"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

(async () => {
  try {
    await sql`ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS enviada_a text`;
    await sql`ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS enviada_at timestamptz`;
    console.log("OK -> facturas_venta.enviada_a / enviada_at");
    await sql.end();
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
