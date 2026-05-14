/*
 * TORMONITOR AYAM — ESP32 Firmware
 * Backend: Vercel Serverless Functions
 *
 * Virtual Pin mapping:
 * V1  = suhu (DHT22, GPIO4)
 * V2  = kelembapan (DHT22, GPIO4)
 * V3  = jarak_cm (Ultrasonik HC-SR04, GPIO14)
 * V10–V17 = relay GPIO 17,5,18,19,21,3,1,22
 *
 * Library yang dibutuhkan:
 * - DHT sensor library (Adafruit)
 * - Adafruit Unified Sensor
 * - ArduinoJson (Benoit Blanchon) v6+
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ═══════════════════════════════════════════════════════════════
// KONFIGURASI — WAJIB DIISI
// ═══════════════════════════════════════════════════════════════

const char* WIFI_SSID = "telurdadar";
const char* WIFI_PASS = "telurdadar";

// Ganti dengan URL Vercel kamu setelah deploy
// Contoh: "https://tormonitor-ayam.vercel.app"
const char* API_BASE = "https://ayamkampus-9nnq.vercel.app";

// ── Pin Hardware ──────────────────────────────────────────────
#define DHT_PIN 4  // DHT22 data pin
#define DHT_TYPE DHT22
#define ULTRA_PIN 14  // HC-SR04 single-pin

// ── Relay 8 channel (active LOW) ─────────────────────────────
#define RELAY_COUNT 8
const int RELAY[RELAY_COUNT] = { 17, 5, 18, 19, 21, 23, 25, 22 };

// ── Interval polling ─────────────────────────────────────────
#define INTERVAL_SENSOR 5000  // kirim sensor tiap 5 detik
#define INTERVAL_POLL 2000    // polling relay tiap 2 detik

// ── DHT Retry ────────────────────────────────────────────────
#define DHT_RETRY_MAX 3
#define DHT_RETRY_DELAY 600

// ═══════════════════════════════════════════════════════════════
// GLOBAL
// ═══════════════════════════════════════════════════════════════

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long tSensor = 0, tPoll = 0;
bool relayState[RELAY_COUNT];

// ═══════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n========================================");
  Serial.println(" TORMONITOR AYAM — ESP32 Booting...");
  Serial.println("========================================");

  // Init relay — semua OFF saat boot (active LOW → HIGH = OFF)
  for (int i = 0; i < RELAY_COUNT; i++) {
    pinMode(RELAY[i], OUTPUT);
    digitalWrite(RELAY[i], HIGH);
    relayState[i] = false;
  }
  Serial.println("[RELAY] Semua relay OFF (boot)");

  // Ultrasonik single-pin: default OUTPUT LOW
  pinMode(ULTRA_PIN, OUTPUT);
  digitalWrite(ULTRA_PIN, LOW);

  // Init DHT
  dht.begin();
  Serial.println("[DHT] Sensor diinisialisasi (GPIO4, DHT22)");

  // Koneksi WiFi
  Serial.printf("[WIFI] Menghubungkan ke: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (++attempt > 40) {
      Serial.println("\n[WIFI] Gagal konek setelah 20 detik, restart...");
      ESP.restart();
    }
  }
  Serial.printf("\n[WIFI] Terhubung! IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("[WIFI] Signal RSSI: %d dBm\n", WiFi.RSSI());

  // Tunggu DHT22 stabilisasi
  Serial.println("[DHT] Menunggu sensor stabilisasi (2 detik)...");
  delay(2000);

  Serial.println("[BOOT] Selesai. Mulai loop...\n");
}

// ═══════════════════════════════════════════════════════════════
// LOOP
// ═══════════════════════════════════════════════════════════════

void loop() {
  unsigned long now = millis();

  if (now - tSensor >= INTERVAL_SENSOR) {
    tSensor = now;
    kirimSensor();
  }

  if (now - tPoll >= INTERVAL_POLL) {
    tPoll = now;
    pollRelay();
  }
}

// ═══════════════════════════════════════════════════════════════
// BACA DHT DENGAN RETRY
// ═══════════════════════════════════════════════════════════════

bool bacaDHT(float& suhu, float& kelembapan) {
  for (int i = 1; i <= DHT_RETRY_MAX; i++) {
    suhu = dht.readTemperature();
    kelembapan = dht.readHumidity();

    if (!isnan(suhu) && !isnan(kelembapan)) {
      if (i > 1) Serial.printf("[DHT] Berhasil baca pada percobaan ke-%d\n", i);
      return true;
    }

    Serial.printf("[DHT] Percobaan %d/%d gagal (NaN). Tunggu %dms...\n",
                  i, DHT_RETRY_MAX, DHT_RETRY_DELAY);
    delay(DHT_RETRY_DELAY);
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// KIRIM DATA SENSOR → POST /api/sensor
// ═══════════════════════════════════════════════════════════════

void kirimSensor() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[SENSOR] WiFi tidak terhubung, skip kirim.");
    reconnectWifi();
    return;
  }

  // Baca DHT
  float suhu = NAN, kelembapan = NAN;
  if (!bacaDHT(suhu, kelembapan)) {
    Serial.println("[DHT] GAGAL baca setelah semua percobaan! Cek: kabel GPIO4, pull-up 10k");
    return;
  }
  Serial.printf("[DHT] Suhu=%.1f°C Kelembapan=%.1f%%\n", suhu, kelembapan);

  // Baca ultrasonik
  float jarak = bacaUltrasonik();
  if (jarak < 0) {
    Serial.println("[ULTRA] Sensor timeout, skip kirim.");
    return;
  }
  Serial.printf("[ULTRA] Jarak=%.1f cm\n", jarak);

  // Buat JSON
  StaticJsonDocument<128> doc;
  doc["suhu"] = roundf(suhu * 10) / 10.0f;
  doc["kelembapan"] = roundf(kelembapan * 10) / 10.0f;
  doc["stok_pakan"] = roundf(jarak * 10) / 10.0f;

  String body;
  serializeJson(doc, body);
  Serial.printf("[SENSOR] Mengirim: %s\n", body.c_str());

  // HTTP POST ke Vercel /api/sensor
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String endpoint = String(API_BASE) + "/api/sensor";
  http.begin(client, endpoint);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  int code = http.POST(body);

  if (code == 200 || code == 201) {
    String raw = http.getString();
    Serial.printf("[SENSOR] Sukses! HTTP %d — %s\n", code, raw.c_str());

    // Parse response untuk terapkan relay jika ada
    StaticJsonDocument<256> res;
    if (deserializeJson(res, raw) == DeserializationError::Ok) {
      if (res.containsKey("pins")) {
        terapkanRelay(res["pins"].as<JsonObject>());
      }
    }
  } else if (code < 0) {
    Serial.printf("[SENSOR] Gagal koneksi! Error: %s\n", http.errorToString(code).c_str());
  } else {
    Serial.printf("[SENSOR] HTTP Error %d — %s\n", code, http.getString().c_str());
  }

  http.end();
}

// ═══════════════════════════════════════════════════════════════
// POLLING RELAY → GET /api/control
// ═══════════════════════════════════════════════════════════════

void pollRelay() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, String(API_BASE) + "/api/control");
  http.setTimeout(5000);
  int code = http.GET();

  if (code == 200) {
    String raw = http.getString();
    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, raw) == DeserializationError::Ok) {
      // Response: { "lampu": true, "kipas": false, ... }
      // Map relay berdasarkan indeks (V10=relay[0], V11=relay[1], ...)
      // Kamu bisa kustomisasi mapping ini sesuai kebutuhan
      const char* relayKeys[] = { "lampu", "kipas", "pompa", "pemanas",
                                  "relay5", "relay6", "relay7", "relay8" };
      for (int i = 0; i < RELAY_COUNT; i++) {
        if (doc.containsKey(relayKeys[i])) {
          bool nyala = doc[relayKeys[i]].as<bool>();
          if (nyala != relayState[i]) {
            relayState[i] = nyala;
            digitalWrite(RELAY[i], nyala ? LOW : HIGH);  // active LOW
            Serial.printf("[RELAY] %s → GPIO%d %s\n",
                          relayKeys[i], RELAY[i], nyala ? "ON" : "OFF");
          }
        }
      }
    }
  }

  http.end();
}

// ═══════════════════════════════════════════════════════════════
// TERAPKAN RELAY DARI RESPONSE JSON (opsional)
// ═══════════════════════════════════════════════════════════════

void terapkanRelay(JsonObject pins) {
  if (pins.isNull()) return;
  for (int i = 0; i < RELAY_COUNT; i++) {
    String key = "V" + String(10 + i);
    if (!pins.containsKey(key)) continue;
    bool nyala = (pins[key].as<int>() == 1);
    if (nyala != relayState[i]) {
      relayState[i] = nyala;
      digitalWrite(RELAY[i], nyala ? LOW : HIGH);
      Serial.printf("[RELAY] %s → GPIO%d %s\n",
                    key.c_str(), RELAY[i], nyala ? "ON" : "OFF");
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// ULTRASONIK SINGLE-PIN (GPIO14)
// ═══════════════════════════════════════════════════════════════

float bacaUltrasonik() {
  pinMode(ULTRA_PIN, OUTPUT);
  digitalWrite(ULTRA_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRA_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRA_PIN, LOW);

  pinMode(ULTRA_PIN, INPUT);
  long dur = pulseIn(ULTRA_PIN, HIGH, 30000);

  if (dur == 0) {
    Serial.println("[ULTRA] Timeout — cek wiring GPIO14");
    return -1.0f;
  }

  return (dur * 0.0343f) / 2.0f;
}

// ═══════════════════════════════════════════════════════════════
// RECONNECT WIFI
// ═══════════════════════════════════════════════════════════════

void reconnectWifi() {
  Serial.println("[WIFI] Putus, mencoba reconnect...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int t = 0;
  while (WiFi.status() != WL_CONNECTED && t++ < 20) delay(500);
  if (WiFi.status() == WL_CONNECTED)
    Serial.printf("[WIFI] Reconnected! IP: %s\n", WiFi.localIP().toString().c_str());
  else
    Serial.println("[WIFI] Gagal reconnect.");
}
