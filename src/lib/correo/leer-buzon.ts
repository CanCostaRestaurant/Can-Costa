// Lector del buzón de facturas (Fina): conecta por IMAP a Gmail, coge los
// correos NO LEÍDOS, pasa cada adjunto (PDF/foto) por el pipeline de IA y
// marca el correo como leído. Idempotente: solo se procesan no-leídos y el
// detector de duplicados hace de red de seguridad si algo se repite.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { procesarBufferDocumento, TAMANO_MAXIMO, TIPOS_SOPORTADOS } from "@/lib/documentos/procesar";

export async function leerBuzon(): Promise<{
  ok: boolean;
  error?: string;
  procesados: number;
  aviso?: string;
}> {
  const usuario = process.env.IMAP_USER;
  const contrasena = process.env.IMAP_PASSWORD;
  if (!usuario || !contrasena) {
    return { ok: false, error: "Falta configurar IMAP_USER e IMAP_PASSWORD en el servidor", procesados: 0 };
  }

  const cliente = new ImapFlow({
    host: process.env.IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: { user: usuario, pass: contrasena },
    logger: false,
  });

  let procesados = 0;
  let fallidos = 0;
  try {
    await cliente.connect();
    const candado = await cliente.getMailboxLock("INBOX");
    try {
      const noLeidos = await cliente.search({ seen: false });
      const uids = (noLeidos || []).slice(0, 10); // tanda acotada; el resto, a la siguiente pasada

      for (const uid of uids) {
        try {
          const mensaje = await cliente.fetchOne(String(uid), { source: true });
          if (!mensaje || !mensaje.source) continue;
          const correo = await simpleParser(mensaje.source);

          for (const adjunto of correo.attachments ?? []) {
            const tipo = adjunto.contentType?.toLowerCase() ?? "";
            if (!TIPOS_SOPORTADOS.includes(tipo)) continue;
            if (!adjunto.content || adjunto.content.length === 0 || adjunto.content.length > TAMANO_MAXIMO) continue;

            const resultado = await procesarBufferDocumento({
              base64: adjunto.content.toString("base64"),
              mediaType: tipo,
              origen: "email",
            });
            if (resultado.ok || resultado.facturaId) procesados += 1;
            else fallidos += 1;
          }

          // Leído = procesado: no se vuelve a tocar en la siguiente pasada.
          await cliente.messageFlagsAdd(String(uid), ["\\Seen"]);
        } catch (e) {
          fallidos += 1;
          console.error(`[buzon] correo uid=${uid} falló:`, e instanceof Error ? e.message : e);
        }
      }
    } finally {
      candado.release();
    }
    await cliente.logout();

    return {
      ok: true,
      procesados,
      aviso:
        procesados === 0 && fallidos === 0
          ? "No hay correos nuevos en el buzón"
          : fallidos > 0
            ? `${procesados} documentos a la bandeja · ${fallidos} correos con problemas (se reintentarán)`
            : undefined,
    };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[buzon] conexión falló:", mensaje);
    try {
      await cliente.logout();
    } catch {
      /* ya cerrada */
    }
    return { ok: false, error: `No se pudo leer el buzón: ${mensaje}`, procesados };
  }
}
