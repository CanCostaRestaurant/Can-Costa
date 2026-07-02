CREATE TYPE "public"."factura_estado" AS ENUM('procesando', 'revisar', 'validada', 'error');--> statement-breakpoint
CREATE TYPE "public"."factura_origen" AS ENUM('foto', 'pdf', 'email', 'manual');--> statement-breakpoint
CREATE TYPE "public"."producto_familia" AS ENUM('pescado', 'carne', 'fruta-verdura', 'seco', 'bebida', 'otros');--> statement-breakpoint
CREATE TABLE "factura_lineas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factura_id" uuid NOT NULL,
	"producto_id" uuid,
	"descripcion" text NOT NULL,
	"cantidad" numeric(12, 3),
	"unidad" text,
	"precio_unitario" numeric(12, 4),
	"total" numeric(12, 2),
	"variacion_pct" numeric(6, 2),
	"orden" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proveedor_id" uuid,
	"proveedor_texto" text,
	"numero" text,
	"fecha" date,
	"base" numeric(12, 2),
	"iva" numeric(12, 2),
	"total" numeric(12, 2),
	"estado" "factura_estado" DEFAULT 'procesando' NOT NULL,
	"origen" "factura_origen" DEFAULT 'manual' NOT NULL,
	"documento_url" text,
	"datos_ia" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producto_id" uuid NOT NULL,
	"precio" numeric(12, 4) NOT NULL,
	"unidad" text,
	"fecha" date NOT NULL,
	"proveedor_id" uuid,
	"factura_id" uuid,
	"linea_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"familia" "producto_familia" DEFAULT 'otros' NOT NULL,
	"unidad" text DEFAULT 'kg' NOT NULL,
	"proveedor_id" uuid,
	"ultimo_precio" numeric(12, 4),
	"ultima_compra" date,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"cif" text,
	"email" text,
	"telefono" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "factura_lineas" ADD CONSTRAINT "factura_lineas_factura_id_facturas_id_fk" FOREIGN KEY ("factura_id") REFERENCES "public"."facturas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura_lineas" ADD CONSTRAINT "factura_lineas_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_factura_id_facturas_id_fk" FOREIGN KEY ("factura_id") REFERENCES "public"."facturas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_linea_id_factura_lineas_id_fk" FOREIGN KEY ("linea_id") REFERENCES "public"."factura_lineas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "factura_lineas_factura_idx" ON "factura_lineas" USING btree ("factura_id");--> statement-breakpoint
CREATE INDEX "factura_lineas_producto_idx" ON "factura_lineas" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "facturas_estado_idx" ON "facturas" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "facturas_fecha_idx" ON "facturas" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "precios_producto_fecha_idx" ON "precios" USING btree ("producto_id","fecha");--> statement-breakpoint
CREATE INDEX "productos_familia_idx" ON "productos" USING btree ("familia");