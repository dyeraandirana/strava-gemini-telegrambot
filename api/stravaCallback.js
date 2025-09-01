import fetch from "node-fetch";
import { google } from "googleapis";

export default async function handler(req, res) {
  const code = req.query.code;
  const userId = req.query.state;
  if (!code || !userId) return res.send("Missing code or userId");

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
  const { access_token, refresh_token, expires_at, athlete } = data;

  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/
/g, "
"),
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "Tokens!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[userId, access_token, refresh_token, expires_at, athlete.id]]
    }
  });

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: userId,
      text: "✅ Strava berhasil terhubung! Kamu bisa kirim /analisis sekarang."
    })
  });

  res.send("Strava connected! Return to Telegram.");
}
