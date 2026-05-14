/**
 * TORMONITOR AYAM — Vercel Serverless Function
 * Endpoint: GET /api/control  → ESP32 polling status relay
 *           POST /api/control → Dashboard update status relay
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function supabaseFetch(path, method, body = null) {
  return fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer":        "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // GET /api/control — ESP32 polling status semua relay
  if (req.method === "GET") {
    const sbRes = await supabaseFetch(
      "/rest/v1/tormonitor_ayam_controls?select=id,status",
      "GET"
    );

    if (!sbRes.ok) {
      return res.status(502).json({ error: "Gagal ambil data kontrol" });
    }

    const data = await sbRes.json();

    // Bangun objek { id: status } untuk semua perangkat
    const result = {};
    data.forEach(item => { result[item.id] = item.status; });

    return res.status(200).json(result);
  }

  // POST /api/control — Dashboard update status relay
  if (req.method === "POST") {
    const { id, status } = req.body;

    if (!id || status === undefined) {
      return res.status(400).json({ error: "Field id dan status wajib diisi" });
    }

    const sbRes = await supabaseFetch(
      `/rest/v1/tormonitor_ayam_controls?id=eq.${id}`,
      "PATCH",
      { status }
    );

    if (!sbRes.ok) {
      return res.status(502).json({ error: "Gagal update kontrol" });
    }

    return res.status(200).json({ success: true, id, status });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
