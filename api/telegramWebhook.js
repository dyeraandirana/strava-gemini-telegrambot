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
        // --- Pastikan user masih connect ---
        const token = await getAccessToken(chatId);
        if (!token) {
          await sendMessage(
            chatId,
            "❌ Kamu belum connect Strava.\n\nGunakan /connect untuk menghubungkan kembali."
          );
          return;
        }

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
        const sheetValues = [];
        for (const [idx, a] of activities.entries()) {
          const avgPaceSec = a.moving_time > 0 ? a.moving_time / (a.distance / 1000) : 0;
          const avgMin = Math.floor(avgPaceSec / 60);
          const avgSec = Math.round(avgPaceSec % 60).toString().padStart(2, "0");
          const avgPaceStr = avgPaceSec ? `${avgMin}:${avgSec}/km` : "-";

          let block = `<blockquote expandable>\n`;
          block += `${idx + 1}. ${a.name}\n`;
          block += `🗓️ ${new Date(a.start_date).toLocaleString("id-ID")}\n`;
          block += `🏃‍♂️ Jarak: ${(a.distance / 1000).toFixed(2)} km\n`;
          block += `⏱️ Durasi: ${(a.moving_time / 60).toFixed(1)} menit\n`;
          block += `⚡ Pace rata²: ${avgPaceStr}\n`;

          if (a.average_heartrate) block += `❤️ HR rata²: ${Math.round(a.average_heartrate)} bpm\n`;
          if (a.max_heartrate) block += `🔺 HR max: ${Math.round(a.max_heartrate)} bpm\n`;
          if (a.total_elevation_gain) block += `⛰️ Elevasi: ${a.total_elevation_gain} m\n`;

          let splitSummary = "No splits";
          if (a.splits && a.splits.length > 0) {
            splitSummary = a.splits
              .map((s, i) => {
                const paceSec = s.moving_time > 0 ? s.moving_time / (s.distance / 1000) : 0;
                const min = Math.floor(paceSec / 60);
                const sec = Math.round(paceSec % 60).toString().padStart(2, "0");
                const paceStr = paceSec ? `${min}:${sec}/km` : "-";
                const hr = s.average_heartrate ? ` (HR ${Math.round(s.average_heartrate)})` : "";
                return `KM ${i + 1}: ${paceStr}${hr}`;
              })
              .join("\n");
            block += `📊 Splits:\n${splitSummary}\n`;
          }

          block += `</blockquote>`;
          await sendMessage(chatId, block);

          // Simpan ke Google Sheets
          sheetValues.push([
            chatId,
            stravaId,
            athleteName,
            a.name,
            a.start_date,
            a.type,
            (a.distance / 1000).toFixed(2),
            (a.moving_time / 60).toFixed(1),
            avgPaceStr,
            a.average_speed ? a.average_speed.toFixed(2) : "",
            a.max_speed ? a.max_speed.toFixed(2) : "",
            a.average_heartrate ? Math.round(a.average_heartrate) : "",
            a.max_heartrate ? Math.round(a.max_heartrate) : "",
            a.total_elevation_gain || "",
            splitSummary.replace(/\n/g, " | "),
          ]);
        }

        // --- 2) Simpan semua ke Google Sheets ---
        try {
          const sheets = getSheetsClient();
          await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.SHEET_ID,
            range: "Activities!A:O",
            valueInputOption: "USER_ENTERED",
            requestBody: { values: sheetValues },
          });
        } catch (err) {
          console.error("❌ Gagal simpan ke Sheets:", err);
        }

        // --- 3) Analisis dengan Gemini ---
        try {
          const { analyzeActivities } = await import("../lib/gemini.js");
          const aiMsg = await analyzeActivities(activities, athleteName);
          await sendMessage(chatId, "🤖 Analisis & Saran:\n\n" + aiMsg);
        } catch (err) {
          console.error("❌ Gemini error:", err);
          await sendMessage(chatId, "⚠️ Analisis AI gagal dijalankan. Coba lagi nanti.");
        }
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
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    }
  );
}
