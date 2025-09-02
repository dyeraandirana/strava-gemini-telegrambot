// api/telegramWebhook.js
import fetch from "node-fetch";
import { getSheetsClient } from "../lib/googleAuth.js";

/**
 * BASE URL project kamu
 * - BASE_URL dari env (https://app.vercel.app)
 * - fallback ke VERCEL_URL (tanpa https://)
 */
const BASE =
  process.env.BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

/** Buat URL login Strava */
function buildStravaAuthUrl(chatId) {
  const redirectUri =
    process.env.STRAVA_REDIRECT_URI ||
    (BASE ? `${BASE}/api/stravaCallback` : null);

  if (!redirectUri) {
    throw new Error("❌ Missing STRAVA_REDIRECT_URI or BASE_URL/VERCEL_URL");
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
      if (!BASE) {
        throw new Error("❌ BASE_URL/VERCEL_URL is not set");
      }

      const resp = await fetch(
        `${BASE}/api/getActivities?userId=${encodeURIComponent(chatId)}`
      );

      let activities;
      try {
        activities = await resp.json();
      } catch {
        const text = await resp.text();
        console.error("Non-JSON response from getActivities:", text);
        return await sendMessage(
          chatId,
          "⚠️ Gagal membaca data aktivitas. Silakan coba lagi."
        );
      }

      if (activities.error) {
        await sendMessage(chatId, `⚠️ ${activities.error}`);
      } else if (!Array.isArray(activities) || activities.length === 0) {
        await sendMessage(chatId, "ℹ️ Tidak ada aktivitas ditemukan.");
      } else {
        // ringkasan sederhana (placeholder Gemini)
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
