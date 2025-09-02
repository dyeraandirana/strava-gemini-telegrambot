// lib/gemini.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function analyzeActivities(activities) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  const textData = activities
    .map(
      (a, i) => `
Aktivitas ${i + 1}:
- Nama: ${a.name}
- Tanggal: ${a.start_date}
- Tipe: ${a.type}
- Jarak: ${(a.distance / 1000).toFixed(2)} km
- Durasi: ${(a.moving_time / 60).toFixed(1)} menit
- Pace: ${
        a.moving_time > 0
          ? (a.distance / a.moving_time).toFixed(2) + " m/s"
          : "-"
      }
- HR Rata²: ${a.average_heartrate || "-"}
- HR Max: ${a.max_heartrate || "-"}
- Elevasi: ${a.total_elevation_gain || "-"} m
`
    )
    .join("\n");

  const prompt = `
Saya punya data 5 aktivitas olahraga terakhir:

${textData}

Tolong berikan:
1. Ringkasan performa & tren latihan.
2. Analisis kekuatan & kelemahan.
3. Rekomendasi latihan selanjutnya.

Jawab singkat, jelas, dalam bahasa Indonesia.
`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
