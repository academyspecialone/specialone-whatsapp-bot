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

function markBotMessage(chatId) {
  botSentMessages.set(chatId, Date.now());
}

function wasRecentlySentByBot(chatId) {
  const last = botSentMessages.get(chatId);
  if (!last) return false;
  return Date.now() - last < 30000;
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

function pauseChat(chatId, hours = 2) {
  pausedChats.set(chatId, Date.now() + hours * 60 * 60 * 1000);
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

function shouldAlertCEO(text) {
  const t = (text || '').toLowerCase();

  return (
    t.includes('descuento') ||
    t.includes('rebaja') ||
    t.includes('queja') ||
    t.includes('reclamación') ||
    t.includes('reclamar') ||
    t.includes('jefe') ||
    t.includes('director') ||
    t.includes('dirección') ||
    t.includes('ceo') ||
    t.includes('fuera de plazo') ||
    t.includes('urgente') ||
    t.includes('problema') ||
    t.includes('molesto') ||
    t.includes('enfadado') ||
    t.includes('devolución') ||
    t.includes('devolver') ||
    t.includes('dinero') ||
    t.includes('hablar con manuel') ||
    t.includes('hablar con ivan') ||
    t.includes('hablar con iván') ||
    t.includes('audio') ||
    t.includes('nota de voz')
  );
}

async function sendDanielaMessage(chatId, text) {
  markBotMessage(chatId);
  await client.sendMessage(chatId, text);
}

async function alertCEOs({ from, userMessage, reason, aiResponse }) {
  const alertText =
`🚨 DANIELA - AVISO A DIRECCIÓN

Motivo: ${reason}

Cliente: ${from}

Mensaje recibido:
"${userMessage}"

Respuesta de Daniela:
"${aiResponse || 'Pendiente'}"

El chat queda pausado durante 2 horas para que podáis intervenir si lo veis necesario.`;

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
- Evita frases tipo "Entiendo que..." salvo que sea natural.
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
Clinics de Navidad, Semana Santa y verano.
No tiene formulario permanente.
Solo hay formulario cuando hay clinic activo.
Nunca inventes precios.

3. Special One International Experience:
Programa internacional para jugadores extranjeros.
Formulario: ${INTERNATIONAL_FORM}

PRECIOS:
Nunca inventes precios.
Training depende de días y formato.
Experience depende de cada clinic.
International depende del programa.
Si piden precio, recoge primero información básica y orienta sin inventar.

FORMULARIOS:
No hagas interrogatorios largos.
Primero pregunta el nombre del jugador.
Después, si procede, envía formulario.

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
- Preguntan precios, plazas u horarios exactos no confirmados.
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
      pausedChats.delete(chatId);
      console.log(`Chat reactivado manualmente: ${chatId}`);
      return;
    }

    if (body.startsWith('/pausar')) {
      pauseChat(chatId, 2);
      console.log(`Chat pausado manualmente: ${chatId}`);
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

    if (!from) return;
    if (message.fromMe) return;
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

    const text = (message.body || '').trim();
    if (!text) return;

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
