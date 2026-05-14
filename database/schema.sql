-- ============================================================
-- TORMONITOR AYAM — Database Schema
-- Platform: Supabase (PostgreSQL)
-- ============================================================


-- ============================================================
-- 1. TABEL LOGS SENSOR
--    Menyimpan data dari sensor IoT (suhu, kelembapan, pakan)
-- ============================================================

CREATE TABLE IF NOT EXISTS tormonitor_ayam_logs (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    suhu        NUMERIC(5, 2) NOT NULL,       -- Suhu kandang dalam °C (0–50)
    kelembapan  NUMERIC(5, 2) NOT NULL,       -- Kelembapan dalam % (0–100)
    stok_pakan  NUMERIC(5, 2) NOT NULL        -- Stok pakan dalam % (0–100)
);

-- Indeks untuk query terbaru (dipakai di .order('created_at', desc).limit(1))
CREATE INDEX IF NOT EXISTS idx_logs_created_at
    ON tormonitor_ayam_logs (created_at DESC);

-- Komentar kolom
COMMENT ON TABLE  tormonitor_ayam_logs             IS 'Log data sensor IoT kandang ayam';
COMMENT ON COLUMN tormonitor_ayam_logs.suhu        IS 'Suhu kandang dalam derajat Celsius';
COMMENT ON COLUMN tormonitor_ayam_logs.kelembapan  IS 'Kelembapan relatif kandang dalam persen';
COMMENT ON COLUMN tormonitor_ayam_logs.stok_pakan  IS 'Level stok pakan dari sensor ultrasonik dalam persen';


-- ============================================================
-- 2. TABEL CONTROLS PERANGKAT
--    Menyimpan status on/off setiap perangkat
-- ============================================================

CREATE TABLE IF NOT EXISTS tormonitor_ayam_controls (
    id          TEXT PRIMARY KEY,             -- 'lampu' | 'kipas'
    status      BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Komentar
COMMENT ON TABLE  tormonitor_ayam_controls            IS 'Status kontrol perangkat kandang (lampu, kipas)';
COMMENT ON COLUMN tormonitor_ayam_controls.id         IS 'Identifier perangkat: lampu atau kipas';
COMMENT ON COLUMN tormonitor_ayam_controls.status     IS 'TRUE = ON/NYALA, FALSE = OFF/MATI';
COMMENT ON COLUMN tormonitor_ayam_controls.updated_at IS 'Waktu terakhir status diperbarui';

-- Trigger: otomatis update kolom updated_at saat row diupdate
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_controls_updated_at
    BEFORE UPDATE ON tormonitor_ayam_controls
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- 3. DATA AWAL (SEED)
--    Insert row default untuk lampu dan kipas
-- ============================================================

INSERT INTO tormonitor_ayam_controls (id, status)
VALUES
    ('lampu', FALSE),
    ('kipas', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Contoh data sensor awal (opsional, untuk testing)
INSERT INTO tormonitor_ayam_logs (suhu, kelembapan, stok_pakan)
VALUES (28.5, 65.0, 80.0);


-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
--    Aktifkan RLS dan buat policy untuk akses publik
--    (sesuaikan dengan kebutuhan keamanan Anda)
-- ============================================================

-- Aktifkan RLS
ALTER TABLE tormonitor_ayam_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tormonitor_ayam_controls ENABLE ROW LEVEL SECURITY;

-- Policy: izinkan SELECT untuk semua (anon key)
CREATE POLICY "Allow public read logs"
    ON tormonitor_ayam_logs FOR SELECT
    USING (true);

CREATE POLICY "Allow public read controls"
    ON tormonitor_ayam_controls FOR SELECT
    USING (true);

-- Policy: izinkan INSERT log (dari ESP32/perangkat IoT)
CREATE POLICY "Allow insert logs"
    ON tormonitor_ayam_logs FOR INSERT
    WITH CHECK (true);

-- Policy: izinkan UPDATE controls (dari dashboard web)
CREATE POLICY "Allow update controls"
    ON tormonitor_ayam_controls FOR UPDATE
    USING (true)
    WITH CHECK (true);


-- ============================================================
-- 5. AKTIFKAN REALTIME
--    Agar subscription Supabase Realtime berfungsi
-- ============================================================

ALTER PUBLICATION supabase_realtime
    ADD TABLE tormonitor_ayam_logs, tormonitor_ayam_controls;


-- Tambah kolom baru di tabel controls
ALTER TABLE tormonitor_ayam_controls
  ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT 'Perangkat',
  ADD COLUMN IF NOT EXISTS icon  TEXT NOT NULL DEFAULT 'plug';

-- Update data lama supaya punya label
UPDATE tormonitor_ayam_controls SET label = 'Lampu Kandang', icon = 'light' WHERE id = 'lampu';
UPDATE tormonitor_ayam_controls SET label = 'Kipas Ventilasi', icon = 'fan'   WHERE id = 'kipas';

-- Policy: izinkan INSERT perangkat baru dari dashboard
CREATE POLICY "Allow insert controls"
  ON tormonitor_ayam_controls FOR INSERT
  WITH CHECK (true);

-- Policy: izinkan DELETE perangkat dari dashboard
CREATE POLICY "Allow delete controls"
  ON tormonitor_ayam_controls FOR DELETE
  USING (true);
