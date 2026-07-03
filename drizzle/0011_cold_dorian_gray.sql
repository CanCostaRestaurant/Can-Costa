ALTER TYPE "public"."gasto_categoria" ADD VALUE 'personal' BEFORE 'otros';--> statement-breakpoint
CREATE TABLE "personal_gastos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mes" text NOT NULL,
	"concepto" text NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservas_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facturas" ADD COLUMN "factura_padre_id" uuid;--> statement-breakpoint
ALTER TABLE "reservas" ADD COLUMN "notif_email_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservas" ADD COLUMN "notif_sms_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "personal_gastos_mes_idx" ON "personal_gastos" USING btree ("mes");