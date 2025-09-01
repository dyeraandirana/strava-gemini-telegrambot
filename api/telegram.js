// /api/telegram.js
export default async function handler(req, res) {
  // Pastikan hanya menerima POST dari Telegram
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const body = req.body;

  // Cek apakah ada pesan teks
  if (body.message?.text) {
    const chatId = body.message.chat.id;
    const text = body.message.text.trim();

    if (text === '/start') {
      // Buat URL OAuth Strava
      const oauthUrl = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.VERCEL_URL}/api/auth/callback&approval_prompt=auto&scope=activity:read_all`;

      // Kirim pesan ke user
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Halo! Silakan login ke Strava lewat link berikut:\n${oauthUrl}`
        })
      });
    } else {
      // Respon default untuk command lain
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Perintah tidak dikenali. Coba ketik /start untuk memulai.`
        })
      });
    }
  }

  res.status(200).end();
}
