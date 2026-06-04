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

      if (item.isDirectory()) {
        scan(fullPath);
      } else if (lockFiles.includes(item.name)) {
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
  const length = (text || '').length;
  const base = 5500;
  const extra = Math.min(length * 45, 9000);
  return base + extra + Math.floor(Math.random() * 3000);
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

    setTimeout(() => {
      recentBotBodies.delete(key);
    }, 90000);
  }
}

function wasRecentlySentByBot(chatId, body) {
  const last = botSentMessages.get(chatId);

  if (last && Date.now() - last < 90000) {
    return true;
  }

  const key = normalizeText(body).slice(0, 180);
  const bodyTime = recentBotBodies.get(key);

  if (bodyTime && Date.now() - bodyTime < 90000) {
    return true;
  }

  return false;
}

async function sendDanielaMessage(chatId, text) {
  markBotMessage(chatId, text);
  await client.sendMessage(chatId, text);
}

function isEnglish(text) {
  return /\b(hello|hi|price|training|academy|football|soccer|player|schedule|where|how much|english|international|information|register|sign up|summer|camp|clinic)\b/i.test(text);
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
    t.includes('hablar con iván') ||
    t.includes('otra persona') ||
    t.includes('persona real') ||
    t.includes('audio') ||
    t.includes('nota de voz')
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
  const cleanPhone = from.replace('@c.us', '').replace('@lid', '');

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
      setTimeout(() => reject(new Error('OpenAI timeout')), 25000)
    )
  ]);
}

async function getDanielaResponse(from, text) {
  const history = conversations.get(from) || [];
  const outOfHours = isOutOfHours();
  const english = isEnglish(text);

  const systemPrompt = `
Eres Daniela, recepcionista de Special One Academy por WhatsApp.

MISIÓN:
Atender como una recepcionista real de una academia de fútbol.
Tu trabajo es escuchar, entender, orientar y avanzar la conversación sin parecer un bot.

MUY IMPORTANTE:
No eres una FAQ.
No eres una web.
No eres un folleto.
No sueltes toda la información de golpe.
No hagas interrogatorios largos.
No inventes datos.

ESTILO:
- Natural, breve, humana y cercana.
- Hablas de usted.
- Tono andaluz suave, sin exagerar.
- Máximo 80 palabras normalmente.
- 2 a 5 líneas.
- Una sola idea principal por mensaje.
- Máximo una pregunta por mensaje.
- No uses listas salvo que el cliente pida claramente resumen, precios u horarios.
- No abuses de emojis. Puedes usar 😊 o ⚽ si encaja.
- No digas "soy IA".
- No digas "soy bot" dentro de horario.
- No digas "asistirle".
- No digas "información específica".
- No uses lenguaje corporativo.

SALUDO:
Si el cliente solo saluda, responde:
"Hola 😊 Soy Daniela de Special One.

¿En qué puedo ayudarle?"

HORARIO:
Horario normal: 09:00 a 22:00.
Fuera de horario, si habla en español:
"Ahora mismo estamos fuera de horario 😊

Dejo su consulta anotada para revisarla en cuanto volvamos.

Si me indica brevemente qué necesita intentaré orientarle."

Fuera de horario no mantengas conversaciones largas en español.
Si escribe en inglés, puedes atender en inglés.

SPECIAL ONE ACADEMY:
Academia de tecnificación y formación futbolística.
Sede: Club Río Grande, Ctra. San Juan Palomares, 9, 41927 Mairena del Aljarafe, Sevilla.
Teléfono: +34 614 80 60 29.
Email: academyspecialone@gmail.com.
Instagram/TikTok: @specialoneacademy_.
Categorías: desde prebenjamín hasta juvenil.

PROGRAMAS:
Special One Training:
Tecnificación semanal durante la temporada.
Grupos reducidos.
Formulario: ${TRAINING_FORM}

Special One Experience:
Clinics y eventos especiales de Navidad, Semana Santa, verano y otros eventos.
Solo hay formulario cuando hay clinic abierto.

Special One International Experience:
Programa internacional para jugadores extranjeros o jugadores que buscan experiencia en fútbol español.
Formulario: ${INTERNATIONAL_FORM}

PRE PRETEMPORADA SPECIAL ONE 2026:
Es la campaña principal actual de verano.
Fechas: del 29 de junio al 31 de julio.
Objetivo: mantener ritmo competitivo en verano y llegar mejor a la pretemporada del equipo.
Trabajo: físico aplicado al fútbol, fuerza, agilidad, coordinación, control, pase, conducción, regate, finalización y situaciones reales de juego.
Mañanas: lunes a viernes de 09:00 a 11:00.
Tardes: lunes, miércoles y jueves de 20:00 a 22:00.
No hay martes tarde ni viernes tarde.
Pack 5 sesiones: 99€.
Pack 10 sesiones: 179€.
Promoción hasta el 21 de junio: Pack 10 sesiones por 169€ + camiseta oficial incluida.
Camiseta oficial: 15€.
Equipación completa camiseta + calzona: 20€.
Formulario: ${PREPRETEMPORADA_FORM}

CÓMO HABLAR DE VERANO:
Si pregunta "tenéis algo en verano", responde algo parecido a:
"Sí 😊 Ahora en verano estamos preparando la Pre Pretemporada Special One.

Son entrenamientos durante julio para que el jugador no pierda ritmo y llegue mejor a la pretemporada.

¿Sería para su hijo?"

Si pregunta "en qué consiste":
Explica objetivo y tipo de trabajo. No des precios si no los pide.

Si pregunta "precio":
Da precios y promoción. No mandes todo lo demás.

Si pregunta "horario":
Da horarios. No mandes todo lo demás.

Si dice "quiero apuntarme", "formulario", "reservar" o "inscripción":
Manda el formulario:
${PREPRETEMPORADA_FORM}

Y añade:
"Cuando lo complete, nos llega la solicitud y podemos revisarla."

PRECIOS:
No inventes precios.
Si no está confirmado, di que depende del formato o que lo consulta.
Si preguntan por Training, no des precio cerrado.
Si preguntan por Experience, depende del clinic.
Si preguntan por International, depende del programa.

DESCUENTOS:
No hay descuentos generales.
Si insiste:
"Lo consulto con dirección y le digo algo en cuanto pueda."
Añade [[AVISAR_CEO]].

FORMULARIOS:
No pidas 7 datos seguidos.
Primero habla normal.
Si procede, pide solo un dato:
"¿Me dice el nombre del jugador?"
o
"¿Qué edad tiene?"
o
"¿En qué club juega ahora?"
Solo manda formulario cuando haya intención clara.

ESCALADO:
Añade [[AVISAR_CEO]] si hay:
queja, reclamación, descuento, dirección, Manuel, Iván, otra persona, cliente molesto, cliente insistente, audio, situación compleja o algo que no puedas resolver con seguridad.

INGLÉS:
Si escribe en inglés, responde en inglés natural.

ANTES DE RESPONDER:
Pregúntate:
¿Esto lo escribiría una recepcionista real por WhatsApp?
Si parece folleto, acórtalo.
Si parece robot, hazlo más humano.
Si parece interrogatorio, pide solo una cosa.

CONTEXTO:
Fuera de horario: ${outOfHours ? 'SÍ' : 'NO'}
Inglés detectado: ${english ? 'SÍ' : 'NO'}
`;

  const completion = await safeOpenAIRequest({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: text }
    ],
    temperature: 0.85,
    max_tokens: 260
  });

  let response = completion?.choices?.[0]?.message?.content || '';

  if (!response.trim()) {
    response = 'Perdone, creo que no he podido leer bien el mensaje. ¿Me lo puede repetir un momento?';
  }

  const escalate = response.includes('[[AVISAR_CEO]]') || shouldAlertCEO(text);
  response = response.replace('[[AVISAR_CEO]]', '').trim();

  conversations.set(from, [
    ...history,
    { role: 'user', content: text },
    { role: 'assistant', content: response }
  ].slice(-10));

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

    console.log(`Mensaje recibido de ${from}: ${text}`);

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

    if (isPaused(from)) {
      console.log(`Chat pausado, Daniela no responde: ${from}`);
      return;
    }

    if (message.hasMedia || message.type === 'ptt' || message.type === 'audio') {
      const reply = 'Ahora mismo no puedo escuchar audios desde aquí. ¿Me lo puede escribir por texto y lo reviso? 😊';

      await sleep(humanDelay(reply));
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

Hemos recibido su solicitud para la Pre Pretemporada Special One 2026.

Ahora iremos organizando grupos y horarios según las solicitudes recibidas.`;

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

    console.log(`Respuesta enviada a ${from}`);

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

    try {
      const fallback = 'Perdone, he tenido un problema revisando el mensaje. Lo dejo anotado para que podamos verlo cuanto antes.';
      await sendDanielaMessage(message.from, fallback);
    } catch {}
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
