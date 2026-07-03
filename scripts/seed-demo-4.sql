-- Seed TPV Can Costa: 12 mesas + tickets demo de HOY (5 cobrados + 2 abiertos).
-- Requiere la migración 0003. Idempotente por UUIDs fijos.

alter table mesas enable row level security;
alter table tickets enable row level security;
alter table ticket_lineas enable row level security;

-- ── Mesas (capacidad → preparadas para el futuro módulo de reservas) ─
insert into mesas (id, nombre, zona, capacidad, orden) values
  ('ba000000-0000-4000-8000-000000000001', 'Mesa 1',   'sala',    2, 1),
  ('ba000000-0000-4000-8000-000000000002', 'Mesa 2',   'sala',    2, 2),
  ('ba000000-0000-4000-8000-000000000003', 'Mesa 3',   'sala',    4, 3),
  ('ba000000-0000-4000-8000-000000000004', 'Mesa 4',   'sala',    4, 4),
  ('ba000000-0000-4000-8000-000000000005', 'Mesa 5',   'sala',    4, 5),
  ('ba000000-0000-4000-8000-000000000006', 'Mesa 6',   'sala',    6, 6),
  ('ba000000-0000-4000-8000-000000000007', 'Terraza 1','terraza', 4, 7),
  ('ba000000-0000-4000-8000-000000000008', 'Terraza 2','terraza', 4, 8),
  ('ba000000-0000-4000-8000-000000000009', 'Terraza 3','terraza', 2, 9),
  ('ba000000-0000-4000-8000-000000000010', 'Terraza 4','terraza', 2, 10),
  ('ba000000-0000-4000-8000-000000000011', 'Barra 1',  'barra',   1, 11),
  ('ba000000-0000-4000-8000-000000000012', 'Barra 2',  'barra',   1, 12)
on conflict (id) do nothing;

-- ── Tickets COBRADOS de hoy (servicio de mediodía) ──────────────────
insert into tickets (id, mesa_id, estado, comensales, metodo_pago, total, abierto_at, cobrado_at) values
  ('bb000000-0000-4000-8000-000000000001', 'ba000000-0000-4000-8000-000000000001', 'cobrado', 2, 'tarjeta',  32.60, current_date + time '13:05', current_date + time '14:32'),
  ('bb000000-0000-4000-8000-000000000002', 'ba000000-0000-4000-8000-000000000003', 'cobrado', 4, 'efectivo', 74.60, current_date + time '13:20', current_date + time '15:05'),
  ('bb000000-0000-4000-8000-000000000003', 'ba000000-0000-4000-8000-000000000007', 'cobrado', 2, 'tarjeta',  36.90, current_date + time '13:48', current_date + time '15:12'),
  ('bb000000-0000-4000-8000-000000000004', 'ba000000-0000-4000-8000-000000000011', 'cobrado', 1, 'efectivo', 19.30, current_date + time '12:50', current_date + time '13:22'),
  ('bb000000-0000-4000-8000-000000000005', 'ba000000-0000-4000-8000-000000000005', 'cobrado', 3, 'tarjeta',  57.10, current_date + time '14:02', current_date + time '15:40')
on conflict (id) do nothing;

-- ── Tickets ABIERTOS ahora mismo (para ver el mapa con ocupación) ───
insert into tickets (id, mesa_id, estado, comensales, abierto_at) values
  ('bb000000-0000-4000-8000-000000000006', 'ba000000-0000-4000-8000-000000000002', 'abierto', 2, now() - interval '35 minutes'),
  ('bb000000-0000-4000-8000-000000000007', 'ba000000-0000-4000-8000-000000000008', 'abierto', 4, now() - interval '1 hour 10 minutes')
on conflict (id) do nothing;

-- ── Líneas (plato_id enlaza con el escandallo; null = bebida/extra) ─
insert into ticket_lineas (id, ticket_id, plato_id, descripcion, cantidad, precio_unitario, total) values
  -- Ticket 1 · Mesa 1 · 32,60
  ('bc000000-0000-4000-8000-000000000101', 'bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000004', 'Ensalada de burrata', 1, 10.90, 10.90),
  ('bc000000-0000-4000-8000-000000000102', 'bb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000003', 'Hamburguesa de la casa', 1, 12.90, 12.90),
  ('bc000000-0000-4000-8000-000000000103', 'bb000000-0000-4000-8000-000000000001', null, 'Caña', 2, 2.80, 5.60),
  ('bc000000-0000-4000-8000-000000000104', 'bb000000-0000-4000-8000-000000000001', null, 'Café', 2, 1.60, 3.20),
  -- Ticket 2 · Mesa 3 · 74,60
  ('bc000000-0000-4000-8000-000000000201', 'bb000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000002', 'Tartar de atún', 1, 16.50, 16.50),
  ('bc000000-0000-4000-8000-000000000202', 'bb000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001', 'Merluza a la brasa', 1, 17.50, 17.50),
  ('bc000000-0000-4000-8000-000000000203', 'bb000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000005', 'Canelones de rustido', 1, 11.50, 11.50),
  ('bc000000-0000-4000-8000-000000000204', 'bb000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000003', 'Hamburguesa de la casa', 1, 12.90, 12.90),
  ('bc000000-0000-4000-8000-000000000205', 'bb000000-0000-4000-8000-000000000002', null, 'Copa de vino', 4, 3.50, 14.00),
  ('bc000000-0000-4000-8000-000000000206', 'bb000000-0000-4000-8000-000000000002', null, 'Agua', 1, 2.20, 2.20),
  -- Ticket 3 · Terraza 1 · 36,90
  ('bc000000-0000-4000-8000-000000000301', 'bb000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000006', 'Pulpo a la brasa', 1, 19.00, 19.00),
  ('bc000000-0000-4000-8000-000000000302', 'bb000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000004', 'Ensalada de burrata', 1, 10.90, 10.90),
  ('bc000000-0000-4000-8000-000000000303', 'bb000000-0000-4000-8000-000000000003', null, 'Copa de vino', 2, 3.50, 7.00),
  -- Ticket 4 · Barra 1 · 19,30
  ('bc000000-0000-4000-8000-000000000401', 'bb000000-0000-4000-8000-000000000004', null, 'Caña', 1, 2.80, 2.80),
  ('bc000000-0000-4000-8000-000000000402', 'bb000000-0000-4000-8000-000000000004', 'aa000000-0000-4000-8000-000000000002', 'Tartar de atún', 1, 16.50, 16.50),
  -- Ticket 5 · Mesa 5 · 57,10
  ('bc000000-0000-4000-8000-000000000501', 'bb000000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000001', 'Merluza a la brasa', 2, 17.50, 35.00),
  ('bc000000-0000-4000-8000-000000000502', 'bb000000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000003', 'Hamburguesa de la casa', 1, 12.90, 12.90),
  ('bc000000-0000-4000-8000-000000000503', 'bb000000-0000-4000-8000-000000000005', null, 'Agua', 2, 2.20, 4.40),
  ('bc000000-0000-4000-8000-000000000504', 'bb000000-0000-4000-8000-000000000005', null, 'Café', 3, 1.60, 4.80),
  -- Ticket 6 (ABIERTO) · Mesa 2 · 26,00 acumulado
  ('bc000000-0000-4000-8000-000000000601', 'bb000000-0000-4000-8000-000000000006', 'aa000000-0000-4000-8000-000000000006', 'Pulpo a la brasa', 1, 19.00, 19.00),
  ('bc000000-0000-4000-8000-000000000602', 'bb000000-0000-4000-8000-000000000006', null, 'Copa de vino', 2, 3.50, 7.00),
  -- Ticket 7 (ABIERTO) · Terraza 2 · 45,70 acumulado
  ('bc000000-0000-4000-8000-000000000701', 'bb000000-0000-4000-8000-000000000007', 'aa000000-0000-4000-8000-000000000003', 'Hamburguesa de la casa', 2, 12.90, 25.80),
  ('bc000000-0000-4000-8000-000000000702', 'bb000000-0000-4000-8000-000000000007', 'aa000000-0000-4000-8000-000000000005', 'Canelones de rustido', 1, 11.50, 11.50),
  ('bc000000-0000-4000-8000-000000000703', 'bb000000-0000-4000-8000-000000000007', null, 'Caña', 3, 2.80, 8.40)
on conflict (id) do nothing;

-- ── Ventas del día de hoy = suma de tickets cobrados (origen tpv) ───
insert into ventas_dia (fecha, total, origen)
select current_date, coalesce(sum(total), 0), 'tpv'
from tickets where estado = 'cobrado' and cobrado_at::date = current_date
on conflict (fecha) do update set total = excluded.total, origen = 'tpv';

-- Comprobación
select (select count(*) from mesas) as mesas,
       (select count(*) from tickets) as tickets,
       (select count(*) from ticket_lineas) as lineas,
       (select total from ventas_dia where fecha = current_date) as ventas_hoy;
