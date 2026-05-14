# 🐔 TORMONITOR AYAM

IoT Poultry Monitoring System — ESP32 + Supabase + Vercel

## Arsitektur

```
ESP32 (DHT22 + Ultrasonik + Relay)
  └─→ POST /api/sensor   ──→ Vercel Serverless Function
  └─→ GET  /api/control  ──→ Vercel Serverless Function
                                    │
                              Supabase (PostgreSQL + Realtime)
                                    │
                            Dashboard Web (frontend/)
                              └─→ Supabase Realtime WebSocket
```

## Struktur Repo

```
tortutorayam/
├── api/
│   ├── sensor.js          → POST /api/sensor  (terima data ESP32)
│   └── control.js         → GET/POST /api/control (relay on/off)
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── firmware/
│   └── tormonitor_ayam.ino
├── database/
│   └── schema.sql
├── vercel.json
├── package.json
├── .env.example
└── .gitignore
```

---

## Setup: Langkah Demi Langkah

### 1. Supabase — Setup Database

1. Buka [supabase.com](https://supabase.com) → buat project baru
2. Buka **SQL Editor** → jalankan semua isi file `database/schema.sql`
3. Catat:
   - **Project URL**: `https://xxxxxxxx.supabase.co`
   - **Anon Key**: di Settings → API

### 2. Vercel — Deploy Backend + Frontend

1. Push repo ini ke GitHub
2. Buka [vercel.com](https://vercel.com) → **Add New Project**
3. Import repo ini dari GitHub
4. Tambah **Environment Variables**:
   - `SUPABASE_URL` = URL Supabase kamu
   - `SUPABASE_KEY` = Anon Key Supabase kamu
5. Klik **Deploy**
6. Catat URL Vercel kamu, contoh: `https://tormonitor-ayam.vercel.app`

### 3. Update script.js (Frontend)

Buka `frontend/script.js`, ganti di bagian paling atas:

```js
const SUPABASE_URL = "https://URL_SUPABASE_KAMU.supabase.co";
const SUPABASE_KEY = "ANON_KEY_SUPABASE_KAMU";
```

Lalu `git push` → Vercel otomatis redeploy.

### 4. Update Firmware ESP32

Buka `firmware/tormonitor_ayam.ino`, ganti:

```cpp
const char* WIFI_SSID = "NAMA_WIFI_KAMU";
const char* WIFI_PASS = "PASSWORD_WIFI_KAMU";
const char* API_BASE  = "https://tormonitor-ayam.vercel.app"; // URL Vercel kamu
```

Upload ke ESP32 via Arduino IDE.

---

## API Endpoints

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/sensor` | ESP32 kirim data suhu, kelembapan, jarak |
| `GET` | `/api/control` | ESP32 polling status relay |
| `POST` | `/api/control` | Dashboard update status relay |

### Contoh Body POST /api/sensor

```json
{
  "suhu": 29.5,
  "kelembapan": 68.2,
  "jarak_cm": 12.3
}
```

### Contoh Body POST /api/control

```json
{
  "id": "lampu",
  "status": true
}
```

---

## Development Lokal

```bash
# Install Vercel CLI
npm install -g vercel

# Salin environment variables
cp .env.example .env.local
# Edit .env.local dengan kredensial Supabase kamu

# Jalankan development server
vercel dev
# → Backend: http://localhost:3000/api/sensor
# → Frontend: http://localhost:3000
```

---

## Library Arduino yang Dibutuhkan

Install via **Arduino IDE → Library Manager**:
- DHT sensor library (Adafruit)
- Adafruit Unified Sensor
- ArduinoJson (Benoit Blanchon) v6+

---

## Lisensi

MIT
