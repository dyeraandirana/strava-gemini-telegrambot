// lib/googleAuth.js
import { google } from "googleapis";

export async function getSheetsClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("❌ GOOGLE_CLIENT_EMAIL atau GOOGLE_PRIVATE_KEY belum di-set");
  }

  // Fix newline kalau disimpan sebagai \n di Vercel
  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  const auth = new google.auth.JWT(
    clientEmail,
    null,
    privateKey,
    ["https://www.googleapis.com/auth/spreadsheets"]
  );

  return google.sheets({ version: "v4", auth });
}
