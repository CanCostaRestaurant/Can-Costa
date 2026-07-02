-- Seed demo v3 Can Costa: platos con escandallo (Fase 2).
-- Requiere la migración 0002 (platos, plato_ingredientes).
-- Idempotente: UUIDs fijos + ON CONFLICT DO NOTHING.
-- Los ingredientes con producto_id calculan coste VIVO (cantidad × último precio);
-- los de coste_fijo son importes cerrados (especias, elaboraciones, varios).

alter table platos enable row level security;
alter table plato_ingredientes enable row level security;

insert into platos (id, nombre, emoji, pvp, merma_pct) values
  ('aa000000-0000-4000-8000-000000000001', 'Merluza a la brasa',      '🐟', 17.50, 15),
  ('aa000000-0000-4000-8000-000000000002', 'Tartar de atún',          '🥩', 16.50, 10),
  ('aa000000-0000-4000-8000-000000000003', 'Hamburguesa de la casa',  '🍔', 12.90, 10),
  ('aa000000-0000-4000-8000-000000000004', 'Ensalada de burrata',     '🥗', 10.90, 10),
  ('aa000000-0000-4000-8000-000000000005', 'Canelones de rustido',    '🥘', 11.50, 15),
  ('aa000000-0000-4000-8000-000000000006', 'Pulpo a la brasa',        '🐙', 19.00, 15)
on conflict (id) do nothing;

insert into plato_ingredientes (id, plato_id, producto_id, descripcion, cantidad, coste_fijo, orden) values
  -- Merluza a la brasa (merluza VIVA → sube al validar el albarán de Peixos)
  ('ab000000-0000-4000-8000-000000000101', 'aa000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', null,                      0.320, null,   1),
  ('ab000000-0000-4000-8000-000000000102', 'aa000000-0000-4000-8000-000000000001', null, 'Patata agria',                    null,  0.2200, 2),
  ('ab000000-0000-4000-8000-000000000103', 'aa000000-0000-4000-8000-000000000001', null, 'Verduras de temporada',           null,  0.9500, 3),
  ('ab000000-0000-4000-8000-000000000104', 'aa000000-0000-4000-8000-000000000001', null, 'Aceite de oliva (40 ml)',         null,  0.2300, 4),
  ('ab000000-0000-4000-8000-000000000105', 'aa000000-0000-4000-8000-000000000001', null, 'Ajo, perejil y limón',            null,  0.2700, 5),
  -- Tartar de atún (atún y aguacate VIVOS)
  ('ab000000-0000-4000-8000-000000000201', 'aa000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000007', null,                      0.140, null,   1),
  ('ab000000-0000-4000-8000-000000000202', 'aa000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', null,                      0.080, null,   2),
  ('ab000000-0000-4000-8000-000000000203', 'aa000000-0000-4000-8000-000000000002', null, 'Soja, sésamo y encurtidos',       null,  0.4500, 3),
  -- Hamburguesa de la casa (brioche VIVO)
  ('ab000000-0000-4000-8000-000000000301', 'aa000000-0000-4000-8000-000000000003', null, 'Vacuno picado (180 g)',           null,  1.7600, 1),
  ('ab000000-0000-4000-8000-000000000302', 'aa000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000008', null,                      1.000, null,   2),
  ('ab000000-0000-4000-8000-000000000303', 'aa000000-0000-4000-8000-000000000003', null, 'Queso, lechuga y tomate',         null,  0.4200, 3),
  -- Ensalada de burrata (tomate VIVO)
  ('ab000000-0000-4000-8000-000000000401', 'aa000000-0000-4000-8000-000000000004', null, 'Burrata (125 g)',                 null,  2.1000, 1),
  ('ab000000-0000-4000-8000-000000000402', 'aa000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004', null,                      0.180, null,   2),
  ('ab000000-0000-4000-8000-000000000403', 'aa000000-0000-4000-8000-000000000004', null, 'Rúcula y pesto',                  null,  1.1600, 3),
  -- Canelones de rustido
  ('ab000000-0000-4000-8000-000000000501', 'aa000000-0000-4000-8000-000000000005', null, 'Carne de rustido (120 g)',        null,  1.0700, 1),
  ('ab000000-0000-4000-8000-000000000502', 'aa000000-0000-4000-8000-000000000005', null, 'Placas de canelón (4 ud)',        null,  0.3200, 2),
  ('ab000000-0000-4000-8000-000000000503', 'aa000000-0000-4000-8000-000000000005', null, 'Bechamel y queso',                null,  0.8600, 3),
  -- Pulpo a la brasa
  ('ab000000-0000-4000-8000-000000000601', 'aa000000-0000-4000-8000-000000000006', null, 'Pulpo (450 g)',                   null,  5.3600, 1),
  ('ab000000-0000-4000-8000-000000000602', 'aa000000-0000-4000-8000-000000000006', null, 'Patata agria',                    null,  0.1700, 2),
  ('ab000000-0000-4000-8000-000000000603', 'aa000000-0000-4000-8000-000000000006', null, 'Pimentón y alioli',               null,  1.0600, 3)
on conflict (id) do nothing;

-- Comprobación
select (select count(*) from platos) as platos,
       (select count(*) from plato_ingredientes) as ingredientes;
