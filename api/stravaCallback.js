// api/stravaCallback.js
import fetch from "node-fetch";
import { getSheetsClient } from "../lib/googleAuth.js";

export default async function handler(req, res) {
  const code = req.query.code;
  const userId = req.query.state;

  if (!code || !userId || userId === "unknown") {
    return res.status(400).send("Missing code or userId");
  }

  try {
    // 1. Tukar code ke token Strava
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();
    const { access_token, refresh_token, expires_at, athlete } = data;

    if (!access_token) {
      return res.status(400).send("❌ Gagal ambil token dari Strava");
    }

    const sheets = await getSheetsClient();

    // 2. Simpan token ke Google Sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: "Tokens!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[userId, access_token, refresh_token, expires_at, athlete?.id || ""]],
      },
    });

    // 3. Balas ke user Telegram
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: userId,
        text: "✅ Strava berhasil terhubung! Kirim /analisis untuk lihat data.",
      }),
    });

    res.send("Strava connected! Kembali ke Telegram.");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal Server Error");
  }
}
