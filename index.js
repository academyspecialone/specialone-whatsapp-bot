const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'specialone'
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  console.log('===== QR WHATSAPP =====');
  qrcode.generate(qr, { small: true });
  console.log('===== ESCANEA EL QR =====');
});

client.on('ready', () => {
  console.log('✅ BOT SPECIAL ONE ONLINE');
});

client.on('message', async (message) => {
  const text = message.body.toLowerCase();

  if (text.includes('hola') || text.includes('info')) {
    await message.reply('👋 Hola, soy el asistente de Special One Academy. ¿Quieres información sobre programas, ubicación o inscripción?');
  } else {
    await message.reply('Gracias por escribir a Special One Academy. Te responderemos lo antes posible.');
  }
});

client.initialize();
