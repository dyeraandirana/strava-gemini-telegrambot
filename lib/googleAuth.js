// lib/googleAuth.js
import { google } from "googleapis";
import fs from "fs";

function getGoogleAuth() {
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    // ✅ Mode Vercel pakai ENV
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
    return new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      privateKey,
      ["https://www.googleapis.com/auth/spreadsheets"]
    );
  } else if (fs.existsSync("./service-account.json")) {
    // ✅ Mode lokal pakai file
    return new google.auth.GoogleAuth({
      keyFile: "./service-account.json",
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } else {
    throw new Error("❌ No Google credentials found (ENV or file).");
  }
}

export async function getSheetsClient() {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });
  return sheets;
}
