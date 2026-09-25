// COMANDERO: app de móvil a pantalla completa. Sin sidebar, sin Fina y sin la
// barra de la tablet: en un teléfono se comían el ancho y tapaban Enviar.
// Cada pantalla pinta su propia cabecera. touch-action:manipulation quita el
// retardo de doble toque (zoom) y select-none evita que un toque largo en un
// plato seleccione texto; los inputs vuelven a select-text.
export default function ComanderoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh select-none [-webkit-tap-highlight-color:transparent] [touch-action:manipulation]">
      {children}
    </div>
  );
}
