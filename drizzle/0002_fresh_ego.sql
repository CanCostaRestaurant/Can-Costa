CREATE TABLE "plato_ingredientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plato_id" uuid NOT NULL,
	"producto_id" uuid,
	"descripcion" text,
	"cantidad" numeric(12, 3),
	"coste_fijo" numeric(12, 4),
	"orden" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"emoji" text DEFAULT '🍽️' NOT NULL,
	"pvp" numeric(12, 2),
	"merma_pct" numeric(5, 2) DEFAULT '10' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plato_ingredientes" ADD CONSTRAINT "plato_ingredientes_plato_id_platos_id_fk" FOREIGN KEY ("plato_id") REFERENCES "public"."platos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plato_ingredientes" ADD CONSTRAINT "plato_ingredientes_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plato_ingredientes_plato_idx" ON "plato_ingredientes" USING btree ("plato_id");