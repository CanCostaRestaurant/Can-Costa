ALTER TABLE "clientes" ADD COLUMN "etiquetas" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "restricciones" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "preferencias" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "preferencia_mesa" text;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "idioma" text;--> statement-breakpoint
ALTER TABLE "platos" ADD COLUMN "foto_url" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "reserva_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reserva_id_reservas_id_fk" FOREIGN KEY ("reserva_id") REFERENCES "public"."reservas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_cliente_idx" ON "tickets" USING btree ("cliente_id");