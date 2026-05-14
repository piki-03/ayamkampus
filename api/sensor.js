/**
 * TORMONITOR AYAM — Vercel Serverless Function
 * Endpoint: POST /api/sensor
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const CONFIG = {
  suhu: { min_optimal: 24, max_optimal: 30 },
  kelembapan: { max_ideal: 75 },
  pakan: { kedalaman: 5.0, kritis: 15 },
};

async function supabaseFetch(path, method, body = null) {
  return fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Terima nilai mentah dari ESP32 ───────────────────────────
  const { suhu, kelembapan, jarak_cm } = req.body;

  if (suhu === undefined || kelembapan === undefined || jarak_cm === undefined) {
    return res.status(400).json({ error: "Field suhu, kelembapan, jarak_cm wajib diisi" });
  }

  // ── Kalkulasi stok pakan ─────────────────────────────────────
  // Wadah 5cm: jarak >= 5cm → 0%, jarak 0cm → 100%
  const kedalaman = CONFIG.pakan.kedalaman;
  let stok_pakan;
  if (jarak_cm >= kedalaman) {
    stok_pakan = 0;
  } else {
    stok_pakan = Math.round((1 - jarak_cm / kedalaman) * 100 * 10) / 10;
  }

  // ── Status ───────────────────────────────────────────────────
  let status_suhu;
  if (suhu < CONFIG.suhu.min_optimal) status_suhu = "rendah";
  else if (suhu <= CONFIG.suhu.max_optimal) status_suhu = "optimal";
  else status_suhu = "panas";

  const status_kelembapan = kelembapan <= CONFIG.kelembapan.max_ideal ? "ideal" : "lembap";
  const status_pakan = stok_pakan <= CONFIG.pakan.kritis ? "kritis" : "tersedia";

  // ── Simpan ke Supabase ───────────────────────────────────────
  const payload = {
    suhu: Math.round(suhu * 100) / 100,
    kelembapan: Math.round(kelembapan * 100) / 100,
    stok_pakan,   // hasil kalkulasi, bukan jarak mentah
  };

  const sbRes = await supabaseFetch("/rest/v1/tormonitor_ayam_logs", "POST", payload);

  if (!sbRes.ok) {
    const err = await sbRes.text();
    return res.status(502).json({ error: "Supabase error", detail: err });
  }

  return res.status(201).json({
    success: true,
    kalkulasi: { stok_pakan, status_suhu, status_kelembapan, status_pakan },
  });
}
