const { Boom } = require('@hapi/boom');
const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/pair', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.json({ error: "Numéro requis" });

  const sessionDir = `./session/${number}`;
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, {}),
    },
    printQRInTerminal: false,
    browser: ['Chrome', 'Desktop', '110.0.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.once('connection.update', (update) => {
    const { connection, lastDisconnect, pairingCode } = update;

    if (pairingCode) {
      console.log("Pairing code généré :", pairingCode);
      res.json({ code: pairingCode });
    } else if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error).output.statusCode;
      res.json({ error: `Déconnexion : ${reason}` });
    }
  });

  await sock.requestPairingCode(number);
});

app.listen(port, () => {
  console.log(`Serveur en ligne sur http://localhost:${port}`);
});
