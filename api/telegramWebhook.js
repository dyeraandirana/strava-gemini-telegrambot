// api/telegramWebhook.js
import fetch from "node-fetch";
import { getSheetsClient } from "../lib/googleAuth.js";
import { getActivities } from "./getActivities.js"; // langsung import fungsi, bukan fetch ke BASE

function buildStravaAuthUrl(chatId) {
  const redirectUri = process.env.STRAVA_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error("❌ STRAVA_REDIRECT_URI belum diset di env");
  }

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "read,activity:read",
    state: String(chatId),
  });

  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const body = req.body;
  if (!body?.message) return res.send("No message");

  const chatId = body.message.chat.id;
  const text = body.message.text?.trim();

  try {
    if (text === "/start" || text === "/connect") {
      const authUrl = buildStravaAuthUrl(chatId);
      await sendMessage(chatId, `🔗 Klik untuk hubungkan Strava:\n${authUrl}`);
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
      try {
        const activities = await getActivities(chatId, 5);

        if (!activities || activities.length === 0) {
          await sendMessage(chatId, "ℹ️ Tidak ada aktivitas ditemukan.");
        } else {
          const avgDistance =
            activities.reduce((sum, a) => sum + (a.distance || 0), 0) /
            activities.length;

          const summary =
            `📊 Analisis 5 aktivitas terakhir:\n` +
            `• Total: ${activities.length}\n` +
            `• Rata-rata jarak: ${avgDistance.toFixed(2)} m\n\n` +
            `⚡ Gunakan /connect ulang jika token expired.`;

          await sendMessage(chatId, summary);
        }
      } catch (err) {
        console.error("Analisis error:", err);
        await sendMessage(chatId, `⚠️ ${err.message}`);
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
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  );
}
