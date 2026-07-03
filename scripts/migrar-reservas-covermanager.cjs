// Mejora CoverManager del módulo de reservas:
//  - tabla reservas_config (mandos: doblaje, turnos, cupos; una fila jsonb)
//  - reservas.notif_email_at / notif_sms_at (confirmaciones enviadas)
// Idempotente. Ejecutar: node scripts/migrar-reservas-covermanager.cjs
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL no configurada en .env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

(async () => {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS reservas_config (
        id integer PRIMARY KEY DEFAULT 1,
        config jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`;
    await sql`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS notif_email_at timestamptz`;
    await sql`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS notif_sms_at timestamptz`;

    const [conf] = await sql`select count(*)::int as n from reservas_config`;
    console.log("reservas_config lista (filas:", conf.n + ") y columnas notif_* añadidas");
    await sql.end();
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
})();
