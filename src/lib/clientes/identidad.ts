// Identidad de clientes: cómo decidimos que dos reservas son de la MISMA
// persona. Orden de confianza: teléfono > email > nombre+apellido completos.
// Funciones puras y conservadoras: ante la duda, cliente nuevo (fusionar
// después es fácil; separar un cliente mal fusionado, no).

export function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length < 9) return null; // demasiado corto para comparar con garantías
  return digitos.slice(-9); // últimos 9: ignora prefijos (+34, 0034…)
}

export function normalizarEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const limpio = email.trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(limpio) ? limpio : null;
}

export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // sin acentos
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type DatosContacto = { nombre: string; telefono?: string | null; email?: string | null };
export type ClienteCandidato = { id: string; nombre: string; telefono: string | null; email: string | null };

// Devuelve el cliente existente que ES la misma persona, o null.
export function buscarCoincidencia(
  datos: DatosContacto,
  candidatos: ClienteCandidato[],
): ClienteCandidato | null {
  const tel = normalizarTelefono(datos.telefono);
  const email = normalizarEmail(datos.email);
  const nombre = normalizarNombre(datos.nombre);

  if (tel) {
    const porTelefono = candidatos.find((c) => normalizarTelefono(c.telefono) === tel);
    if (porTelefono) return porTelefono;
  }
  if (email) {
    const porEmail = candidatos.find((c) => normalizarEmail(c.email) === email);
    if (porEmail) return porEmail;
  }
  // Nombre solo: exige nombre + apellido (2+ palabras) para no fusionar
  // a todas las "Marta" del mundo.
  if (nombre.includes(" ")) {
    const porNombre = candidatos.find((c) => normalizarNombre(c.nombre) === nombre);
    if (porNombre) return porNombre;
  }
  return null;
}
