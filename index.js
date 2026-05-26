const { create } = require('@open-wa/wa-automate');

create({
  sessionId: 'specialone',
  multiDevice: true,
  headless: 'new',
  useChrome: false,
  qrTimeout: 0,
  authTimeout: 0,
  waitForRipeSession: false,
  qrLogSkip: false,
  cacheEnabled: false
}).then(client => start(client));

function start(client) {

  console.log('BOT SPECIAL ONE ONLINE');

  client.onMessage(async message => {

    const text = message.body.toLowerCase();

    if(text.includes('hola') || text.includes('info')){
      return client.sendText(
        message.from,
        `👋 Hola, soy el asistente de Special One Academy.

¿Sobre qué necesitas información?

1️⃣ Special One Training
2️⃣ Special One Experience
3️⃣ International Experience
4️⃣ Inscripciones
5️⃣ Hablar con la academia`
      );
    }

    if(text === '1'){
      return client.sendText(
        message.from,
        `⚽ Special One Training

Entrenamientos específicos en grupos reducidos durante la temporada.

Desde prebenjamín hasta juvenil.

Si quieres información de inscripción escribe INSCRIPCIÓN`
      );
    }

    if(text === '2'){
      return client.sendText(
        message.from,
        `🔥 Special One Experience

Clínics y experiencias formativas en Navidad, Semana Santa, verano y eventos especiales.`
      );
    }

    if(text === '3'){
      return client.sendText(
        message.from,
        `🌍 Special One International Experience

Experiencia futbolística y formativa para jugadores internacionales dentro del fútbol español.`
      );
    }

    if(text === '5'){
      return client.sendText(
        message.from,
        `📲 Un responsable de Special One Academy continuará contigo lo antes posible.`
      );
    }

  });

}
