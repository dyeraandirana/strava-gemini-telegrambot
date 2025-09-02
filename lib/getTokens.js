import fetch from "node-fetch";
import { getSheetsClient } from "./googleAuth.js";

async function readTokensFromSheets(userId) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: "Tokens!A:E",
  });

  const rows = response.data.values || [];
  const row = rows.find(r => r[0] === userId);

  if (!row) return null;

  return {
    access_token: row[1],
    refresh_token: row[2],
    expires_at: parseInt(row[3], 10),
    athlete_id: row[4],
  };
}

async function saveTokensToSheets(userId, tokens) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "Tokens!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        userId,
        tokens.access_token,
        tokens.refresh_token,
        tokens.expires_at,
        tokens.athlete_id
      ]],
    },
  });
}

async function refreshAccessToken(refresh_token) {
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

  if (!data.access_token) {
    throw new Error("❌ Refresh token gagal: " + JSON.stringify(data));
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete_id: data.athlete?.id || null,
  };
}

export async function getValidAccessToken(userId) {
  let tokens = await readTokensFromSheets(userId);

  if (!tokens) {
    throw new Error("❌ Token tidak ditemukan untuk user " + userId);
  }

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at <= now) {
    console.log("🔄 Access token expired, refresh...");
    tokens = await refreshAccessToken(tokens.refresh_token);
    await saveTokensToSheets(userId, tokens);
  }

  return tokens.access_token;
}
