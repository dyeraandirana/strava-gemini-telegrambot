import fetch from "node-fetch";
import { google } from "googleapis";

function formatPrivateKey(key) {
  // ✅ Diperbaiki: regex valid
  return key.replace(/\
/g, "
");
}

export default async function handler(req, res) {
  console.log("Callback query:", req.query);
  const code = req.query.code;
  const userId = req.query.state;
  if (!code || !userId) return res.status(400).send("Missing code or userId");

  try {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code"
      })
    });
    const data = await response.json();
    console.log("Strava token response:", data);
    const { access_token, refresh_token, expires_at, athlete } = data;

    if (!access_token) {
      console.error("Strava token response:", data);
      return res.status(400).send("Gagal ambil token dari Strava");
    }

    const auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY),
      ["https://www.googleapis.com/auth/spreadsheets"]
    );
    const sheets = google.sheets({ version: "v4", auth });

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SHEET_ID,
        range: "Tokens!A:E",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[userId, access_token, refresh_token, expires_at, athlete.id]]
        }
      });
    } catch (err) {
      console.error("Sheets error:", err);
      return res.status(500).send("Gagal simpan token ke sheet");
    }

    try {
      const telegramRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: userId,
          text: "✅ Strava berhasil terhubung! Kamu bisa kirim /analisis sekarang."
        })
      });
      const telegramData = await telegramRes.json();
      console.log("Telegram response:", telegramData);
    } catch (err) {
      console.error("Telegram sendMessage error:", err);
    }

    res.send("Strava connected! Return to Telegram.");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal Server Error");
  }
}
