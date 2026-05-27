const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const P = require('pino');
const qrcode = require('qrcode-terminal');

async function startBot() {

  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log('===== QR WHATSAPP =====');
      qrcode.generate(qr, { small: true });
      console.log('===== ESCANEA EL QR =====');
    }

    if (connection === 'open') {
      console.log('✅ BOT SPECIAL ONE ONLINE');
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log('❌ Conexión cerrada');

      if (shouldReconnect) {
        startBot();
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {

    const msg = messages[0];
    if (!msg.message) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      '';

    const sender = msg.key.remoteJid;

    console.log('Mensaje:', text);

    await sock.sendMessage(sender, {
      text: '👋 Hola, soy el asistente de Special One Academy. Hemos recibido tu mensaje.'
    });
  });
}

startBot();
