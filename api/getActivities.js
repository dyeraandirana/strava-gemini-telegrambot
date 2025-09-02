// api/getActivities.js
import fetch from "node-fetch";
import { getSheetsClient } from "../lib/googleAuth.js";

export default async function handler(req, res) {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).send("❌ Missing userId");
  }

  try {
    const sheets = getSheetsClient();

    // 1. Ambil token dari Google Sheets
    const sheetResp = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "Tokens!A:E",
    });

    const rows = sheetResp.data.values || [];
    const userRow = rows.find((row) => row[0] === userId);

    if (!userRow) {
      return res.status(404).send("❌ User tidak ditemukan di database");
    }

    let [uid, accessToken, refreshToken, expiresAt] = userRow;
    expiresAt = parseInt(expiresAt, 10);

    // 2. Refresh token kalau sudah expired
    if (Date.now() / 1000 >= expiresAt) {
      const refreshResp = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      const refreshData = await refreshResp.json();
      if (!refreshData.access_token) {
        return res.status(400).send("❌ Gagal refresh token");
      }

      accessToken = refreshData.access_token;
      refreshToken = refreshData.refresh_token;
      expiresAt = refreshData.expires_at;

      // Update ke Google Sheets
      const rowIndex = rows.findIndex((r) => r[0] === userId) + 1; // +1 karena header
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SHEET_ID,
        range: `Tokens!A${rowIndex}:E${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[userId, accessToken, refreshToken, expiresAt, userRow[4]]],
        },
      });
    }

    // 3. Ambil 5 aktivitas terakhir
    const actResp = await fetch(
      "https://www.strava.com/api/v3/athlete/activities?per_page=5",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!actResp.ok) {
      throw new Error(`Strava API error: ${actResp.statusText}`);
    }

    const activities = await actResp.json();
    res.json(activities);
  } catch (err) {
    console.error("❌ Gagal mengambil data aktivitas:", err);
    res.status(500).send("Internal Server Error");
  }
}
