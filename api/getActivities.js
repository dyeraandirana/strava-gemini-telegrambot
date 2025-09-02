// api/getActivities.js
import fetch from "node-fetch";
import { getSheetsClient } from "../lib/googleAuth.js";

export async function getAccessToken(userId) {
  const sheets = await getSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: "Tokens!A:E",
  });

  const rows = result.data.values || [];
  if (rows.length === 0) return null;

  const rowIndex = rows.findIndex((r) => r[0] === String(userId));
  if (rowIndex === -1) return null;

  let [_, accessToken, refreshToken, expiresAt] = rows[rowIndex];
  expiresAt = parseInt(expiresAt, 10);

  if (Date.now() / 1000 >= expiresAt) {
    // Refresh token
    const resp = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const data = await resp.json();

    if (!data.access_token) return null;

    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    expiresAt = data.expires_at;

    // Update row milik user
    const range = `Tokens!A${rowIndex + 1}:E${rowIndex + 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[userId, accessToken, refreshToken, expiresAt, rows[rowIndex][4]]],
      },
    });
  }

  return accessToken;
}

export async function getActivities(userId, perPage = 5) {
  const token = await getAccessToken(userId);
  if (!token) throw new Error("Token tidak ditemukan");

  const resp = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!resp.ok) throw new Error("Gagal ambil aktivitas Strava");
  return await resp.json();
}
