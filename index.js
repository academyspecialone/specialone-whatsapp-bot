const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

let qrImage = '';

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'specialone'
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', async (qr) => {
  console.log('Nuevo QR generado');

  qrImage = await qrcode.toDataURL(qr);

  console.log('QR listo en /qr');
});

client.on('ready', () => {
  console.log('✅ BOT SPECIAL ONE ONLINE');
});

client.on('message', async (message) => {
  const text = message.body.toLowerCase();

  if (text.includes('hola') || text.includes('info')) {
    await message.reply(
      '👋 Hola, soy el asistente de Special One Academy. ¿Quieres información sobre programas, ubicación o inscripción?'
    );
  } else {
    await message.reply(
      'Gracias por escribir a Special One Academy. Te responderemos lo antes posible.'
    );
  }
});

app.get('/', (req, res) => {
  res.send('Bot Special One funcionando 🚀');
});

app.get('/qr', (req, res) => {
  if (!qrImage) {
    return res.send('QR aún no generado. Espera unos segundos.');
  }

  res.send(`
    <html>
      <body style="font-family:Arial;text-align:center;padding:40px;">
        <h1>QR WhatsApp Special One</h1>
        <img src="${qrImage}" width="350"/>
        <p>Escanéalo con WhatsApp → Dispositivos vinculados</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log('Servidor web activo en puerto', PORT);
});

client.initialize();
