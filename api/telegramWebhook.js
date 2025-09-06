// api/telegramWebhook.js
import fetch from "node-fetch";
import { getSheetsClient } from "../lib/googleAuth.js";
import { getAccessToken, getActivitiesWithSplits } from "./getActivities.js";

function buildStravaAuthUrl(chatId) {
  const redirectUri = process.env.STRAVA_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error("❌ STRAVA_REDIRECT_URI belum diset di env");
  }

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "read,activity:read",
    state: String(chatId),
  });

  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const body = req.body;
  if (!body?.message) return res.send("No message");

  const chatId = body.message.chat.id;
  const text = body.message.text?.trim();

  try {
    if (text === "/start" || text === "/connect") {
      const authUrl = buildStravaAuthUrl(chatId);
      await sendMessage(chatId, `🔗 Klik untuk hubungkan Strava:\n${authUrl}`);
    }

    else if (text === "/status") {
      const sheets = getSheetsClient();
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: "Tokens!A:E",
      });
      const rows = result.data.values || [];
      const userRow = rows.find((r) => r[0] === String(chatId));
      await sendMessage(
        chatId,
        userRow ? "✅ Strava sudah terhubung." : "❌ Belum terhubung."
      );
    }

    else if (text === "/disconnect") {
      const sheets = getSheetsClient();
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: "Tokens!A:E",
      });
      const rows = result.data.values || [];
      const newRows = rows.filter((r) => r[0] !== String(chatId));

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SHEET_ID,
        range: "Tokens!A:E",
        valueInputOption: "RAW",
        requestBody: { values: newRows },
      });

      await sendMessage(chatId, "🔌 Strava berhasil di-disconnect.");
    }

    else if (text === "/analisis") {
      try {
        // --- Ambil 3 aktivitas terakhir + splits ---
        const activities = await getActivitiesWithSplits(chatId, 3);
        if (!activities || activities.length === 0) {
          await sendMessage(chatId, "ℹ️ Tidak ada aktivitas ditemukan.");
          return;
        }

        // --- Ambil nama akun Strava ---
        let athleteName = "";
        let stravaId = "";
        try {
          const token = await getAccessToken(chatId);
          const resp = await fetch("https://www.strava.com/api/v3/athlete", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const profile = await resp.json();
          athleteName = `${profile.firstname || ""} ${profile.lastname || ""}`.trim();
          stravaId = profile.id || "";
        } catch (err) {
          console.error("❌ Gagal ambil profil Strava:", err);
        }

        // --- 1) Rincian aktivitas ---
        let detailMsg = "📋 3 Aktivitas Terakhir:\n";
        const sheetValues = [];

        activities.forEach((a, idx) => {
          const pace =
            a.moving_time > 0
              ? (a.distance / a.moving_time).toFixed(2) + " m/s"
              : "-";

          detailMsg += `\n${idx + 1}. ${a.name}\n`;
          detailMsg += `   🗓️ ${new Date(a.start_date).toLocaleString("id-ID")}\n`;
          detailMsg += `   🏃‍♂️ Jarak: ${(a.distance / 1000).toFixed(2)} km\n`;
          detailMsg += `   ⏱️ Durasi: ${(a.moving_time / 60).toFixed(1)} menit\n`;
          detailMsg += `   ⚡ Pace: ${pace}\n`;

          if (a.average_heartrate) detailMsg += `   ❤️ HR rata²: ${a.average_heartrate} bpm\n`;
          if (a.max_heartrate) detailMsg += `   🔺 HR max: ${a.max_heartrate} bpm\n`;
          if (a.total_elevation_gain) detailMsg += `   ⛰️ Elevasi: ${a.total_elevation_gain} m\n`;

          // --- Ringkas splits pace ---
          let splitSummary = "No splits";
          if (a.splits && a.splits.length > 0) {
            splitSummary = a.splits
              .map((s, i) => {
                const pace = s.moving_time > 0
                  ? (s.distance / s.moving_time).toFixed(2)
                  : "-";
                return `${i + 1}:${pace} m/s`;
              })
              .join(", ");
            detailMsg += `   📊 Splits: ${splitSummary}\n`;
          }

          // Data untuk Google Sheets
          sheetValues.push([
            chatId,                          // Telegram User ID
            stravaId,                        // Strava User ID
            athleteName,                     // Nama akun Strava
            a.name,                          // Nama Aktivitas
            a.start_date,
            a.type,
            (a.distance / 1000).toFixed(2),
            (a.moving_time / 60).toFixed(1),
            pace,
            a.average_speed,
            a.max_speed,
            a.average_heartrate || "",
            a.max_heartrate || "",
            a.total_elevation_gain || "",
            splitSummary
          ]);
        });

        // --- 2) Simpan ke Google Sheet ---
        try {
          const sheets = getSheetsClient();
          await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.SHEET_ID,
            range: "Activities!A:O", // 15 kolom
            valueInputOption: "USER_ENTERED",
            requestBody: { values: sheetValues },
          });
        } catch (err) {
          console.error("❌ Gagal simpan ke Sheets:", err);
        }

        // --- 3) Analisis dengan Gemini ---
        let aiMsg;
        try {
          const { analyzeActivities } = await import("../lib/gemini.js");
          aiMsg = await analyzeActivities(activities, athleteName);

          // Simpan hasil analisis juga
          try {
            const sheets = getSheetsClient();
            await sheets.spreadsheets.values.append({
              spreadsheetId: process.env.SHEET_ID,
              range: "Analysis!A:D",
              valueInputOption: "USER_ENTERED",
              requestBody: {
                values: [[chatId, stravaId, athleteName, aiMsg]],
              },
            });
          } catch (err) {
            console.error("❌ Gagal simpan analisis ke Sheets:", err);
          }
        } catch (err) {
          console.error("❌ Gemini error:", err);
          aiMsg = "⚠️ Analisis AI gagal dijalankan. Coba lagi nanti.";
        }

        // --- 4) Kirim pesan ke Telegram ---
        await sendMessage(chatId, detailMsg);
        await sendMessage(chatId, "🤖 Analisis & Saran:\n\n" + aiMsg);
      } catch (err) {
        console.error("Analisis error:", err);
        await sendMessage(chatId, `⚠️ ${err.message}`);
      }
    }
  } catch (err) {
    console.error("Webhook error:", err);
    await sendMessage(chatId, "⚠️ Terjadi error di server.");
  }

  res.send("OK");
}

async function sendMessage(chatId, text) {
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  );
}
