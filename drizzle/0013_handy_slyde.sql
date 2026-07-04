CREATE TYPE "public"."personal_tipo" AS ENUM('nomina', 'seguridad_social', 'otro');--> statement-breakpoint
ALTER TYPE "public"."metodo_pago" ADD VALUE 'mixto';--> statement-breakpoint
CREATE TABLE "cierres_caja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fecha" date NOT NULL,
	"efectivo_contado" numeric(12, 2) NOT NULL,
	"datafono" numeric(12, 2) NOT NULL,
	"fondo_siguiente" numeric(12, 2) DEFAULT '0' NOT NULL,
	"efectivo_esperado" numeric(12, 2) NOT NULL,
	"tarjeta_esperada" numeric(12, 2) NOT NULL,
	"fondo_anterior" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notas" text,
	"cerrado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cierres_caja_fecha_unique" UNIQUE("fecha")
);
--> statement-breakpoint
CREATE TABLE "personal_trabajadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"puesto" text,
	"salario" numeric(12, 2),
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"metodo" "metodo_pago" NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"entregado" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_gastos" ADD COLUMN "trabajador_id" uuid;--> statement-breakpoint
ALTER TABLE "personal_gastos" ADD COLUMN "tipo" "personal_tipo" DEFAULT 'nomina' NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_gastos" ADD COLUMN "documento" text;--> statement-breakpoint
ALTER TABLE "personal_gastos" ADD COLUMN "documento_nombre" text;--> statement-breakpoint
ALTER TABLE "ticket_pagos" ADD CONSTRAINT "ticket_pagos_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_pagos_ticket_idx" ON "ticket_pagos" USING btree ("ticket_id");--> statement-breakpoint
ALTER TABLE "personal_gastos" ADD CONSTRAINT "personal_gastos_trabajador_id_personal_trabajadores_id_fk" FOREIGN KEY ("trabajador_id") REFERENCES "public"."personal_trabajadores"("id") ON DELETE set null ON UPDATE no action;