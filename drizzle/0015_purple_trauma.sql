CREATE TYPE "public"."comanda_estado" AS ENUM('pendiente', 'lista');--> statement-breakpoint
CREATE TYPE "public"."factura_venta_estado" AS ENUM('emitida', 'anulada');--> statement-breakpoint
CREATE TABLE "comandas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"mesa_nombre" text NOT NULL,
	"pase" integer NOT NULL,
	"items" jsonb NOT NULL,
	"nota" text,
	"estado" "comanda_estado" DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lista_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "facturas_venta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serie" text NOT NULL,
	"correlativo" integer NOT NULL,
	"numero" text NOT NULL,
	"fecha" date NOT NULL,
	"ticket_id" uuid,
	"cliente_id" uuid,
	"cliente_nombre" text NOT NULL,
	"cliente_cif" text,
	"cliente_direccion" text,
	"lineas" jsonb NOT NULL,
	"base" numeric(12, 2) NOT NULL,
	"iva" numeric(12, 2) NOT NULL,
	"iva_pct" numeric(5, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"estado" "factura_venta_estado" DEFAULT 'emitida' NOT NULL,
	"emitida_por" text,
	"enviada_a" text,
	"enviada_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "cif" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "razon_social" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "direccion_fiscal" text;--> statement-breakpoint
ALTER TABLE "personal_gastos" ADD COLUMN "liquido" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "personal_gastos" ADD COLUMN "irpf" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "personal_gastos" ADD COLUMN "ss_trabajador" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "personal_gastos" ADD COLUMN "ss_empresa" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "personal_gastos" ADD COLUMN "cash_b" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "personal_trabajadores" ADD COLUMN "categoria" text;--> statement-breakpoint
ALTER TABLE "reservas" ADD COLUMN "recordatorio_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservas" ADD COLUMN "confirmada_cliente_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ticket_lineas" ADD COLUMN "enviado" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_lineas" ADD COLUMN "nota" text;--> statement-breakpoint
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_venta" ADD CONSTRAINT "facturas_venta_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_venta" ADD CONSTRAINT "facturas_venta_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comandas_estado_idx" ON "comandas" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "comandas_ticket_idx" ON "comandas" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "facturas_venta_serie_corr_idx" ON "facturas_venta" USING btree ("serie","correlativo");--> statement-breakpoint
CREATE INDEX "facturas_venta_fecha_idx" ON "facturas_venta" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "facturas_venta_ticket_idx" ON "facturas_venta" USING btree ("ticket_id");