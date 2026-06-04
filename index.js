const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 8080;
const AUTH_PATH = '/app/.wwebjs_auth';

function cleanChromiumLocks(dir) {
  if (!fs.existsSync(dir)) return;
  const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];

  function scan(currentPath) {
    let items = [];
    try {
      items = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of items) {
      const fullPath = path.join(currentPath, item.name);
      if (item.isDirectory()) scan(fullPath);
      else if (lockFiles.includes(item.name)) {
        try {
          fs.rmSync(fullPath, { force: true });
          console.log(`Lock Chromium eliminado: ${fullPath}`);
        } catch {}
      }
    }
  }

  scan(dir);
}

cleanChromiumLocks(AUTH_PATH);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

let qrImage = '';
let whatsappStatus = 'starting';

const conversations = new Map();
const pausedChats = new Map();
const botSentMessages = new Map();
const recentBotBodies = new Map();

const CEO_NUMBERS = [
  '34637993550@c.us',
  '34644287792@c.us'
];

const TRAINING_FORM = 'https://tally.so/r/NpMjqB';
const INTERNATIONAL_FORM = 'https://tally.so/r/pbREOV';
const PREPRETEMPORADA_FORM = 'https://tally.so/r/XxG5eO';

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'specialone-clean-1',
    dataPath: AUTH_PATH
  }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    protocolTimeout: 120000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync'
    ]
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function humanDelay(text) {
  return 1800 + Math.min((text || '').length * 25, 7000) + Math.floor(Math.random() * 1800);
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
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('34') && digits.length === 11) return `${digits}@c.us`;
  if (digits.length === 9) return `34${digits}@c.us`;
  return null;
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

function markBotMessage(chatId, body) {
  botSentMessages.set(chatId, Date.now());

  if (body) {
    const key = normalizeText(body).slice(0, 180);
    recentBotBodies.set(key, Date.now());
  }
}

function wasRecentlySentByBot(chatId, body) {
  const last = botSentMessages.get(chatId);
  if (last && Date.now() - last < 45000) return true;

  const key = normalizeText(body).slice(0, 180);
  const bodyTime = recentBotBodies.get(key);
  if (bodyTime && Date.now() - bodyTime < 45000) return true;

  return false;
}

async function sendDanielaMessage(chatId, text) {
  markBotMessage(chatId, text);
  await client.sendMessage(chatId, text);
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
Desde el WhatsApp de empresa:
/activar

Desde vuestro móvil personal al WhatsApp de empresa:
/activar ${cleanPhone}`;

  for (const ceo of CEO_NUMBERS) {
    try {
      await sendDanielaMessage(ceo, alertText);
    } catch (error) {
      console.error(`Error avisando a CEO ${ceo}:`, error.message);
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

Hablas de usted. Eres cercana, humana, tranquila y profesional.
No pareces ChatGPT. No dices que eres inteligencia artificial.
Frases cortas. No uses respuestas largas. No repitas continuamente el mensaje del cliente.
Siempre avanza la conversación con una pregunta útil.

SALUDO:
Si es primer contacto o saludo inicial, responde solo:
"Hola 😊 Soy Daniela de Special One.

¿En qué puedo ayudarle?"

HORARIO:
Horario humano: 09:00 a 22:00.
Fuera de horario responde breve y no mantengas conversaciones largas.

INFORMACIÓN:
Special One Academy es una academia de tecnificación y formación futbolística.
Ubicación: Club Río Grande, Mairena del Aljarafe, Sevilla.
Teléfono: +34 614 80 60 29.
Email: academyspecialone@gmail.com.
Instagram y TikTok: @specialoneacademy_.

PROGRAMAS:
1. Special One Training:
Tecnificación semanal. Formulario: ${TRAINING_FORM}

2. Special One Experience:
Clinics de Navidad, Semana Santa, verano y eventos especiales.

3. Special One International Experience:
Formulario: ${INTERNATIONAL_FORM}

4. Pre Pretemporada Special One 2026:
Evento especial dentro de Special One Experience.
Fechas: del 29 de junio al 31 de julio.
Formulario: ${PREPRETEMPORADA_FORM}
Pack 5 sesiones: 99€
Pack 10 sesiones: 179€
Promoción hasta el 21 de junio: Pack 10 sesiones por 169€ + camiseta oficial incluida.
Camiseta oficial: 15€
Equipación completa: 20€
Mañanas: lunes a viernes de 09:00 a 11:00.
Tardes: lunes, miércoles y jueves de 20:00 a 22:00.
No hay martes tarde ni viernes tarde.

REGLA ACTUAL:
Hasta final de julio, si preguntan por apuntarse, entrenar, verano, julio, próximos clinics o tecnificación pendiente, orienta primero hacia la Pre Pretemporada.

Nunca inventes precios.
Si piden descuento, queja, dirección, Manuel, Iván o situación compleja, añade [[AVISAR_CEO]].

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
  whatsappStatus = 'qr_ready';
  qrImage = await qrcode.toDataURL(qr);
  console.log('📲 QR listo en /qr');
});

client.on('loading_screen', (percent, message) => {
  console.log(`⏳ Cargando WhatsApp: ${percent}% - ${message}`);
});

client.on('authenticated', () => {
  whatsappStatus = 'authenticated';
  console.log('🔐 WhatsApp autenticado correctamente');
});

client.on('auth_failure', (msg) => {
  whatsappStatus = 'auth_failure';
  console.error('❌ Error de autenticación WhatsApp:', msg);
});

client.on('ready', () => {
  whatsappStatus = 'ready';
  qrImage = '';
  console.log('✅ DANIELA SPECIAL ONE ONLINE');
});

client.on('disconnected', (reason) => {
  whatsappStatus = 'disconnected';
  console.error('🔌 WhatsApp desconectado:', reason);
});

client.on('message_create', async (message) => {
  try {
    if (!message.fromMe) return;

    const chatId = message.to || message.from;
    const body = (message.body || '').trim();

    if (!chatId) return;

    if (wasRecentlySentByBot(chatId, body)) {
      console.log(`Mensaje automático ignorado para pausa: ${chatId}`);
      return;
    }

    const cleanBody = normalizeText(body);

    if (cleanBody === '/activar') {
      activateChat(chatId);
      console.log(`Chat reactivado manualmente desde empresa: ${chatId}`);
      return;
    }

    if (cleanBody.startsWith('/pausar')) {
      pauseChat(chatId, 2);
      console.log(`Chat pausado manualmente desde empresa: ${chatId}`);
      return;
    }

    if (CEO_NUMBERS.includes(chatId)) {
      console.log(`Mensaje hacia CEO ignorado para pausa: ${chatId}`);
      return;
    }

    pauseChat(chatId, 2);
    console.log(`Chat pausado por intervención humana real desde WhatsApp empresa: ${chatId}`);

  } catch (error) {
    console.error('Error en message_create:', error.message);
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
        await sendDanielaMessage(from, 'Envíe el comando así: /activar 614806029');
        return;
      }
      activateChat(targetChatId);
      await sendDanielaMessage(from, `Daniela reactivada para el chat ${targetChatId.replace('@c.us', '')}.`);
      return;
    }

    if (CEO_NUMBERS.includes(from) && cleanText.startsWith('/pausar')) {
      const targetChatId = normalizePhone(text);
      if (!targetChatId) {
        await sendDanielaMessage(from, 'Envíe el comando así: /pausar 614806029');
        return;
      }
      pauseChat(targetChatId, 2);
      await sendDanielaMessage(from, `Daniela pausada durante 2 horas para el chat ${targetChatId.replace('@c.us', '')}.`);
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
    console.error('Error Daniela:', error.message);
  }
});

app.get('/', (req, res) => {
  res.send(`Daniela activa 🚀 | Estado WhatsApp: ${whatsappStatus}`);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    whatsapp: whatsappStatus,
    pausedChats: pausedChats.size,
    conversations: conversations.size,
    uptime: process.uptime()
  });
});

app.get('/qr', (req, res) => {
  if (!qrImage) {
    return res.send(`QR aún no generado o WhatsApp ya está vinculado. Estado actual: ${whatsappStatus}`);
  }

  res.send(`
    <html>
      <body style="font-family:Arial;text-align:center;padding:40px;">
        <h1>QR WhatsApp Special One</h1>
        <img src="${qrImage}" width="360"/>
        <p>Escanéalo desde WhatsApp → Dispositivos vinculados</p>
        <p>Estado actual: ${whatsappStatus}</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log('Servidor web activo en puerto', PORT);
});

client.initialize().catch((error) => {
  whatsappStatus = 'initialize_error';
  console.error('❌ Error inicializando WhatsApp:', error);
});
