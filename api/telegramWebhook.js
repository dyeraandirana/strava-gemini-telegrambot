// api/telegramWebhook.js
import fetch from "node-fetch";
import { getSheetsClient } from "../lib/googleAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const body = req.body;
  if (!body.message) return res.send("No message");

  const chatId = body.message.chat.id;
  const text = body.message.text?.trim();

  try {
    if (text === "/start" || text === "/connect") {
      const url = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.BASE_URL}/api/stravaCallback&scope=read,activity:read&state=${chatId}`;
      await sendMessage(chatId, `🔗 Klik untuk hubungkan Strava:\n${url}`);
    }

    else if (text === "/status") {
      const sheets = getSheetsClient();
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: "Tokens!A:E",
      });
      const rows = result.data.values || [];
      const userRow = rows.find((r) => r[0] === String(chatId));
      await sendMessage(
        chatId,
        userRow ? "✅ Strava sudah terhubung." : "❌ Belum terhubung."
      );
    }

    else if (text === "/disconnect") {
      const sheets = getSheetsClient();
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: "Tokens!A:E",
      });
      const rows = result.data.values || [];
      const newRows = rows.filter((r) => r[0] !== String(chatId));

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SHEET_ID,
        range: "Tokens!A:E",
        valueInputOption: "RAW",
        requestBody: { values: newRows },
      });

      await sendMessage(chatId, "🔌 Strava berhasil di-disconnect.");
    }

    else if (text === "/analisis") {
      const resp = await fetch(
        `${process.env.BASE_URL}/api/getActivities?userId=${chatId}`
      );
      const activities = await resp.json();

      if (activities.error) {
        await sendMessage(chatId, `⚠️ ${activities.error}`);
      } else {
        // Simpan ke Sheet
        const sheets = getSheetsClient();
        const values = activities.map((a) => [
          a.name,
          a.distance,
          a.moving_time,
          a.type,
          a.start_date,
        ]);
        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.SHEET_ID,
          range: "Activities!A:E",
          valueInputOption: "USER_ENTERED",
          requestBody: { values },
        });

        // Analisis oleh Gemini (pseudo-code, nanti bisa diisi real call Gemini API)
        const summary = `📊 Analisis 5 aktivitas terakhir:\n- Total: ${activities.length}\n- Rata-rata jarak: ${
          (
            activities.reduce((sum, a) => sum + a.distance, 0) / activities.length
          ).toFixed(2)
        } meter`;

        await sendMessage(chatId, summary);
      }
    }

    else {
      await sendMessage(chatId, "🤖 Perintah tidak dikenal.");
    }

    res.send("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Internal Server Error");
  }
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
