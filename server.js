// server.js
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";

const app = express();
app.use(bodyParser.json());
app.use(express.static("public")); // Sert le HTML/CSS dans public

app.post("/pair", async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.json({ error: "Numéro requis" });

    // Utiliser le répertoire temporaire sur Vercel
    const sessionDir = path.join("/tmp", "session", number);
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

    sock.ev.on("creds.update", saveCreds);

    let responded = false;

    const onUpdate = (update) => {
      const { pairingCode, connection } = update;
      if (responded) return;

      if (pairingCode) {
        responded = true;
        res.json({ code: pairingCode });
        sock.ev.off("connection.update", onUpdate);
      } else if (connection === "close") {
        responded = true;
        res.json({ error: "Impossible de générer le code." });
        sock.ev.off("connection.update", onUpdate);
      }
    };

    sock.ev.on("connection.update", onUpdate);

    await sock.requestPairingCode(number);

    setTimeout(() => {
      if (!responded) {
        responded = true;
        res.json({ error: "Délai dépassé. Réessayez." });
        sock.ev.off("connection.update", onUpdate);
      }
    }, 30000);

  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.json({ error: "Erreur serveur : " + err.message });
    }
  }
});

// Port fourni par Vercel
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Serveur en ligne sur http://localhost:${PORT}`);
});
