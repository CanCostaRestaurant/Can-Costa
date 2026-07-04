// TEMP read-only: comprobar si "Vender en TPV" creó bebidas.
require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
(async () => {
  const coca = await sql`select id, nombre, familia, activo from productos where nombre ilike '%coca%'`;
  console.log("== PRODUCTOS coca ==", JSON.stringify(coca, null, 2));
  const bebidas = await sql`select id, nombre, emoji, tipo_plato, pvp, activo, created_at from platos where tipo_plato = 'bebida' order by created_at desc limit 20`;
  console.log("== PLATOS tipo bebida (recientes) ==", JSON.stringify(bebidas, null, 2));
  const ing = await sql`select pi.producto_id, pi.cantidad, p.nombre as plato, p.pvp, pr.nombre as producto from plato_ingredientes pi left join platos p on p.id=pi.plato_id left join productos pr on pr.id=pi.producto_id where pi.producto_id is not null order by pi.created_at desc limit 20`;
  console.log("== INGREDIENTES con producto (recientes) ==", JSON.stringify(ing, null, 2));
  const totBebidas = await sql`select count(*)::int as n from platos where tipo_plato='bebida' and activo=true`;
  console.log("== total bebidas activas ==", totBebidas[0].n);
  await sql.end();
})().catch((e) => {
  console.error("ERROR", e.message);
  process.exit(1);
});
