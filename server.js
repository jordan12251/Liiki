// server.js
import express from "express";
import bodyParser from "body-parser";
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import fs from "fs";

const app = express();
app.use(bodyParser.json());
app.use(express.static("public")); // pour servir ton HTML/CSS

app.post("/pair", async (req, res) => {
  try {
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

    sock.ev.on("creds.update", saveCreds);

    // Écoute de la mise à jour de connexion
    const onUpdate = (update) => {
      const { pairingCode, connection } = update;
      if (pairingCode) {
        res.json({ code: pairingCode });
        sock.ev.off("connection.update", onUpdate);
      } else if (connection === "close") {
        res.json({ error: "Impossible de générer le code." });
        sock.ev.off("connection.update", onUpdate);
      }
    };

    sock.ev.on("connection.update", onUpdate);

    // Demande le code
    await sock.requestPairingCode(number);

  } catch (err) {
    console.error(err);
    res.json({ error: "Erreur serveur : " + err.message });
  }
});

// Render utilise une variable d’environnement pour le port
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Serveur en ligne sur http://localhost:${PORT}`);
});
