// api/getActivities.js
import fetch from "node-fetch";
import { getSheetsClient } from "../lib/googleAuth.js";

export default async function handler(req, res) {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const sheets = getSheetsClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "Tokens!A:E",
    });

    const rows = result.data.values || [];
    const userRow = rows.find((r) => r[0] === String(userId));

    if (!userRow) {
      return res.status(404).json({ error: "User not connected" });
    }

    let [id, accessToken, refreshToken, expiresAt, athleteId] = userRow;
    const now = Math.floor(Date.now() / 1000);

    // Refresh token jika expired
    if (Number(expiresAt) < now) {
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
      if (refreshData.access_token) {
        accessToken = refreshData.access_token;
        refreshToken = refreshData.refresh_token;
        expiresAt = refreshData.expires_at;

        const idx = rows.findIndex((r) => r[0] === String(userId));
        rows[idx] = [userId, accessToken, refreshToken, expiresAt, athleteId];

        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SHEET_ID,
          range: "Tokens!A:E",
          valueInputOption: "RAW",
          requestBody: { values: rows },
        });
      } else {
        return res.status(400).json({ error: "Failed to refresh token" });
      }
    }

    // Ambil aktivitas terakhir
    const activitiesResp = await fetch(
      "https://www.strava.com/api/v3/athlete/activities?per_page=5",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!activitiesResp.ok) {
      throw new Error("Failed to fetch activities from Strava");
    }

    const activities = await activitiesResp.json();
    return res.status(200).json(activities);
  } catch (err) {
    console.error("Get activities error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
