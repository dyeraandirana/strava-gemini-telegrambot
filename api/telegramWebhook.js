// api/telegramWebhook.js
import fetch from "node-fetch";
import { getSheetsClient } from "../lib/googleAuth.js";

export default async function handler(req, res) {
  try {
    const body = req.body;

    if (!body.message) {
      return res.status(200).send("No message");
    }

    const chatId = body.message.chat.id;
    const text = (body.message.text || "").trim();

    if (text === "/start") {
      await sendMessage(chatId, "👋 Halo! Gunakan /connect untuk hubungkan akun Strava.");
    }

    // === CONNECT ===
    else if (text === "/connect") {
      const authUrl = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.BASE_URL}/api/stravaCallback&approval_prompt=force&scope=read,activity:read&state=${chatId}`;
      await sendMessage(chatId, `🔗 Klik untuk hubungkan Strava:\n${authUrl}`);
    }

    // === STATUS ===
    else if (text === "/status") {
      const sheets = getSheetsClient();
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: "Tokens!A:E",
      });

      const rows = result.data.values || [];
      const found = rows.find((r) => r[0] === String(chatId));

      if (found) {
        await sendMessage(chatId, `✅ Terhubung dengan Strava (Athlete ID: ${found[4]})`);
      } else {
        await sendMessage(chatId, "❌ Belum terhubung. Gunakan /connect untuk login.");
      }
    }

    // === DISCONNECT ===
    else if (text === "/disconnect") {
      const sheets = getSheetsClient();
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: "Tokens!A:E",
      });

      const rows = result.data.values || [];
      const idx = rows.findIndex((r) => r[0] === String(chatId));

      if (idx >= 0) {
        rows.splice(idx, 1);
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SHEET_ID,
          range: "Tokens!A:E",
          valueInputOption: "RAW",
          requestBody: { values: rows },
        });
        await sendMessage(chatId, "🗑 Berhasil disconnect dari Strava.");
      } else {
        await sendMessage(chatId, "⚠️ Tidak ada akun Strava yang terhubung.");
      }
    }

    // === ANALISIS ===
    else if (text === "/analisis") {
      try {
        // 1. Ambil aktivitas user dari API getActivities
        const resp = await fetch(
          `${process.env.BASE_URL}/api/getActivities?userId=${chatId}`
        );
        if (!resp.ok) throw new Error("Gagal ambil aktivitas Strava");
        const activities = await resp.json();

        if (!Array.isArray(activities) || activities.length === 0) {
          await sendMessage(chatId, "❌ Tidak ada aktivitas ditemukan.");
        } else {
          // 2. Simpan ke Google Sheets
          const sheets = getSheetsClient();
          const values = activities.map((a) => [
            chatId,
            a.name,
            (a.distance / 1000).toFixed(2), // km
            (a.moving_time / 60).toFixed(1), // menit
            new Date(a.start_date).toLocaleString("id-ID"),
          ]);

          await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.SHEET_ID,
            range: "Activities!A:E",
            valueInputOption: "USER_ENTERED",
            requestBody: { values },
          });

          // 3. Analisis dengan Gemini
          const aiResponse = await analyzeWithGemini(activities);

          // 4. Kirim ke Telegram
          await sendMessage(chatId, `📊 Analisis Strava:\n\n${aiResponse}`);
        }
      } catch (err) {
        console.error("Analisis error:", err);
        await sendMessage(chatId, "❌ Gagal menganalisis data Strava.");
      }
    }

    else {
      await sendMessage(chatId, "❓ Perintah tidak dikenali. Coba /connect, /status, /disconnect, atau /analisis.");
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Internal Server Error");
  }
}

// Helper kirim pesan ke Telegram
async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// Analisis dengan Gemini
async function analyzeWithGemini(activities) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  const textInput = `Analisis 5 aktivitas terakhir Strava berikut. 
  Data: ${JSON.stringify(activities, null, 2)}.
  Buat ringkasan jarak, waktu, pace/kecepatan, dan berikan saran perbaikan latihan.`;

  const result = await model.generateContent(textInput);
  return result.response.text();
}
