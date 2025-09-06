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
    if (!data.access_token) {
      console.error("❌ Gagal refresh token:", data);
      return null;
    }

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

/**
 * Ambil aktivitas terakhir lengkap dengan splits pace
 */
export async function getActivitiesWithSplits(userId, perPage = 3) {
  const token = await getAccessToken(userId);
  if (!token) throw new Error("❌ Token tidak ditemukan atau refresh gagal");

  // 1) Ambil daftar aktivitas
  const resp = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const activities = await resp.json();
  if (!resp.ok) {
    console.error("Strava API error:", activities);
    throw new Error(activities.message || "Gagal ambil aktivitas Strava");
  }

  // 2) Ambil splits pace tiap aktivitas
  const withSplits = [];
  for (const act of activities) {
    try {
      const splitResp = await fetch(
        `https://www.strava.com/api/v3/activities/${act.id}/splits/metric`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const splits = await splitResp.json();

      withSplits.push({
        ...act,
        splits: Array.isArray(splits) ? splits : [],
      });
    } catch (err) {
      console.error(`❌ Gagal ambil splits untuk aktivitas ${act.id}`, err);
      withSplits.push({ ...act, splits: [] });
    }
  }

  return withSplits;
}

// API handler untuk Vercel (opsional, buat debug)
export default async function handler(req, res) {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const activities = await getActivitiesWithSplits(userId, 3);
    return res.status(200).json(activities);
  } catch (err) {
    console.error("GetActivities error:", err);
    return res.status(500).json({ error: err.message });
  }
}
