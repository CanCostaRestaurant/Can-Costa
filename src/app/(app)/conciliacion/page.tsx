import { EnConstruccion } from "@/components/en-construccion";

export default function ConciliacionPage() {
  return (
    <EnConstruccion
      titulo="Conciliación"
      subtitulo="Cuadre automático de albaranes contra facturas"
      descripcion="Aquí se cruzarán los albaranes de entrega con las facturas del proveedor para detectar diferencias de precio o cantidades antes de pagar. Llega después del pipeline de lectura con IA."
    />
  );
}
