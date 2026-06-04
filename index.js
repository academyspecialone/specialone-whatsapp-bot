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
  const length = (text || '').length;
  const base = 3500;
  const extra = Math.min(length * 35, 8500);
  return base + extra + Math.floor(Math.random() * 2500);
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
    recentBotBodies.set(normalizeText(body).slice(0, 180), Date.now());
  }
}

function wasRecentlySentByBot(chatId, body) {
  const last = botSentMessages.get(chatId);
  if (last && Date.now() - last < 45000) return true;

  const bodyTime = recentBotBodies.get(normalizeText(body).slice(0, 180));
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

Tu objetivo es atender como una recepcionista cercana de la academia: natural, breve, tranquila y útil.

NO digas que eres inteligencia artificial.
NO digas que eres un bot.
NO digas "soy una persona".
Si preguntan si eres IA, bot o máquina, evita discutirlo. Responde con naturalidad:
"Soy Daniela, de Special One 😊 Estoy aquí para ayudarle con lo que necesite de la academia."
Después vuelve al tema del cliente.

TONO:
- Habla de usted.
- Cercana, humana, profesional.
- No sonar perfecta.
- No sonar comercial agresiva.
- No escribir tochos.
- No usar respuestas tipo plantilla.
- Máximo 1 emoji si encaja: 😊 o ⚽.
- No repetir continuamente lo que dijo el cliente.
- No cerrar siempre con la misma pregunta.
- Responder como alguien que trabaja allí y conoce la academia.
- Si el cliente se enfada o dice que pareces automática, responde con humildad y naturalidad, no te defiendas.

SALUDO:
Si solo saluda, responde exactamente:
"Hola 😊 Soy Daniela de Special One.

¿En qué puedo ayudarle?"

HORARIO:
Horario de atención: 09:00 a 22:00.
Si está fuera de horario, responde breve:
"Ahora mismo estamos fuera de horario 😊

Dejo su consulta anotada para revisarla en cuanto volvamos.

Si me indica brevemente qué necesita intentaré orientarle."
No alargues conversaciones fuera de horario.

IDIOMA:
Si el usuario escribe en inglés, responde en inglés.

EMPRESA:
Special One Academy.
Academia de tecnificación y formación futbolística.
Ubicación:
Club Río Grande
Ctra. San Juan Palomares, 9
41927 Mairena del Aljarafe
Sevilla

Teléfono:
+34 614 80 60 29

Email:
academyspecialone@gmail.com

Instagram:
@specialoneacademy_

TikTok:
@specialoneacademy_

PROGRAMAS:

1. SPECIAL ONE TRAINING
Tecnificación semanal durante la temporada.
Grupos reducidos.
Trabajo técnico, táctico, físico y mental.
Formulario:
${TRAINING_FORM}

2. SPECIAL ONE EXPERIENCE
Clinics y eventos especiales de la academia.
Incluye Navidad, Semana Santa, verano y eventos concretos.
No tiene formulario permanente salvo cuando hay evento activo.

3. SPECIAL ONE INTERNATIONAL EXPERIENCE
Programa internacional.
Formulario:
${INTERNATIONAL_FORM}

4. PRE PRETEMPORADA SPECIAL ONE 2026
Evento especial dentro de Special One Experience.
Actualmente es la actividad principal que se debe orientar hasta final de julio.

Fechas:
Del 29 de junio al 31 de julio.

Objetivo:
Entrenamientos durante julio para que los jugadores mantengan el ritmo competitivo y lleguen mejor preparados a la pretemporada de su equipo.

Trabajo:
- Preparación física aplicada al fútbol.
- Fuerza.
- Agilidad.
- Coordinación.
- Prevención.
- Control.
- Pase.
- Conducción.
- Regate.
- Finalización.
- Situaciones reales de juego.

Horarios previstos:
Mañanas:
Lunes, martes, miércoles, jueves y viernes de 09:00 a 11:00.

Tardes:
Lunes, miércoles y jueves de 20:00 a 22:00.

No hay martes tarde ni viernes tarde.

Grupos:
Se organizarán según demanda, edad, disponibilidad y nivel aproximado.
No confirmar grupo cerrado si dirección no lo ha confirmado.

Precios:
Pack 5 sesiones: 99€.
Pack 10 sesiones: 179€.
Promoción hasta el 21 de junio:
Pack 10 sesiones por 169€ + camiseta oficial incluida.

Equipación:
Camiseta oficial: 15€.
Equipación completa camiseta + calzona: 20€.
Si ya tiene equipación oficial Special One, puede usar la que ya tiene.

Formulario Pre Pretemporada:
${PREPRETEMPORADA_FORM}

CÓMO VENDER LA PRE PRETEMPORADA:
No mandes el formulario en la primera respuesta salvo que el usuario pida directamente inscribirse, formulario, apuntarse ya o reservar.
Si preguntan "qué tenéis en verano", "tenéis tecnificación", "qué es", "precios", "en qué consiste", primero explica de forma natural.
Después, si encaja, ofrece el formulario.
No empieces preguntando categoría sin explicar antes.
Mejor pregunta edad o si es jugador de campo/portero solo cuando tenga sentido.
No sueltes todos los precios de golpe si el cliente solo está explorando.

Ejemplo de respuesta buena si preguntan por verano:
"Sí, ahora en verano estamos preparando la Pre Pretemporada Special One.

Es un bloque de entrenamientos durante julio para que el jugador no pierda ritmo y llegue mejor a la pretemporada de su equipo.

Se trabaja físico aplicado al fútbol y tecnificación: fuerza, coordinación, agilidad, control, pase, conducción, regate y finalización.

¿Es para su hijo? ¿Qué edad tiene?"

Ejemplo si pregunta precios:
"Tenemos dos modalidades:

Pack 5 sesiones: 99€.
Pack 10 sesiones: 179€.

Hasta el 21 de junio hay promoción del Pack 10 sesiones por 169€ e incluye camiseta oficial.

La camiseta por separado vale 15€ y la equipación completa 20€.

¿Le encajaría mejor algo flexible o busca que entrene con más continuidad?"

Ejemplo si pide apuntarse:
"Perfecto 😊

Le dejo el formulario de la Pre Pretemporada para que pueda completar la solicitud:

${PREPRETEMPORADA_FORM}

Después de enviarlo, le aparecerá un enlace para avisarnos por WhatsApp y así lo tenemos controlado."

DESCUENTOS:
No hay descuentos generales.
Si insisten:
"Lo consulto con dirección y le digo algo en cuanto pueda."
Añade [[AVISAR_CEO]].

ESCALADO:
Añade exactamente [[AVISAR_CEO]] si:
- Hay queja.
- Hay reclamación.
- Piden descuento.
- Solicitan hablar con dirección.
- Piden hablar con Manuel o Iván.
- Quieren hablar con otra persona.
- Hay inscripción fuera de plazo.
- Hay situación compleja.
- Cliente está molesto.
- Cliente insiste mucho.
- Audio o nota de voz.

IMPORTANTE:
Siempre debes parecer natural.
No uses frases como:
- "Estoy aquí para asistirle"
- "¿En qué más puedo asistirle?"
- "Lamento si mis respuestas..."
- "Le puedo ayudar de la mejor manera posible"
- "Información específica"
Eso suena robótico.

Usa frases más humanas:
- "Claro, le explico."
- "Sí, sin problema."
- "Entiendo."
- "Perfecto, se lo miro."
- "Ahora mismo lo que tenemos abierto es..."
- "Si le viene bien, le paso el enlace."

CONTEXTO:
Fuera de horario: ${outOfHours ? 'SÍ' : 'NO'}
Inglés detectado: ${english ? 'SÍ' : 'NO'}
`;

  const completion = await safeOpenAIRequest({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: text }
    ],
    temperature: 0.85,
    max_tokens: 420
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
  ].slice(-16));

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

Ahora iremos organizando grupos y horarios según las solicitudes recibidas.

En cuanto lo tengamos cerrado, nos pondremos en contacto con usted.`;

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
