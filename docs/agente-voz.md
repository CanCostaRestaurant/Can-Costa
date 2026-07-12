# Agente de voz telefónico — reservas por teléfono con IA

Un número de teléfono al que llama el cliente; una IA con voz natural coge la
llamada, mira la disponibilidad REAL del motor de reservas y agenda la mesa en
el CRM (con SMS de confirmación al cliente). Las reservas entran con
`origen='telefono'`.

## Arquitectura

```
Cliente llama ──► Número (Twilio/nativo)
                      │
              Plataforma de voz            ←— aquí vive la VOZ (STT + TTS +
              (ElevenLabs Agents / Vapi)       turnos + interrupciones + LLM)
                      │  tools (webhooks con Bearer)
                      ▼
        can-costa.vercel.app/api/voz/*     ←— aquí vive la VERDAD
          ├─ POST /disponibilidad   ¿hay mesa? horas libres + otras fechas
          ├─ POST /reservar         crea la reserva (mesa real + SMS)
          └─ GET  /info             horarios/dirección/teléfono (de Ajustes)
```

La plataforma pone la conversación; **nuestros endpoints ponen los datos** —
el agente no puede inventarse huecos ni reservar donde no cabe, porque usa el
mismo motor que la web y el CRM.

## Autenticación

Todas las llamadas llevan `Authorization: Bearer <secreto>`, donde el secreto
es `VOZ_SECRET` (si se define en Vercel) o, en su defecto, `CRON_SECRET`.

## Endpoints

### POST /api/voz/disponibilidad
```json
{ "fecha": "2026-07-18", "comensales": 4, "hora": "21:00" }
```
`hora` es opcional (la que pidió el cliente). Respuesta:
```json
{
  "ok": true,
  "fecha_hablada": "sábado 18 de julio",
  "hay_mesa": true,
  "horas_libres": [ { "servicio": "Cena", "horas": ["20:00", "20:15", "..."] } ],
  "hora_pedida": { "hora": "21:00", "libre": false, "alternativas_cercanas": ["20:45", "21:15"] },
  "otras_fechas_con_hueco": [ { "fecha": "2026-07-19", "fecha_hablada": "domingo 19 de julio", "desde_hora": "13:00" } ]
}
```
`otras_fechas_con_hueco` solo llega si el día está completo (cross-selling).

### POST /api/voz/reservar
```json
{ "nombre": "Marta Vila", "telefono": "+34600111222", "fecha": "2026-07-18",
  "hora": "20:45", "comensales": 4, "notas": "trona para el peque" }
```
Respuesta ok: `{ ok, confirmada, fecha_hablada, hora, mesa_hasta, sms_confirmacion_enviado }`.
Si la mesa voló mientras hablaban: `{ ok: false, error, alternativas_horas: ["20:15","21:15"] }`
para re-ofrecer sin colgar.

### GET /api/voz/info
Nombre, dirección, teléfono y horarios reales (salen de Ajustes → renombrar el
restaurante o cambiar turnos actualiza también al agente).

### Prueba rápida por curl
```bash
curl -s https://can-costa.vercel.app/api/voz/info -H "Authorization: Bearer $SECRETO"
curl -s https://can-costa.vercel.app/api/voz/disponibilidad \
  -H "Authorization: Bearer $SECRETO" -H "content-type: application/json" \
  -d '{"fecha":"2026-07-20","comensales":2}'
```

## Plataforma recomendada: ElevenLabs Agents

La que más "persona" suena en español (sus voces son el estándar) y lleva
integrado turn-taking, interrupciones y telefonía. Alternativa equivalente:
Vapi (más de desarrollador, permite elegir Claude como cerebro). **Los
endpoints valen igual para ambas** — son webhooks estándar.

Pasos (ElevenLabs):
1. Cuenta en elevenlabs.io → **Agents** → Create agent.
2. **Voz**: una española nativa (probar 2-3; mejor voz femenina/masculina joven
   natural, no "locutor"). Modelo de voz con latencia baja (Flash).
3. **LLM**: Claude (Sonnet) o el que traiga por defecto; temperatura baja.
4. **First message**: ver saludo del prompt.
5. **Tools** (webhook): crear 3 tools con las URLs y JSON de abajo, añadiendo
   header `Authorization: Bearer <secreto>`.
6. **Número**: comprar número en la plataforma o conectar el Twilio existente
   (SIP trunk / import). Asignarlo al agente.
7. Probar desde el dashboard (test call) antes de publicar el número.

### Definición de tools (pegar en la plataforma)

```json
[
  {
    "name": "consultar_disponibilidad",
    "description": "Consulta las horas libres para una fecha y número de personas. Úsala SIEMPRE antes de ofrecer horas. Si el cliente dijo una hora concreta, pásala en 'hora'.",
    "url": "https://can-costa.vercel.app/api/voz/disponibilidad",
    "method": "POST",
    "parameters": {
      "fecha": { "type": "string", "description": "YYYY-MM-DD" },
      "comensales": { "type": "integer", "description": "1-20" },
      "hora": { "type": "string", "description": "HH:MM opcional, la que pidió el cliente" }
    }
  },
  {
    "name": "crear_reserva",
    "description": "Crea la reserva DEFINITIVA. Solo tras confirmar en voz alta fecha, hora, personas y nombre con el cliente.",
    "url": "https://can-costa.vercel.app/api/voz/reservar",
    "method": "POST",
    "parameters": {
      "nombre": { "type": "string" },
      "telefono": { "type": "string", "description": "el número del llamante" },
      "fecha": { "type": "string", "description": "YYYY-MM-DD" },
      "hora": { "type": "string", "description": "HH:MM" },
      "comensales": { "type": "integer" },
      "notas": { "type": "string", "description": "alergias, trona, terraza, celebración… opcional" }
    }
  },
  {
    "name": "info_restaurante",
    "description": "Horarios, dirección y teléfono del restaurante, para preguntas generales.",
    "url": "https://can-costa.vercel.app/api/voz/info",
    "method": "GET"
  }
]
```

### System prompt del agente (pegar tal cual y ajustar nombre si cambia)

> OJO: los días de cierre van GRABADOS en el prompt (respuesta instantánea,
> sin esperar a la tool). Si cambian los "Días de cierre" en Ajustes de
> reservas, hay que actualizar también el bloque DÍAS DE CIERRE del agente.

```
Eres la persona que coge el teléfono en Can Costa, un restaurante de cocina
mediterránea de mercado en Barcelona. Suenas como alguien de la casa: cercana,
resolutiva, con calma. NUNCA dices que eres una IA salvo pregunta directa (en
ese caso lo reconoces con naturalidad y sigues ayudando).

IDIOMA: saluda en castellano; si el cliente habla catalán, cambias a catalán
sin comentarlo. Frases CORTAS, de teléfono real. Nada de listas largas ni tono
de locutor.

DÍAS DE CIERRE: cerramos SIEMPRE domingo y lunes (descanso semanal); abrimos
de martes a sábado. Si piden domingo o lunes (aunque digan "hoy" o "mañana"),
dilo AL INSTANTE, sin pedir comensales ni consultar nada: "uy, los domingos y
lunes cerramos — ¿te va bien el martes?".

FECHAS: tu reloj interno NO es fiable. La única verdad son los campos hoy,
hoy_hablado, manana y manana_hablado (hora de Madrid) que devuelven TODAS las
herramientas; si necesitas saber qué día es y aún no has usado ninguna, llama
a info_restaurante. OJO: hoy y manana son SOLO calendario, NO disponibilidad.
Solo puedes ofrecer fechas que estén en otras_fechas_con_hueco y horas que
estén en horas_libres o alternativas: JAMÁS ofrezcas fechas u horas de tu
cosecha. Si el cliente te corrige la fecha, PARA: recalcula con hoy y manana,
vuelve a consultar disponibilidad y solo entonces confirma. Repite siempre la
fecha_hablada de la herramienta, nunca un día calculado por ti. La PRIMERA
vez que ofrezcas horas de un día, di la fecha_hablada entera ("el martes
catorce tengo a las ocho"), no solo la hora; y si la fecha_hablada NO cuadra
con el día de la semana que dijo el cliente, avísale antes de seguir ("ojo,
ese día cae en miércoles — ¿querías el martes catorce?") y aclara la fecha
buena consultando de nuevo.

TU TRABAJO: reservar mesa. Necesitas: día, hora, personas y nombre. Pide los
datos que falten JUNTOS en una sola pregunta ("¿para cuántos y a qué hora?"),
nada de gotear preguntas. TELÉFONO: si el sistema te da el del llamante,
confirma solo los últimos dígitos; si te lo dictan, repítelo ENTERO de vuelta
y espera el "sí" antes de cerrar ("seis tres dos, seis tres ocho, seis uno
tres — ¿correcto?").

REGLAS DE ORO
1. JAMÁS afirmes que hay o no hay mesa sin consultar_disponibilidad (única
   excepción: domingo y lunes, cerrado sin mirar).
2. No leas listas enteras de horas: ofrece 2, máximo 3.
3. Hora ocupada: ofrece las alternativas_cercanas con naturalidad, sin
   disculparte dos veces.
4. Día completo o cerrado:true: dilo claro y ofrece SOLO las
   otras_fechas_con_hueco.
5. Antes de crear_reserva, confirma TODO en una frase con la fecha_hablada de
   la última consulta: "Mesa para cuatro el sábado dieciocho a las nueve menos
   cuarto a nombre de Marta, ¿te lo cierro?". Solo con el sí llamas a
   crear_reserva.
6. Tras reservar: repite la fecha_hablada que devuelve crear_reserva (con su
   día de la semana) y despide corto. Si no es la fecha que quería el cliente,
   discúlpate y arréglalo antes de colgar. Si sms_confirmacion_enviado es
   true, di que le llega un SMS.
7. Grupos de MÁS de 20, eventos, facturas, proveedores o quejas: toma nombre
   y teléfono, di que el equipo devuelve la llamada enseguida y despídete
   amable. No inventes políticas.
8. Alergias, trona, terraza o celebraciones van en "notas" de la reserva.
9. Cancelar o cambiar una reserva existente: toma nombre y teléfono y di que
   el equipo lo gestiona y confirma por SMS.
10. Lo que no sepas (parking, menú del día, precios): info_restaurante para
    horarios y dirección; el resto, a la web o el equipo le llama. NO
    inventes.

RITMO: ágil y al grano. Respuestas de una o dos frases, una sola pregunta por
turno, no repitas lo que el cliente ya ha dicho. Muletillas suaves solo ANTES
de usar una herramienta ("un segundo, que lo miro..."). Números y horas
siempre en palabras ("a las nueve menos cuarto", no "20:45").
```

SALUDO INICIAL (campo "First message" del agente): "Can Costa, buenas, ¿en
qué te puedo ayudar?"

## Checklist anti-robot (lo que marca la diferencia)

- **Voz**: española nativa de ElevenLabs, velocidad ~1.05. Probar 3 y elegir.
- **Interrupciones (barge-in) ON**: si el cliente habla encima, el agente calla.
- **Latencia**: modelo de voz Flash + respuestas de tool rápidas (las nuestras
  van a Frankfurt como la BD; bien). Objetivo <1s de silencio.
- **"Un segundo, que lo miro…"** antes de cada tool: convierte la latencia en
  naturalidad (ya está en el prompt).
- **2-3 horas por oferta**, nunca la lista entera (ya está en el prompt).
- **Horas en palabras**, no "veinte cuarenta y cinco" (ya está en el prompt).
- **Sonido ambiente** de sala muy bajo (opción de la plataforma): descuelga la
  sensación de "cabina". Opcional, probar.
- **Test A/B contigo mismo**: llama, intenta pillarla (habla encima, cambia de
  idea, pide fecha imposible) y ajusta el prompt con lo que chirríe.

## Costes aproximados

- Plataforma de voz todo incluido: ~0,08–0,15 €/minuto de llamada.
- Número: ~2–5 €/mes (Twilio +34 o número de la plataforma).
- Nuestros endpoints: coste cero extra (van con el hosting actual).
Una llamada de reserva típica dura 1-2 min → ~0,10–0,30 € por reserva captada.

## Qué falta para encenderlo (checklist)

1. [ ] Cuenta en la plataforma de voz (ElevenLabs Agents o Vapi).
2. [ ] Crear el agente: voz + prompt de arriba + las 3 tools con el Bearer.
3. [ ] Número: comprar o conectar el Twilio existente, y asignarlo al agente.
4. [ ] Test call desde el dashboard; luego llamada real al número.
5. [ ] Poner el número en la web/Google cuando estéis contentos.
```
