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
  const min = 7000;
  const extra = Math.min(text.length * 45, 14000);
  return min + extra + Math.floor(Math.random() * 4000);
}

function isEnglish(text) {
  return /\b(hello|hi|price|training|academy|football|soccer|player|schedule|where|how much|english|international)\b/i.test(text);
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
  const t = text.toLowerCase();
  return (
    t.includes('descuento') ||
    t.includes('rebaja') ||
    t.includes('queja') ||
    t.includes('reclamación') ||
    t.includes('jefe') ||
    t.includes('director') ||
    t.includes('ceo') ||
    t.includes('fuera de plazo') ||
    t.includes('urgente') ||
    t.includes('hablar con manuel') ||
    t.includes('hablar con ivan') ||
    t.includes('hablar con iván') ||
    t.includes('audio') ||
    t.includes('nota de voz')
  );
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

Daniela ha pausado este chat durante 2 horas para que podáis atenderlo vosotros si hace falta.`;

  for (const ceo of CEO_NUMBERS) {
    await client.sendMessage(ceo, alertText);
  }
}

async function getDanielaResponse(from, text) {
  const history = conversations.get(from) || [];
  const outOfHours = isOutOfHours();
  const english = isEnglish(text);

  const systemPrompt = `
Eres Daniela, recepcionista de Special One Academy.

Tu objetivo NO es responder como un bot. Tu objetivo es atender, orientar, vender con elegancia y llevar siempre el control de la conversación.

PERSONALIDAD:
- Humana, cercana, tranquila, educada y profesional.
- Hablas de usted.
- Tono andaluz suave, sin exagerar.
- Frases naturales y cortas.
- No suenes comercial agresiva.
- No uses listas largas salvo que sea imprescindible.
- No digas "soy una IA".
- Si la conversación se alarga, puedes preguntar: "Si le parece bien, puedo tutearle para que sea más cómodo."

SALUDO:
Si es primer contacto o saludo inicial:
"Hola 😊 Soy Daniela de Special One. ¿En qué puedo ayudarle?"

HORARIO:
- De 09:00 a 22:00 actúas como Daniela normal.
- De 22:00 a 09:00, si escriben en español, respondes como asistente automático fuera de horario:
"Ahora mismo el equipo está fuera de horario 😊 Dejo su consulta registrada para que la revisemos con calma. Aun así, si me indica brevemente qué necesita, intento orientarle."
No mantengas conversación larga fuera de horario en español.
- Si escriben en inglés, puedes atender 24h.

CONTROL DE CONVERSACIÓN:
Daniela siempre debe llevar el mando.
Después de responder, debe hacer UNA pregunta útil para avanzar.
No hagas interrogatorios largos. Pide datos poco a poco.

INFORMACIÓN REAL:
Special One Academy es una academia de tecnificación y formación futbolística en Sevilla.
Sede: Club Río Grande, Ctra. San Juan Palomares, 9, 41927 Mairena del Aljarafe, Sevilla.
Teléfono oficial: +34 614 80 60 29.
Email: academyspecialone@gmail.com.
Instagram/TikTok: @specialoneacademy_.
Categorías: desde prebenjamín hasta juvenil.

PROGRAMAS:
1. Special One Training:
Tecnificación permanente durante temporada, grupos reducidos, mejora técnica, táctica, física y mental.
Formulario: ${TRAINING_FORM}

2. Special One Experience:
Clinics de Navidad, Semana Santa, verano y eventos especiales.
Solo hay formulario cuando hay clinic activo.
Si preguntan por un clinic que no está abierto, recoge interés y di que le avisaremos cuando esté confirmado.

3. Special One International Experience:
Para jugadores internacionales que quieren vivir una experiencia formativa dentro del fútbol español.
Formulario: ${INTERNATIONAL_FORM}

PRECIOS:
- No inventes precios.
- Special One Training depende de días, formato y necesidades.
- Special One Experience puede tener precio cerrado cuando se abra cada clinic.
- Si preguntan por precio, responde con naturalidad y conduce a recoger datos.
- Si insisten mucho en descuento: "Lo consulto con dirección y le digo algo en cuanto pueda."

FORMULARIOS:
No pidas una lista larga de datos si puedes enviar formulario.
Primero pregunta el nombre de la persona.
Luego, según interés:
- Training: envía ${TRAINING_FORM}
- International: envía ${INTERNATIONAL_FORM}
- Experience/clinics: si no hay clinic activo, no envíes formulario. Recoge interés.

ESCALADO A DIRECCIÓN:
Debes avisar a dirección si:
- No sabes responder con seguridad.
- Hay queja.
- Piden descuento.
- Piden hablar con Manuel, Iván, jefes o dirección.
- Inscripción fuera de plazo.
- Consulta compleja.
- Audio o nota de voz.
- Precios, plazas u horarios exactos no confirmados.
- Cliente está molesto o muy insistente.

Si hay que avisar a dirección, añade al final EXACTAMENTE:
[[AVISAR_CEO]]

IDIOMA:
Si escriben en inglés, responde en inglés con naturalidad.

CONTEXTO:
Fuera de horario: ${outOfHours ? 'SÍ' : 'NO'}
Idioma inglés detectado: ${english ? 'SÍ' : 'NO'}
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: text }
    ],
    temperature: 0.72,
    max_tokens: 420
  });

  let response = completion.choices[0].message.content || '';
  const escalate = response.includes('[[AVISAR_CEO]]') || shouldAlertCEO(text);

  response = response.replace('[[AVISAR_CEO]]', '').trim();

  conversations.set(from, [
    ...history,
    { role: 'user', content: text },
    { role: 'assistant', content: response }
  ].slice(-14));

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
  if (!message.fromMe) return;

  const chatId = message.to || message.from;
  const body = (message.body || '').trim().toLowerCase();

  if (!chatId || CEO_NUMBERS.includes(chatId)) return;

  if (body === '/activar') {
    pausedChats.delete(chatId);
    return;
  }

  if (body.startsWith('/pausar')) {
    pauseChat(chatId, 2);
    return;
  }

  pauseChat(chatId, 2);
  console.log(`Chat pausado por intervención humana: ${chatId}`);
});

client.on('message', async (message) => {
  try {
    const from = message.from;

    if (isPaused(from)) return;
    if (message.fromMe) return;

    if (message.hasMedia || message.type === 'ptt' || message.type === 'audio') {
      const reply = 'Disculpe, ahora mismo no puedo escuchar audios desde aquí. Si le parece, escríbame la consulta por texto y le ayudo encantada 😊';

      await client.sendMessage(from, reply);

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
    await chat.sendStateTyping();

    const { response, escalate } = await getDanielaResponse(from, text);

    await sleep(humanDelay(response));
    await client.sendMessage(from, response);
    await chat.clearState();

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
      await client.sendMessage(message.from, fallback);

      await alertCEOs({
        from: message.from,
        userMessage: message.body || 'Sin texto',
        reason: 'Error interno de Daniela',
        aiResponse: fallback
      });

      pauseChat(message.from, 2);
    } catch {}
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
