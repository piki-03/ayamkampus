/**
 * TORMONITOR AYAM — Vercel Serverless Function
 * Endpoint: POST /api/sensor
 * Terima data dari ESP32, hitung status, simpan ke Supabase
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const CONFIG = {
  suhu:       { min_optimal: 24, max_optimal: 30 },
  kelembapan: { max_ideal: 75 },
  pakan:      { kritis: 20 },
};

/**
 * Konversi jarak ultrasonik (cm) → persentase stok pakan
 * > 5 cm  = 0%
 *   4 cm  = 20%
 *   3 cm  = 60%
 *   2 cm  = 80%
 *   1 cm  = 100%
 */
function konversiJarakKePersen(jarak) {
  if (jarak > 5)    return 0;
  if (jarak >= 4.5) return 20;
  if (jarak >= 3.5) return 60;
  if (jarak >= 2.5) return 80;
  return 100;
}

async function supabaseFetch(path, method, body = null) {
  return fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer":        "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Field tetap stok_pakan — nilai jarak (cm) dikirim ESP32
  const { suhu, kelembapan, stok_pakan } = req.body;

  if (suhu === undefined || kelembapan === undefined || stok_pakan === undefined) {
    return res.status(400).json({
      error: "Field suhu, kelembapan, stok_pakan wajib diisi",
    });
  }

  // ── Konversi jarak → persen ──────────────────────────────────
  const persen_pakan = konversiJarakKePersen(stok_pakan);

  // ── Status suhu ──────────────────────────────────────────────
  let status_suhu;
  if      (suhu < CONFIG.suhu.min_optimal)  status_suhu = "rendah";
  else if (suhu <= CONFIG.suhu.max_optimal) status_suhu = "optimal";
  else                                       status_suhu = "panas";

  // ── Status kelembapan & pakan ────────────────────────────────
  const status_kelembapan = kelembapan <= CONFIG.kelembapan.max_ideal
    ? "ideal" : "lembap";
  const status_pakan = persen_pakan <= CONFIG.pakan.kritis
    ? "kritis" : "tersedia";

  // ── Payload ke Supabase ──────────────────────────────────────
  const payload = {
    suhu:       Math.round(suhu * 100) / 100,
    kelembapan: Math.round(kelembapan * 100) / 100,
    stok_pakan: persen_pakan, // simpan nilai persen ke kolom stok_pakan
  };

  const sbRes = await supabaseFetch("/rest/v1/tormonitor_ayam_logs", "POST", payload);

  if (!sbRes.ok) {
    const err = await sbRes.text();
    return res.status(502).json({ error: "Supabase error", detail: err });
  }

  return res.status(201).json({
    success: true,
    kalkulasi: {
      stok_pakan:        persen_pakan,
      status_suhu,
      status_kelembapan,
      status_pakan,
    },
  });
}
