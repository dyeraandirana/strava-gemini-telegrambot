import { Telegraf } from "telegraf";
import fetch from "node-fetch";

// Buat instance bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Command /start → kirim tombol login Strava
bot.start((ctx) => {
  ctx.reply(
    "Selamat datang! Klik tombol untuk login Strava.",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Login Strava",
              url: `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.STRAVA_REDIRECT_URI}&scope=activity:read`
            }
          ]
        ]
      }
    }
  );
});

// Command /analisis → panggil API getActivities
bot.command("analisis", async (ctx) => {
  const userId = ctx.from.id;
  try {
    const res = await fetch(`${process.env.VERCEL_URL}/api/getActivities?userId=${userId}`);
    const data = await res.json();
    ctx.reply(`Rekomendasi latihan:\n${data.analysis}`);
  } catch (err) {
    ctx.reply("Gagal mengambil data aktivitas: " + err.message);
  }
});

// Export handler Vercel
export default async function handler(req, res) {
  // Debug log supaya kita tahu request masuk
  console.log("Incoming update from Telegram:", req.body);

  try {
    // Hanya handle POST
    if (req.method === "POST") {
      await bot.handleUpdate(req.body);
      return res.status(200).send("ok");
    } else {
      return res.status(200).send("Telegram webhook expects POST");
    }
  } catch (err) {
    console.error("Telegram bot error:", err);
    return res.status(500).send(err.message);
  }
}
