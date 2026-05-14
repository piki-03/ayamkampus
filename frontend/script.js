/**
 * TORMONITOR AYAM — script.js (Dynamic Devices Edition)
 * IoT Poultry Monitoring Dashboard
 *
 * Backend: Vercel Serverless Functions (/api/sensor, /api/control)
 * Database: Supabase (realtime subscription)
 */

"use strict";

// ============================================================
// KONFIGURASI — sesuaikan dengan Supabase project kamu
// ============================================================

const SUPABASE_URL = "https://iypfmqutatzkaiuebnrb.supabase.co";
const SUPABASE_KEY = "sb_publishable_1EB2aj89OPPBFpTc8f9vuw_5nzuIclm";

// API backend — Vercel Serverless Functions
// Di production: otomatis pakai domain Vercel kamu (tidak perlu diubah)
// Di local dev: ganti jadi "http://localhost:3000" jika pakai vercel dev
const API_BASE = "";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// STATE
// ============================================================

const state = {
  isOnline: false,
  suhu: 0,
  kelembapan: 0,
  stokPakan: 0,
  devices: {},   // { id: { label, icon, status } }
  startTime: Date.now(),
};

// ============================================================
// DOM REFERENCES (tetap, non-device)
// ============================================================

const DOM = {
  badge:        document.getElementById("connection-badge"),
  statusLabel:  document.getElementById("status-label"),
  currentTime:  document.getElementById("current-time"),
  tickerText:   document.getElementById("ticker-text"),
  uptimeDisp:   document.getElementById("uptime-display"),
  tempValue:    document.getElementById("temp-value"),
  tempBar:      document.getElementById("temp-bar"),
  tempStatus:   document.getElementById("temp-status"),
  cardSuhu:     document.getElementById("card-suhu"),
  humidValue:   document.getElementById("humid-value"),
  humidBar:     document.getElementById("humid-bar"),
  humidStatus:  document.getElementById("humid-status"),
  cardHumid:    document.getElementById("card-humid"),
  feedValue:    document.getElementById("feed-value"),
  feedGauge:    document.getElementById("feed-gauge-fill"),
  feedLabel:    document.getElementById("feed-label"),
  feedStatus:   document.getElementById("feed-status"),
  cardFeed:     document.getElementById("card-feed"),
  activityLog:  document.getElementById("activity-log"),
  btnClearLog:  document.getElementById("btn-clear-log"),
  controlGrid:  document.getElementById("control-grid"),
  deviceCount:  document.getElementById("device-count"),
  // Modal
  modalOverlay:       document.getElementById("modal-overlay"),
  btnAddDevice:       document.getElementById("btn-add-device"),
  btnModalClose:      document.getElementById("modal-close"),
  btnCancelDevice:    document.getElementById("btn-cancel-device"),
  btnSaveDevice:      document.getElementById("btn-save-device"),
  inputDeviceId:      document.getElementById("input-device-id"),
  inputDeviceLabel:   document.getElementById("input-device-label"),
  iconPicker:         document.getElementById("icon-picker"),
};

// ============================================================
// ICON MAP + ANIMASI CLASS
// ============================================================

const ICON_SVG = {

  plug: `<svg class="device-icon icon-plug" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 3v4M15 3v4"/>
    <path d="M5 7h14v5a7 7 0 0 1-14 0V7z"/>
    <path d="M12 17v4M9 21h6"/>
  </svg>`,

  light: `<svg class="device-icon icon-light" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
    <path d="M9 18h6M10 22h4"/>
    <line class="light-ray r1" x1="12" y1="1" x2="12" y2="3"/>
    <line class="light-ray r2" x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line class="light-ray r3" x1="19.78" y1="4.22" x2="18.36" y2="5.64"/>
  </svg>`,

  fan: `<svg class="device-icon icon-fan" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
    <path d="M12 6V3M12 21v-3M6 12H3M21 12h-3"/>
    <path d="M7.05 7.05 4.93 4.93M19.07 4.93l-2.12 2.12M7.05 16.95l-2.12 2.12M16.95 16.95l2.12 2.12"/>
  </svg>`,

  pump: `<svg class="device-icon icon-pump" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
    <circle class="pump-drop" cx="12" cy="14" r="2"/>
  </svg>`,

  heat: `<svg class="device-icon icon-heat" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path class="heat-wave w1" d="M8 2c0 3-3 3-3 6s3 3 3 6"/>
    <path class="heat-wave w2" d="M12 2c0 3-3 3-3 6s3 3 3 6"/>
    <path class="heat-wave w3" d="M16 2c0 3-3 3-3 6s3 3 3 6"/>
    <path d="M5 20h14"/>
  </svg>`,

  feed: `<svg class="device-icon icon-feed" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="12" cy="5" rx="8" ry="3"/>
    <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/>
    <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>
  </svg>`,

};

// ============================================================
// RENDER CARD PERANGKAT DINAMIS
// ============================================================

function renderDeviceCard(id, label, icon, status) {
  const existing = document.getElementById(`card-${id}`);
  if (existing) existing.remove();

  const card = document.createElement("article");
  card.className = `control-card${status ? " is-active" : ""}`;
  card.id = `card-${id}`;

  const iconClass = icon === "light" ? "control-card__icon-wrap--light"
                  : icon === "fan"   ? "control-card__icon-wrap--fan"
                  : "control-card__icon-wrap--generic";

  card.innerHTML = `
    <button class="control-card__delete" data-id="${id}" title="Hapus perangkat">✕</button>
    <div class="control-card__icon-wrap ${iconClass}${status ? " active" : ""}" id="icon-${id}">
      ${ICON_SVG[icon] || ICON_SVG.plug}
    </div>
    <div class="control-card__info">
      <h3 class="control-card__name">${label}</h3>
      <p class="control-card__desc">ID: ${id}</p>
      <span class="control-card__state" id="state-${id}">${status ? "NYALA" : "MATI"}</span>
    </div>
    <label class="toggle-switch" title="Toggle ${label}">
      <input type="checkbox" id="btn-${id}" class="toggle-switch__input" ${status ? "checked" : ""} />
      <span class="toggle-switch__track"><span class="toggle-switch__thumb"></span></span>
    </label>
  `;

  if (status) {
    const svg = card.querySelector(".device-icon");
    if (svg) svg.classList.add("anim-on");
  }

  DOM.controlGrid.appendChild(card);

  // Event toggle — kirim ke Vercel API
  card.querySelector(`#btn-${id}`).addEventListener("change", async (e) => {
    await updateControl(id, e.target.checked);
    addLog(`Request ${label} ${e.target.checked ? "ON" : "OFF"}`, "ctrl");
  });

  // Event hapus
  card.querySelector(".control-card__delete").addEventListener("click", () => {
    if (confirm(`Hapus perangkat "${label}"?`)) deleteDevice(id);
  });
}

function updateSwitchUI(id, status) {
  state.devices[id] = { ...state.devices[id], status };

  const card     = document.getElementById(`card-${id}`);
  const btn      = document.getElementById(`btn-${id}`);
  const stEl     = document.getElementById(`state-${id}`);
  const iconWrap = document.getElementById(`icon-${id}`);

  if (!card) return;

  if (btn)  btn.checked = status;
  if (stEl) stEl.textContent = status ? "NYALA" : "MATI";
  if (iconWrap) iconWrap.classList.toggle("active", status);
  card.classList.toggle("is-active", status);

  if (iconWrap) {
    const svg = iconWrap.querySelector(".device-icon");
    if (svg) svg.classList.toggle("anim-on", status);
  }
}

function updateDeviceCount() {
  const count = Object.keys(state.devices).length;
  DOM.deviceCount.textContent = `${count} Perangkat`;
}

// ============================================================
// API CALLS — Vercel Serverless Functions
// ============================================================

/**
 * Update status relay via POST /api/control
 * Dipanggil saat user toggle switch di dashboard
 */
async function updateControl(id, status) {
  try {
    const res = await fetch(`${API_BASE}/api/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      const err = await res.json();
      addLog(`Gagal kontrol ${id}: ${err.error}`, "warn");
    }
  } catch (err) {
    addLog(`Error kontrol ${id}: ${err.message}`, "warn");
  }
}

// ============================================================
// SUPABASE — Fetch data & operasi langsung ke DB
// (Supabase JS SDK dipakai langsung dari frontend untuk read)
// ============================================================

async function fetchLatestData() {
  const { data, error } = await supabaseClient
    .from("tormonitor_ayam_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) console.error("Error fetching logs:", error);
  else if (data && data.length > 0) {
    updateMonitoringUI(data[0]);
    addLog("Data terakhir berhasil disinkronkan.", "system");
  }
}

async function fetchControlStatus() {
  const { data, error } = await supabaseClient
    .from("tormonitor_ayam_controls")
    .select("*");

  if (error) { console.error("Error fetching controls:", error); return; }

  DOM.controlGrid.innerHTML = "";
  state.devices = {};

  data.forEach(item => {
    state.devices[item.id] = { label: item.label, icon: item.icon, status: item.status };
    renderDeviceCard(item.id, item.label, item.icon, item.status);
  });

  updateDeviceCount();
}

async function insertNewDevice(id, label, icon) {
  const { error } = await supabaseClient
    .from("tormonitor_ayam_controls")
    .insert({ id, label, icon, status: false });

  if (error) {
    addLog(`Gagal tambah perangkat: ${error.message}`, "warn");
    return false;
  }
  return true;
}

async function deleteDevice(id) {
  const { error } = await supabaseClient
    .from("tormonitor_ayam_controls")
    .delete()
    .eq("id", id);

  if (error) {
    addLog(`Gagal hapus: ${error.message}`, "warn");
    return;
  }

  delete state.devices[id];
  const card = document.getElementById(`card-${id}`);
  if (card) card.remove();
  updateDeviceCount();
  addLog(`Perangkat "${id}" dihapus.`, "system");
}

// ============================================================
// REALTIME — Supabase live subscription
// ============================================================

function subscribeRealtime() {
  supabaseClient
    .channel("public:tormonitor_ayam_logs")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "tormonitor_ayam_logs" }, payload => {
      updateMonitoringUI(payload.new);
      addLog(`Update: Suhu=${payload.new.suhu}°C Pakan=${payload.new.stok_pakan}%`, "data");
    })
    .subscribe();

  supabaseClient
    .channel("public:tormonitor_ayam_controls")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tormonitor_ayam_controls" }, payload => {
      updateSwitchUI(payload.new.id, payload.new.status);
      addLog(`${payload.new.label || payload.new.id} sekarang ${payload.new.status ? "ON" : "OFF"}`, "system");
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "tormonitor_ayam_controls" }, payload => {
      const { id, label, icon, status } = payload.new;
      state.devices[id] = { label, icon, status };
      renderDeviceCard(id, label, icon, status);
      updateDeviceCount();
      addLog(`Perangkat baru ditambahkan: ${label}`, "system");
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "tormonitor_ayam_controls" }, payload => {
      const id = payload.old.id;
      delete state.devices[id];
      const card = document.getElementById(`card-${id}`);
      if (card) card.remove();
      updateDeviceCount();
    })
    .subscribe();
}

// ============================================================
// MODAL — Tambah Perangkat
// ============================================================

let selectedIcon = "plug";

function openModal() {
  DOM.inputDeviceId.value    = "";
  DOM.inputDeviceLabel.value = "";
  selectedIcon = "plug";
  DOM.iconPicker.querySelectorAll(".icon-option").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.icon === "plug");
  });
  DOM.modalOverlay.classList.add("is-open");
  DOM.inputDeviceId.focus();
}

function closeModal() {
  DOM.modalOverlay.classList.remove("is-open");
}

DOM.btnAddDevice.addEventListener("click", openModal);
DOM.btnModalClose.addEventListener("click", closeModal);
DOM.btnCancelDevice.addEventListener("click", closeModal);
DOM.modalOverlay.addEventListener("click", (e) => {
  if (e.target === DOM.modalOverlay) closeModal();
});

DOM.iconPicker.addEventListener("click", (e) => {
  const btn = e.target.closest(".icon-option");
  if (!btn) return;
  DOM.iconPicker.querySelectorAll(".icon-option").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  selectedIcon = btn.dataset.icon;
});

DOM.btnSaveDevice.addEventListener("click", async () => {
  const rawId = DOM.inputDeviceId.value.trim().toLowerCase().replace(/\s+/g, "_");
  const label = DOM.inputDeviceLabel.value.trim();

  if (!rawId) { alert("ID perangkat wajib diisi!"); return; }
  if (!label) { alert("Nama perangkat wajib diisi!"); return; }
  if (state.devices[rawId]) { alert(`ID "${rawId}" sudah digunakan!`); return; }

  DOM.btnSaveDevice.disabled = true;
  DOM.btnSaveDevice.textContent = "Menyimpan...";

  const ok = await insertNewDevice(rawId, label, selectedIcon);

  DOM.btnSaveDevice.disabled = false;
  DOM.btnSaveDevice.textContent = "Simpan Perangkat";

  if (ok) {
    addLog(`Perangkat "${label}" (${rawId}) ditambahkan.`, "system");
    closeModal();
  }
});

// ============================================================
// MONITORING UI
// ============================================================

function updateMonitoringUI(data) {
  state.suhu       = data.suhu;
  state.kelembapan = data.kelembapan;
  state.stokPakan  = data.stok_pakan;

  DOM.tempValue.textContent  = state.suhu.toFixed(1);
  DOM.tempBar.style.width    = `${Math.min(100, (state.suhu / 50) * 100)}%`;
  const suhuStat = getSuhuStatus(state.suhu);
  DOM.tempStatus.textContent = suhuStat.text;
  applyAlertClass(DOM.cardSuhu, suhuStat.level);

  DOM.humidValue.textContent  = state.kelembapan.toFixed(1);
  DOM.humidBar.style.width    = `${state.kelembapan}%`;
  const humidStat = getHumidStatus(state.kelembapan);
  DOM.humidStatus.textContent = humidStat.text;
  applyAlertClass(DOM.cardHumid, humidStat.level);

  const feedPct = state.stokPakan;
  DOM.feedValue.textContent  = feedPct.toFixed(0);
  const circumference = 314.16;
  DOM.feedGauge.style.strokeDashoffset = circumference - (feedPct / 100) * circumference;
  DOM.feedLabel.textContent  = `${feedPct.toFixed(0)}%`;
  const feedStat = getFeedStatus(feedPct);
  DOM.feedStatus.textContent = feedStat.text;
  applyAlertClass(DOM.cardFeed, feedStat.level);

  DOM.tickerText.textContent = `Suhu: ${state.suhu}°C | Humid: ${state.kelembapan}% | Pakan: ${feedPct}%`;
}

function getSuhuStatus(v) {
  if (v < 24)  return { text: "⬇️ Suhu rendah", level: "low" };
  if (v <= 30) return { text: "✅ Optimal",      level: "ok" };
  return             { text: "🔴 Suhu Panas!",   level: "high" };
}

function getHumidStatus(v) {
  if (v <= 75) return { text: "✅ Ideal",   level: "ok" };
  return             { text: "⚠️ Lembap",  level: "warn" };
}

function getFeedStatus(v) {
  if (v <= 15) return { text: "🔴 KRITIS!", level: "high" };
  return             { text: "✅ Tersedia", level: "ok" };
}

function applyAlertClass(card, level) {
  card.classList.remove("monitor-card--alert-high", "monitor-card--alert-low");
  if (level === "high") card.classList.add("monitor-card--alert-high");
  if (level === "low" || level === "warn") card.classList.add("monitor-card--alert-low");
}

// ============================================================
// LOG
// ============================================================

function addLog(message, type = "data") {
  const empty = DOM.activityLog.querySelector(".log-box__empty");
  if (empty) empty.remove();
  const timeStr = new Date().toTimeString().slice(0, 8);
  const typeMap = { ctrl: "[CTRL]", data: "[DATA]", warn: "[WARN]", system: "[SYS ]" };
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.innerHTML = `<span class="log-entry__time">${timeStr}</span> <span class="log-entry__type log-entry__type--${type}">${typeMap[type] || "[INFO]"}</span> <span class="log-entry__msg">${message}</span>`;
  DOM.activityLog.prepend(entry);
}

DOM.btnClearLog.addEventListener("click", () => {
  DOM.activityLog.innerHTML = '<p class="log-box__empty">Log dibersihkan...</p>';
});

// ============================================================
// INIT
// ============================================================

async function init() {
  try {
    addLog("Inisialisasi sistem...", "system");
    await fetchLatestData();
    await fetchControlStatus();
    subscribeRealtime();

    setInterval(() => {
      DOM.currentTime.textContent = new Date().toTimeString().slice(0, 8);
      const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const s = String(elapsed % 60).padStart(2, "0");
      DOM.uptimeDisp.textContent = `Uptime: 00:${m}:${s}`;
    }, 1000);

    DOM.badge.classList.add("online");
    DOM.statusLabel.textContent = "Connected";
    addLog("Sistem siap.", "system");
  } catch (err) {
    console.error("Init Error:", err);
    DOM.statusLabel.textContent = "Offline / Error";
    addLog(`Error inisialisasi: ${err.message}`, "warn");
  }
}

init();
