-- ⚠️ LIMPIEZA DE DATOS DEMO de Can Costa. NO ejecutar hasta que el
-- restaurante empiece con datos reales. Borra SOLO las filas sembradas
-- (UUIDs fijos de los seeds) y lo que cuelga de ellas; lo creado por el
-- usuario (validaciones posteriores, ventas manuales, platos nuevos…)
-- se conserva salvo que referencie filas demo.

begin;

-- Escandallos demo
delete from plato_ingredientes where plato_id::text like 'aa000000-%';
delete from platos where id::text like 'aa000000-%';

-- Histórico de precios demo (incluye los puntos creados al validar facturas demo)
delete from precios where id::text like 'c0000000-%'
   or factura_id in (select id from facturas where id::text like 'd0000000-%');

-- Facturas demo y sus líneas (cascade en líneas vía FK)
delete from facturas where id::text like 'd0000000-%';

-- Ventas demo
delete from ventas_dia where origen = 'seed';

-- Productos y proveedores demo (fallará si algo real los referencia: revisar antes)
delete from productos where id::text like 'b0000000-%';
delete from proveedores where id::text like 'a0000000-%';

commit;

select (select count(*) from facturas)   as facturas,
       (select count(*) from productos)  as productos,
       (select count(*) from platos)     as platos,
       (select count(*) from ventas_dia) as ventas;
