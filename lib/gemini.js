// lib/gemini.js
import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("❌ GEMINI_API_KEY belum diset di environment variables");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Analisis 5 aktivitas Strava terakhir dengan Gemini
 * @param {Array} activities
 * @param {string} athleteName
 * @returns {Promise<string>}
 */
export async function analyzeActivities(activities, athleteName = "") {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
Aku ${athleteName}, kamu berperan sebagai coach lariku ya!
3 latihan terakhir ku gini nih. 
${JSON.stringify(activities, null, 2)}

analisis hasil latihannya, evaluasi HR, pace dsb. beri saran latihan berikutnya kira-kira seperti apa
jawab ringkas tapi jelas ala anak jaman sekarang.
  `; 
//   Tolong analisis performa user:
// - tren latihan (apakah meningkat/menurun)
// - kekuatan dan kelemahan
// - evaluasi HR, pace, elevasi
// - beri saran latihan berikutnya agar progres lebih optimal

// Jawaban dalam bahasa Indonesia, ringkas tapi jelas ala anak jaman sekarang.
  
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error("❌ Gemini API error:", err);
    return "⚠️ Gagal menjalankan analisis AI.";
  }
}
