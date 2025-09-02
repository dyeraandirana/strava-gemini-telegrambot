import { google } from "googleapis";

function normalizePrivateKey(key) {
  if (!key) return key;

  // Kalau ada "\n" (escaped) tapi bukan newline asli → replace
  if (key.includes("\\n")) {
    return key.replace(/\\n/g, "\n");
  }

  // Kalau sudah multiline → pakai apa adanya
  return key;
}

export function getSheetsClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    ["https://www.googleapis.com/auth/spreadsheets"]
  );

  return google.sheets({ version: "v4", auth });
}
