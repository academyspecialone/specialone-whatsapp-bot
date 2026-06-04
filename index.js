const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 8080;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

let qrImage = '';

const conversations = new Map();
const pausedChats = new Map();
const botSentMessages = new Map();

const CEO_NUMBERS = [
  '34637993550@c.us',
  '34644287792@c.us'
];

const TRAINING_FORM = 'https://tally.so/r/NpMjqB';
const INTERNATIONAL_FORM = 'https://tally.so/r/pbREOV';
const PREPRETEMPORADA_FORM = 'https://tally.so/r/XxG5eO';

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'specialone-clean-1'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function humanDelay(text) {
  const min = 1800;
  const extra = Math.min((text || '').length * 25, 7000);
  return min + extra + Math.floor(Math.random() * 1800);
}

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizePhone(raw) {
  if (!raw) return null;

  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('34') && digits.length === 11) {
    return `${digits}@c.us`;
  }

  if (digits.length === 9) {
    return `34${digits}@c.us`;
  }

  return null;
}

function markBotMessage(chatId) {
  botSentMessages.set(chatId, Date.now());
}

function wasRecentlySentByBot(chatId) {
  const last = botSentMessages.get(chatId);
  if (!last) return false;
  return Date.now() - last < 30000;
}

function pauseChat(chatId, hours = 2) {
  pausedChats.set(chatId, Date.now() + hours * 60 * 60 * 1000);
}

function activateChat(chatId) {
  pausedChats.delete(chatId);
}

function isPaused(chatId) {
  const until = pausedChats.get(chatId);

  if (!until) return false;

  if (Date.now() > until) {
    pausedChats.delete(chatId);
    return false;
  }

  return true;
}

function isEnglish(text) {
  return /\b(hello|hi|price|training|academy|football|soccer|player|schedule|where|how much|english|international|information|register|sign up)\b/i.test(text);
}

function getMadridHour() {
  return Number(
    new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      hour12: false
    }).format(new Date())
  );
}

function isOutOfHours() {
  const hour = getMadridHour();
  return hour >= 22 || hour < 9;
}

function shouldAlertCEO(text) {
  const t = normalizeText(text);

  return (
    t.includes('descuento') ||
    t.includes('rebaja') ||
    t.includes('queja') ||
    t.includes('reclamacion') ||
    t.includes('reclamar') ||
    t.includes('jefe') ||
    t.includes('director') ||
    t.includes('direccion') ||
    t.includes('ceo') ||
    t.includes('fuera de plazo') ||
    t.includes('urgente') ||
    t.includes('problema') ||
    t.includes('molesto') ||
    t.includes('enfadado') ||
    t.includes('devolucion') ||
    t.includes('devolver') ||
    t.includes('dinero') ||
    t.includes('hablar con manuel') ||
    t.includes('hablar con ivan') ||
    t.includes('audio') ||
    t.includes('nota de voz')
  );
}

function isPrePretemporadaIntent(text) {
  const t = normalizeText(text);

  return (
    t.includes('pretemporada') ||
    t.includes('pre pretemporada') ||
    t.includes('julio') ||
    t.includes('verano') ||
    t.includes('entrenamiento verano') ||
    t.includes('entrenamientos verano') ||
    t.includes('entrenamiento en julio') ||
    t.includes('entrenamientos en julio') ||
    t.includes('proximo clinic') ||
    t.includes('proximos clinic') ||
    t.includes('proximos clinics') ||
    t.includes('tecnificaciones pendientes') ||
    t.includes('teneis tecnificacion') ||
    t.includes('teneis algo en verano')
  );
}

function isGenericSignupIntent(text) {
  const t = normalizeText(text);

  return (
    t.includes('apuntar a mi hijo') ||
    t.includes('inscribir a mi hijo') ||
    t.includes('apuntar mi hijo') ||
    t.includes('inscribir mi hijo') ||
    t.includes('quiero apuntarlo') ||
    t.includes('puedo apuntar') ||
    t.includes('hay plazas') ||
    t.includes('informacion para mi hijo')
  );
}

function isPrePretemporadaFormConfirmation(text) {
  const t = normalizeText(text);

  return (
    t.includes('acabo de completar el formulario de inscripcion de la pre pretemporada special one 2026') ||
    t.includes('acabo de completar el formulario de la pre pretemporada special one 2026') ||
    t.includes('quedo pendiente de la confirmacion de mi solicitud')
  );
}

async function sendDanielaMessage(chatId, text) {
  markBotMessage(chatId);
  await client.sendMessage(chatId, text);
}

async function alertCEOs({ from, userMessage, reason, aiResponse }) {
  const cleanPhone = from.replace('@c.us', '');

  const alertText =
`🚨 DANIELA - AVISO A DIRECCIÓN

Motivo: ${reason}

Cliente: ${from}

Mensaje recibido:
"${userMessage}"

Respuesta de Daniela:
"${aiResponse || 'Pendiente'}"

El chat queda pausado durante 2 horas.

Para reactivar Daniela en este chat:
Enviar desde este WhatsApp de empresa en el chat del cliente:
/activar

O enviar desde vuestro móvil personal al WhatsApp de empresa:
/activar ${cleanPhone}`;

  for (const ceo of CEO_NUMBERS) {
    try {
      await client.sendMessage(ceo, alertText);
    } catch (error) {
      console.error(`Error avisando a CEO ${ceo}:`, error);
    }
  }
}

async function safeOpenAIRequest(payload) {
  return Promise.race([
    openai.chat.completions.create(payload),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OpenAI timeout')), 20000)
    )
  ]);
}

async function getDanielaResponse(from, text) {
  const history = conversations.get(from) || [];
  const outOfHours = isOutOfHours();
  const english = isEnglish(text);

  const systemPrompt = `
Eres Daniela, recepcionista humana de Special One Academy.

No eres un bot comercial.
No pareces ChatGPT.
No dices que eres inteligencia artificial.
Trabajas en la academia y atiendes WhatsApp como una persona real.

PERSONALIDAD:
- Cercana, humana, tranquila, educada y profesional.
- Hablas de usted.
- Natural, sin sonar perfecta.
- Frases cortas.
- No uses respuestas largas.
- No uses listas salvo que sea necesario.
- No abuses de emojis. Solo 😊 o ⚽ cuando tenga sentido.
- No empieces repitiendo lo que el cliente acaba de decir.
- Siempre debes avanzar la conversación con una pregunta útil.

SALUDO:
Si es primer contacto o saludo inicial, responde solo:
"Hola 😊 Soy Daniela de Special One.

¿En qué puedo ayudarle?"

HORARIO:
- Horario humano: 09:00 a 22:00.
- Fuera de horario, en español, responde breve:
"Ahora mismo estamos fuera de horario 😊

Dejo su consulta anotada para revisarla en cuanto volvamos.

Si me indica brevemente qué necesita intentaré orientarle."
- Fuera de horario no mantengas conversaciones largas.
- Si escriben en inglés, atiende en inglés.

INFORMACIÓN REAL:
Special One Academy es una academia de tecnificación y formación futbolística.
Ubicación: Club Río Grande, Ctra. San Juan Palomares, 9, 41927 Mairena del Aljarafe, Sevilla.
Teléfono: +34 614 80 60 29.
Email: academyspecialone@gmail.com.
Instagram y TikTok: @specialoneacademy_.
Categorías: desde prebenjamín hasta juvenil.

PROGRAMAS:
1. Special One Training:
Tecnificación semanal durante la temporada.
Grupos reducidos.
Trabajo técnico, táctico, físico y mental.
Formulario: ${TRAINING_FORM}

2. Special One Experience:
Clinics de Navidad, Semana Santa, verano y eventos especiales.
No tiene formulario permanente salvo cuando hay evento activo.

3. Special One International Experience:
Programa internacional para jugadores extranjeros.
Formulario: ${INTERNATIONAL_FORM}

4. Pre Pretemporada Special One 2026:
Evento especial dentro de Special One Experience.
Fechas: del 29 de junio al 31 de julio.
Actividad principal actual de la academia.
Diseñada para jugadores que quieren mantener ritmo competitivo en verano y llegar mejor preparados a la temporada.
Formulario: ${PREPRETEMPORADA_FORM}

Precios:
- Pack 5 sesiones: 99€
- Pack 10 sesiones: 179€
- Promoción hasta el 21 de junio: Pack 10 sesiones por 169€ + camiseta oficial incluida.
- Camiseta oficial: 15€
- Equipación completa camiseta + calzona: 20€
- Los jugadores que ya tengan equipación oficial Special One pueden usar la que ya tienen.

HORARIOS PRE PRETEMPORADA:
Los grupos se organizarán según demanda.
Mañanas: lunes, martes, miércoles, jueves y viernes de 09:00 a 11:00.
Tardes: lunes, miércoles y jueves de 20:00 a 22:00.
No hay martes tarde ni viernes tarde.

REGLA COMERCIAL ACTUAL:
Hasta final de julio, si preguntan de forma general por apuntarse, entrenar, verano, julio, próximos clinics o tecnificación pendiente, debes orientar primero hacia la Pre Pretemporada Special One 2026.

PRECIOS:
Nunca inventes precios fuera de los indicados.
Si preguntan por Training, indica que depende de días y formato.
Si preguntan por Experience fuera de Pre Pretemporada, depende de cada clinic.
Si preguntan por International, depende del programa.

FORMULARIOS:
No hagas interrogatorios largos.
Primero pregunta lo mínimo necesario.
Si es Pre Pretemporada, puedes enviar directamente ${PREPRETEMPORADA_FORM}.
Si es Training, envía ${TRAINING_FORM}.
Si es International, envía ${INTERNATIONAL_FORM}.

DESCUENTOS:
No hay descuentos generales.
Si insisten, responde:
"Lo consulto con dirección y le digo algo en cuanto pueda."
Y añade [[AVISAR_CEO]].

ESCALADO:
Añade exactamente [[AVISAR_CEO]] si:
- Hay queja.
- Hay reclamación.
- Piden descuento.
- Solicitan hablar con dirección.
- Piden hablar con Manuel o Iván.
- Hay inscripción fuera de plazo.
- Hay una situación compleja.
- No sabes responder con seguridad.
- Cliente está molesto o insistente.
- Hay audio o nota de voz.

IDIOMA:
Si escriben en inglés, responde completamente en inglés.

CONTEXTO:
Fuera de horario: ${outOfHours ? 'SÍ' : 'NO'}
Idioma inglés detectado: ${english ? 'SÍ' : 'NO'}
`;

  const completion = await safeOpenAIRequest({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: text }
    ],
    temperature: 0.72,
    max_tokens: 360
  });

  let response = completion?.choices?.[0]?.message?.content || '';

  if (!response.trim()) {
    response = 'Disculpe, ahora mismo no he podido revisar bien su mensaje. ¿Puede repetírmelo brevemente?';
  }

  const escalate = response.includes('[[AVISAR_CEO]]') || shouldAlertCEO(text);

  response = response.replace('[[AVISAR_CEO]]', '').trim();

  conversations.set(from, [
    ...history,
    { role: 'user', content: text },
    { role: 'assistant', content: response }
  ].slice(-12));

  return { response, escalate };
}

client.on('qr', async (qr) => {
  qrImage = await qrcode.toDataURL(qr);
  console.log('QR listo en /qr');
});

client.on('ready', () => {
  console.log('✅ DANIELA SPECIAL ONE ONLINE');
});

client.on('message_create', async (message) => {
  try {
    if (!message.fromMe) return;

    const chatId = message.to || message.from;
    const body = (message.body || '').trim().toLowerCase();

    if (!chatId) return;

    if (CEO_NUMBERS.includes(chatId)) return;

    if (body === '/activar') {
      activateChat(chatId);
      console.log(`Chat reactivado manualmente desde empresa: ${chatId}`);
      return;
    }

    if (body.startsWith('/pausar')) {
      pauseChat(chatId, 2);
      console.log(`Chat pausado manualmente desde empresa: ${chatId}`);
      return;
    }

    if (wasRecentlySentByBot(chatId)) {
      return;
    }

    pauseChat(chatId, 2);
    console.log(`Chat pausado por intervención humana real desde WhatsApp empresa: ${chatId}`);

  } catch (error) {
    console.error('Error en message_create:', error);
  }
});

client.on('message', async (message) => {
  try {
    const from = message.from;
    const text = (message.body || '').trim();
    const cleanText = normalizeText(text);

    if (!from) return;
    if (message.fromMe) return;

    if (CEO_NUMBERS.includes(from) && cleanText.startsWith('/activar')) {
      const targetChatId = normalizePhone(text);

      if (!targetChatId) {
        await sendDanielaMessage(from, 'No he podido identificar el teléfono. Envíe el comando así: /activar 614806029');
        return;
      }

      activateChat(targetChatId);
      await sendDanielaMessage(from, `Daniela reactivada para el chat ${targetChatId.replace('@c.us', '')}.`);
      console.log(`Chat reactivado por CEO: ${targetChatId}`);
      return;
    }

    if (CEO_NUMBERS.includes(from) && cleanText.startsWith('/pausar')) {
      const targetChatId = normalizePhone(text);

      if (!targetChatId) {
        await sendDanielaMessage(from, 'No he podido identificar el teléfono. Envíe el comando así: /pausar 614806029');
        return;
      }

      pauseChat(targetChatId, 2);
      await sendDanielaMessage(from, `Daniela pausada durante 2 horas para el chat ${targetChatId.replace('@c.us', '')}.`);
      console.log(`Chat pausado por CEO: ${targetChatId}`);
      return;
    }

    if (isPaused(from)) return;

    if (message.hasMedia || message.type === 'ptt' || message.type === 'audio') {
      const reply = 'Disculpe, ahora mismo no puedo escuchar audios desde aquí. Si le parece, escríbame la consulta por texto y le ayudo encantada 😊';

      await sendDanielaMessage(from, reply);

      await alertCEOs({
        from,
        userMessage: 'Audio / nota de voz recibida',
        reason: 'Cliente ha enviado un audio',
        aiResponse: reply
      });

      pauseChat(from, 2);
      return;
    }

    if (!text) return;

    if (isPrePretemporadaFormConfirmation(text)) {
      const reply =
`Perfecto 😊

Hemos recibido correctamente su solicitud para la Pre Pretemporada Special One 2026.

Durante los próximos días terminaremos de organizar los grupos y nos pondremos en contacto con usted para informarle de los siguientes pasos.

Muchas gracias por confiar en Special One Academy ⚽`;

      await sendDanielaMessage(from, reply);
      return;
    }

    if (isPrePretemporadaIntent(text) || isGenericSignupIntent(text)) {
      const reply =
`Sí 😊

Ahora mismo tenemos abierta la Pre Pretemporada Special One 2026.

Se desarrollará del 29 de junio al 31 de julio y está pensada para jugadores que quieran mantener el ritmo competitivo durante el verano y llegar mejor preparados al inicio de temporada.

Puede consultar toda la información e inscribirse aquí:

${PREPRETEMPORADA_FORM}

¿Para qué categoría sería el jugador?`;

      await sleep(humanDelay(reply));
      await sendDanielaMessage(from, reply);
      return;
    }

    const chat = await message.getChat();

    try {
      await chat.sendStateTyping();
    } catch {}

    const { response, escalate } = await getDanielaResponse(from, text);

    await sleep(humanDelay(response));

    await sendDanielaMessage(from, response);

    try {
      await chat.clearState();
    } catch {}

    if (escalate) {
      await alertCEOs({
        from,
        userMessage: text,
        reason: 'Consulta marcada para revisar por dirección',
        aiResponse: response
      });

      pauseChat(from, 2);
    }

  } catch (error) {
    console.error('Error Daniela:', error);

    try {
      const fallback = 'Disculpe, estoy teniendo un pequeño problema ahora mismo. Dejo su mensaje anotado para que el equipo lo revise lo antes posible.';

      await sendDanielaMessage(message.from, fallback);

      await alertCEOs({
        from: message.from,
        userMessage: message.body || 'Sin texto',
        reason: 'Error interno de Daniela',
        aiResponse: fallback
      });

      pauseChat(message.from, 2);
    } catch (fallbackError) {
      console.error('Error enviando fallback:', fallbackError);
    }
  }
});

app.get('/', (req, res) => {
  res.send('Daniela - Special One Academy activa 🚀');
});

app.get('/qr', (req, res) => {
  if (!qrImage) {
    return res.send('QR aún no generado o WhatsApp ya está vinculado.');
  }

  res.send(`
    <html>
      <body style="font-family:Arial;text-align:center;padding:40px;">
        <h1>QR WhatsApp Special One</h1>
        <img src="${qrImage}" width="360"/>
        <p>Escanéalo desde WhatsApp → Dispositivos vinculados</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log('Servidor web activo en puerto', PORT);
});

client.initialize();
