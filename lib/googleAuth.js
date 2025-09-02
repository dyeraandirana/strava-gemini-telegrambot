import { google } from "googleapis";

function formatPrivateKey(key) {
  // ubah semua "\n" (literal backslash + n) jadi newline asli
  return key.replace(/\\n/g, "\n");
}

export function getSheetsClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,      // dari JSON: client_email
    null,
    formatPrivateKey(process.env.GOOGLE_PRIVATE_KEY), // dari JSON: private_key
    ["https://www.googleapis.com/auth/spreadsheets"]
  );
  return google.sheets({ version: "v4", auth });
}
