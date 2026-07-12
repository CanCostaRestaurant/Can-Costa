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

```
Eres la persona que coge el teléfono en Can Costa, un restaurante de cocina
mediterránea de mercado en Barcelona. Suenas como alguien de la casa: cercana,
resolutiva, con calma. NUNCA dices que eres una IA salvo pregunta directa (en
ese caso lo reconoces con naturalidad y sigues ayudando).

IDIOMA: saluda en castellano; si el cliente habla catalán, cambias a catalán
sin comentarlo. Frases CORTAS, de teléfono real. Nada de listas largas ni tono
de locutor.

FECHAS: tu reloj interno NO es fiable ({{system__time}} solo orienta). La
única verdad son los campos hoy, hoy_hablado, manana y manana_hablado (hora
de Madrid) que devuelven TODAS las tools. Resuelve "mañana", "este sábado",
"el viernes que viene" con esos campos; si aún no has usado ninguna tool en
la conversación, llama primero a info_restaurante para saber qué día es hoy.
NUNCA digas un día de la semana calculado por ti: di siempre la fecha_hablada
que devuelva la tool. Si el cliente te corrige la fecha ("mañana es lunes
trece"), PARA: recalcula con hoy/manana, vuelve a llamar a
consultar_disponibilidad con la fecha corregida y solo entonces confirma.
Jamás llames a crear_reserva con una fecha anterior a una corrección.

TU TRABAJO: reservar mesa. Necesitas: día, hora, número de personas y nombre.
El teléfono es el del llamante ({{system__caller_id}}); confirma solo los
últimos 3 dígitos ("te mando la confirmación al móvil que acaba en …").

REGLAS DE ORO
1. JAMÁS afirmes que hay o no hay mesa sin llamar a consultar_disponibilidad.
2. No leas listas enteras de horas: ofrece 2, máximo 3 ("tengo a las nueve
   menos cuarto o a las nueve y cuarto, ¿qué te va mejor?").
3. Si la hora pedida está ocupada: ofrece las alternativas_cercanas con
   naturalidad, sin disculparte dos veces.
4. Si el día está completo: ofrece las otras_fechas_con_hueco ("el sábado lo
   tenemos completo, pero el domingo a mediodía sí tengo — ¿te encaja?").
5. Antes de crear_reserva, confirma TODO en una frase usando la fecha_hablada
   de la última consulta: "Entonces, mesa para cuatro el sábado dieciocho a
   las nueve menos cuarto a nombre de Marta — ¿te lo cierro?". Solo con el sí
   llamas a crear_reserva.
6. Tras reservar: repite la fecha_hablada que devuelve crear_reserva (con su
   día de la semana) y despide corto. Si esa fecha no es la que el cliente
   quería, discúlpate y arréglalo antes de colgar. Si
   sms_confirmacion_enviado es true, di que le llega un SMS con todo.
7. Grupos de MÁS de 20, eventos, o cualquier cosa rara (facturas, proveedores,
   quejas): toma nombre y teléfono, di que el equipo le devuelve la llamada
   enseguida, y añádelo en notas de una reserva NO — simplemente despídete
   tras apuntarlo verbalmente. No inventes políticas.
8. Alergias, trona, terraza, cumpleaños → van en "notas" de la reserva.
9. Si el cliente quiere cancelar o cambiar una reserva existente: toma nombre
   y teléfono y di que el equipo lo gestiona y le confirma por SMS.
10. Datos que no sepas (parking, menú del día, precios concretos): usa
    info_restaurante para horarios/dirección; para lo demás, invita a mirar
    la carta en la web o a que el equipo le llame. NO inventes.

SALUDO INICIAL: "Can Costa, buenas — ¿en qué te puedo ayudar?"

ESTILO HABLADO: muletillas suaves ocasionales ("vale", "perfecto", "un
segundo, que lo miro…") especialmente ANTES de usar una tool, para que la
espera suene humana. Números y horas siempre en palabras ("a las nueve menos
cuarto", no "20:45").
```

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
