// api/telegramWebhook.js
import fetch from "node-fetch";
import { getSheetsClient } from "../lib/googleAuth.js";
import { getActivities } from "./getActivities.js";

export default async function handler(req, res) {
  try {
    const body = req.body;
    const message = body.message;
    if (!message) return res.send("ok");

    const chatId = message.chat.id;
    const text = message.text || "";

    const sheets = await getSheetsClient();

    async function sendMessage(text) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    }

    if (text === "/connect") {
      const url = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.STRAVA_REDIRECT_URI}/api/stravaCallback&scope=read,activity:read&state=${chatId}`;
      await sendMessage(`🔗 Klik untuk hubungkan Strava:\n${authUrl}`);

    } else if (text === "/status") {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: "Tokens!A:E",
      });
      const rows = result.data.values || [];
      const found = rows.find((r) => r[0] === String(chatId));

      if (found) {
        await sendMessage("✅ Strava sudah terhubung.");
      } else {
        await sendMessage("❌ Belum ada koneksi Strava. Gunakan /connect");
      }

    } else if (text === "/disconnect") {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: "Tokens!A:E",
      });
      const rows = result.data.values || [];
      const rowIndex = rows.findIndex((r) => r[0] === String(chatId));

      if (rowIndex !== -1) {
        await sheets.spreadsheets.values.clear({
          spreadsheetId: process.env.SHEET_ID,
          range: `Tokens!A${rowIndex + 1}:E${rowIndex + 1}`,
        });
        await sendMessage("🗑️ Strava berhasil diputuskan.");
      } else {
        await sendMessage("❌ Tidak ada koneksi Strava untuk dihapus.");
      }

    } else if (text === "/analisis") {
      try {
        const activities = await getActivities(chatId, 5);

        if (!activities.length) {
          await sendMessage("❌ Tidak ada aktivitas ditemukan.");
        } else {
          // Simpan ke Sheet
          const rows = activities.map((a) => [
            new Date(a.start_date).toLocaleString("id-ID"),
            a.name,
            a.type,
            a.distance,
            a.moving_time,
            a.average_speed,
          ]);

          await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.SHEET_ID,
            range: "Activities!A:F",
            valueInputOption: "USER_ENTERED",
            requestBody: { values: rows },
          });

          // Analisis sederhana (bisa diganti AI Gemini)
          const summary = activities
            .map((a, i) => `${i + 1}. ${a.name} - ${(a.distance / 1000).toFixed(2)} km`)
            .join("\n");

          await sendMessage("📊 5 Aktivitas Terakhir:\n" + summary);
        }
      } catch (err) {
        console.error("Analisis error:", err);
        await sendMessage("❌ Gagal mengambil data aktivitas.");
      }

    } else {
      await sendMessage("🤖 Perintah tersedia: /connect, /status, /disconnect, /analisis");
    }

    res.send("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Internal Server Error");
  }
}
