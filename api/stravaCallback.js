import fetch from "node-fetch";
import { google } from "googleapis";

export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) return res.send("Missing code");

  // Tukar code ke token Strava
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

  // Simpan ke Google Sheets
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "Tokens!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[athlete.id, access_token, refresh_token, expires_at, ""]]
    }
  });

  res.send("Strava connected! Return to Telegram.");
}
