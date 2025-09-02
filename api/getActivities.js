import fetch from "node-fetch";
import { getSheetsClient } from "../lib/googleAuth.js";

async function getValidToken(userId) {
  const sheets = getSheetsClient();

  const sheetData = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: "Tokens!A:E",
  });

  const row = sheetData.data.values.find(r => r[0] == userId);
  if (!row) throw new Error("User not found");

  let [id, access_token, refresh_token, expires_at] = row;
  const now = Math.floor(Date.now() / 1000);

  if (now >= Number(expires_at)) {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token,
      }),
    });

    const data = await res.json();
    access_token = data.access_token;
    refresh_token = data.refresh_token;
    expires_at = data.expires_at;

    const rowIndex = sheetData.data.values.findIndex(r => r[0] == userId) + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `Tokens!B${rowIndex}:D${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[access_token, refresh_token, expires_at]] },
    });
  }

  return access_token;
}

export async function getLastActivities(userId) {
  const token = await getValidToken(userId);
  const res = await fetch(
    "https://www.strava.com/api/v3/athlete/activities?per_page=5",
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res.json();
}
