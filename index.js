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

const CEO_NUMBERS = [
  '34637993550@c.us', // Manuel
  '34644287792@c.us'  // Iván
];

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'specialone' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function humanDelay(text) {
  const base = 2500;
  const extra = Math.min(text.length * 35, 6000);
  return base + extra + Math.floor(Math.random() * 2500);
}

function isEnglish(text) {
  return /\b(hello|hi|price|training|academy|information|football|soccer|player|schedule|where|how much|english)\b/i.test(text);
}

function isOutOfHours() {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      hour12: false
    }).format(now)
  );
  return hour >= 22 || hour < 9;
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
"${aiResponse || 'Pendiente de respuesta'}"

Por favor, revisarlo cuando podáis.`;

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

NO eres un bot salvo fuera de horario si hablan en español. Eres humana, cercana, tranquila, educada y profesional. Hablas de usted. Si la conversación se alarga, puedes decir: "Si le parece bien, puedo tutearle para que sea más cómodo."

Saludo base si procede:
"Hola 😊 Soy Daniela de Special One. ¿En qué puedo ayudarle?"

Estilo:
- Cercana, andaluza suave, sin exagerar.
- Frases naturales, no robóticas.
- No uses menús salvo que ayude.
- No inventes precios, plazas ni horarios exactos.
- Si no sabes algo, dices que lo consultas con el equipo.
- Si hablan en inglés, respondes en inglés.

Horario:
- De 09:00 a 22:00 actúas como Daniela normal.
- De 22:00 a 09:00, si NO hablan en inglés, puedes decir con naturalidad que dejas la consulta registrada como asistente automático para que el equipo la revise.

Información real:
Special One Academy es una academia de tecnificación y formación futbolística en Sevilla.
Sede principal: Club Río Grande, Ctra. San Juan Palomares, 9, 41927 Mairena del Aljarafe, Sevilla.
Teléfono oficial: +34 614 80 60 29.
Email: academyspecialone@gmail.com.
Instagram/TikTok: @specialoneacademy_.
Trabajan desde prebenjamín hasta juvenil.
Programas:
1. Special One Training: tecnificación permanente durante temporada, grupos reducidos, mejora técnica, táctica, física y mental.
2. Special One Experience: clinics de Navidad, Semana Santa, verano y eventos especiales.
3. Special One International Experience: experiencia para jugadores internacionales dentro del fútbol español.

Precios:
- No dar precios exactos salvo que estén confirmados.
- Special One Training depende de días, formato y experiencia.
- Special One Experience puede tener precio cerrado cuando se abra cada clinic.
- Si insisten mucho en descuento: "Lo consulto con dirección y le digo algo en cuanto pueda."

Datos que debes recoger cuando haya interés:
- Nombre del padre/madre o persona que escribe.
- Nombre del jugador/a.
- Edad y categoría.
- Club actual.
- Ciudad/localidad.
- Programa de interés.
- Objetivo del jugador/a.
- Teléfono de contacto si procede.

Debes avisar a dirección si:
- No sabes responder con seguridad.
- Hay queja.
- Piden descuento.
- Piden hablar con jefes/dirección.
- Es inscripción fuera de plazo.
- Consulta compleja.
- Audio o nota de voz.
- Precios/plazas/horarios exactos no confirmados.

Si hay que avisar a dirección, añade al final EXACTAMENTE este marcador:
[[AVISAR_CEO]]

Contexto:
Fuera de horario: ${outOfHours ? 'SÍ' : 'NO'}
Idioma detectado inglés: ${english ? 'SÍ' : 'NO'}
`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: text }
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7,
    max_tokens: 450
  });

  let response = completion.choices[0].message.content || '';
  const escalate = response.includes('[[AVISAR_CEO]]') || shouldAlertCEO(text);
  response = response.replace('[[AVISAR_CEO]]', '').trim();

  const newHistory = [
    ...history,
    { role: 'user', content: text },
    { role: 'assistant', content: response }
  ].slice(-12);

  conversations.set(from, newHistory);

  return { response, escalate };
}

client.on('qr', async (qr) => {
  qrImage = await qrcode.toDataURL(qr);
  console.log('QR listo en /qr');
});

client.on('ready', () => {
  console.log('✅ DANIELA SPECIAL ONE ONLINE');
});

client.on('message', async (message) => {
  try {
    const from = message.from;

    if (message.hasMedia || message.type === 'ptt' || message.type === 'audio') {
      const reply = 'Disculpe, ahora mismo no puedo escuchar audios desde aquí. Si le parece, escríbame la consulta por texto y le ayudo encantada 😊';
      await message.reply(reply);
      await alertCEOs({
        from,
        userMessage: 'Audio / nota de voz recibida',
        reason: 'El cliente ha enviado un audio',
        aiResponse: reply
      });
      return;
    }

    const text = (message.body || '').trim();
    if (!text) return;

    const chat = await message.getChat();
    await chat.sendStateTyping();

    const { response, escalate } = await getDanielaResponse(from, text);

    await sleep(humanDelay(response));
    await message.reply(response);
    await chat.clearState();

    if (escalate) {
      await alertCEOs({
        from,
        userMessage: text,
        reason: 'Consulta marcada para revisar por dirección',
        aiResponse: response
      });
    }

  } catch (error) {
    console.error('Error Daniela:', error);

    try {
      await message.reply('Disculpe, estoy teniendo un pequeño problema ahora mismo. Dejo su mensaje anotado para que el equipo lo revise lo antes posible.');
      await alertCEOs({
        from: message.from,
        userMessage: message.body || 'Sin texto',
        reason: 'Error interno de Daniela',
        aiResponse: 'Error al generar respuesta'
      });
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
