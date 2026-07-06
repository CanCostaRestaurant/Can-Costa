// Envío de correo desde la MISMA cuenta Gmail del buzón de facturas
// (IMAP_USER + IMAP_PASSWORD, contraseña de aplicación): la credencial que ya
// usa el cron para LEER también autentica en smtp.gmail.com para ENVIAR, así
// que no hace falta dar de alta ningún proveedor nuevo. Si faltan las claves
// devuelve { enviado: false } con el motivo (el envío nunca rompe la app).
import nodemailer from "nodemailer";

export type Adjunto = { nombre: string; contenido: Buffer; tipo: string };

export type ResultadoCorreo = { enviado: boolean; motivo?: string };

export async function enviarCorreo(datos: {
  para: string;
  asunto: string;
  html: string;
  texto?: string; // versión en texto plano (multipart/alternative → menos spam)
  responderA?: string; // Reply-To (a dónde van las respuestas del cliente)
  nombreRemitente?: string; // "Can Costa SL" — el correo es el del buzón
  adjuntos?: Adjunto[];
}): Promise<ResultadoCorreo> {
  const usuario = process.env.IMAP_USER;
  const clave = process.env.IMAP_PASSWORD;
  if (!usuario || !clave) {
    return { enviado: false, motivo: "correo sin configurar (IMAP_USER / IMAP_PASSWORD)" };
  }

  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true,
    auth: { user: usuario, pass: clave },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transporte.sendMail({
      from: datos.nombreRemitente ? `"${datos.nombreRemitente.replaceAll('"', "")}" <${usuario}>` : usuario,
      to: datos.para,
      replyTo: datos.responderA,
      subject: datos.asunto,
      text: datos.texto,
      html: datos.html,
      attachments: datos.adjuntos?.map((a) => ({
        filename: a.nombre,
        content: a.contenido,
        contentType: a.tipo,
      })),
    });
    return { enviado: true };
  } catch (e) {
    console.error("[correo] envío falló:", e instanceof Error ? e.message : e);
    return { enviado: false, motivo: "no se pudo enviar el correo (revisa la conexión del buzón)" };
  } finally {
    transporte.close();
  }
}
