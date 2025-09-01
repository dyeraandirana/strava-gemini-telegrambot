import { Telegraf } from "telegraf";
import fetch from "node-fetch";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start((ctx) => {
  ctx.reply("Selamat datang! Klik tombol login Strava.", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Login Strava", url: `${process.env.STRAVA_REDIRECT_URI}?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&scope=activity:read` }]
      ]
    }
  });
});

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

export default async function handler(req, res) {
  console.log("Incoming update:", req.body);
  if (req.method !== "POST") return res.status(200).send("Use POST");

  try {
    await bot.handleUpdate(req.body);
    res.status(200).send("ok");
  } catch (err) {
    console.error("Telegram bot error:", err);
    res.status(500).send(err.message);
  }
}
