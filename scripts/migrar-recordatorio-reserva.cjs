// Recordatorio + confirmacion por WhatsApp el dia de la cita:
//   recordatorio_at        cuando se le mando el "¿confirmas?"
//   confirmada_cliente_at  cuando respondio que SI
// Idempotente. Ejecutar: node scripts/migrar-recordatorio-reserva.cjs
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL no configurada"); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

(async () => {
  try {
    await sql`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS recordatorio_at timestamptz`;
    await sql`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS confirmada_cliente_at timestamptz`;
    console.log("OK -> reservas.recordatorio_at / confirmada_cliente_at");
    await sql.end();
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
