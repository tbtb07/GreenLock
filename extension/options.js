// Options / setup page. Uses DEFAULT_SITES, normalizeDomain() and
// loadSettings() from settings.js. Nothing is stored until Save is clicked.
//
// Sites and the daily limit are stored locally. The outdoor break length
// and the unlock time after a break both belong to the server (GET/POST
// /settings) and are never stored locally.

const SETTINGS_URL = "http://localhost:5050/settings";
const SERVER_TIMEOUT_MS = 3000;
const MIN_BREAK_MINUTES = 5;
const MAX_BREAK_MINUTES = 180;
const MIN_UNLOCK_MINUTES = 10;
const MAX_UNLOCK_MINUTES = 240;

const defaultDomains = DEFAULT_SITES.map((s) => s.domain);

const defaultSitesEl = document.getElementById("defaultSites");
const addForm = document.getElementById("addForm");
const customInput = document.getElementById("customInput");
const addError = document.getElementById("addError");
const customList = document.getElementById("customList");
const customEmpty = document.getElementById("customEmpty");
const limitInput = document.getElementById("limitInput");
const limitError = document.getElementById("limitError");
const saveButton = document.getElementById("saveButton");
const saveStatus = document.getElementById("saveStatus");
const breakInput = document.getElementById("breakInput");
const breakError = document.getElementById("breakError");
const breakCurrent = document.getElementById("breakCurrent");
const breakPending = document.getElementById("breakPending");
const breakOffline = document.getElementById("breakOffline");
const unlockInput = document.getElementById("unlockInput");
const unlockError = document.getElementById("unlockError");
const unlockCurrent = document.getElementById("unlockCurrent");
const unlockPending = document.getElementById("unlockPending");
const unlockOffline = document.getElementById("unlockOffline");

let customSites = [];

// The server's settings as last loaded or saved - the full /settings
// response (break_minutes, unlock_minutes and both pending fields), or null
// if the server couldn't be reached. Both the break and unlock sections read
// from this one object, since a single GET/POST /settings always returns both.
let serverSettings = null;
// True once the user types in the break/unlock box. Saving only sends that
// field if its flag is set, so unrelated saves can't overwrite a pending change.
let breakEdited = false;
let unlockEdited = false;

function setStatus(text, kind) {
  saveStatus.textContent = text;
  saveStatus.className = kind || "";
}

function markUnsaved() {
  setStatus("Unsaved changes", "unsaved");
}

function renderDefaultSites(blockedSites) {
  defaultSitesEl.replaceChildren(
    ...DEFAULT_SITES.map(({ domain, label }) => {
      const wrapper = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = domain;
      box.checked = blockedSites.includes(domain);
      box.addEventListener("change", markUnsaved);
      wrapper.append(box, label);
      wrapper.title = domain;
      return wrapper;
    })
  );
}

function renderCustomSites() {
  customList.replaceChildren(
    ...customSites.map((domain) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = domain;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${domain}`);
      remove.addEventListener("click", () => {
        customSites = customSites.filter((d) => d !== domain);
        renderCustomSites();
        markUnsaved();
      });
      item.append(name, remove);
      return item;
    })
  );
  customEmpty.hidden = customSites.length > 0;
}

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addError.textContent = "";

  if (!customInput.value.trim()) {
    addError.textContent = "Enter a website to add.";
    return;
  }
  const domain = normalizeDomain(customInput.value);
  if (!domain) {
    addError.textContent = "That doesn't look like a valid domain (e.g. example.com).";
    return;
  }
  const preset = DEFAULT_SITES.find((s) => s.domain === domain);
  if (preset) {
    addError.textContent = `${domain} is already in the list above. Check "${preset.label}" instead.`;
    return;
  }
  if (customSites.includes(domain)) {
    addError.textContent = `${domain} is already added.`;
    return;
  }

  customSites.push(domain);
  customInput.value = "";
  renderCustomSites();
  markUnsaved();
});

customInput.addEventListener("input", () => {
  addError.textContent = "";
});

limitInput.addEventListener("input", () => {
  limitError.textContent = "";
  markUnsaved();
});

// Returns a whole number of minutes, or null (and shows an error) if invalid.
function readLimit() {
  const text = limitInput.value.trim();
  const minutes = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(minutes)) {
    limitError.textContent = "Enter a whole number of minutes.";
    return null;
  }
  if (minutes < MIN_LIMIT_MINUTES || minutes > MAX_LIMIT_MINUTES) {
    limitError.textContent = `Enter between ${MIN_LIMIT_MINUTES} and ${MAX_LIMIT_MINUTES} minutes.`;
    return null;
  }
  return minutes;
}

// ---------- Outdoor break length + unlock time (server settings) ----------

function isServerSettings(data) {
  return (
    Boolean(data) &&
    Number.isInteger(data.break_minutes) &&
    Number.isInteger(data.unlock_minutes)
  );
}

// Returns the server's settings (break_minutes, unlock_minutes and both
// pending fields), or null if it can't be reached.
async function fetchServerSettings() {
  try {
    const res = await fetch(SETTINGS_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
    });
    const data = await res.json();
    return res.ok && isServerSettings(data) ? data : null;
  } catch {
    return null;
  }
}

// Sends a new break length. Returns { settings } on success,
// { unreachable: true } if the server is down, or { error } otherwise.
async function postBreakSettings(minutes) {
  return postServerSettings({ break_minutes: minutes });
}

// Sends a new unlock time. Same return shape as postBreakSettings.
async function postUnlockSettings(minutes) {
  return postServerSettings({ unlock_minutes: minutes });
}

async function postServerSettings(body) {
  let res;
  let data;
  try {
    res = await fetch(SETTINGS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
    });
  } catch {
    return { unreachable: true };
  }
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.ok && isServerSettings(data)) return { settings: data };
  return { error: data?.error || `The server rejected the change (HTTP ${res.status}).` };
}

// Shows today's length and any pending change, kept on separate lines so
// it's clear which one applies today.
function renderBreak() {
  breakInput.disabled = serverSettings === null;
  breakOffline.hidden = serverSettings !== null;

  if (!serverSettings) {
    breakCurrent.textContent = "";
    breakPending.hidden = true;
    return;
  }

  breakCurrent.textContent = `Today: ${serverSettings.break_minutes} minutes.`;
  const pending = serverSettings.pending_break_minutes;
  // A pending value equal to today's length isn't a real change.
  if (Number.isInteger(pending) && pending !== serverSettings.break_minutes) {
    breakPending.textContent =
      `Changes to ${pending} minutes on ${serverSettings.pending_from}. Takes effect tomorrow.`;
    breakPending.hidden = false;
  } else {
    breakPending.hidden = true;
  }
}

// Same as renderBreak(), for the unlock-time section.
function renderUnlock() {
  unlockInput.disabled = serverSettings === null;
  unlockOffline.hidden = serverSettings !== null;

  if (!serverSettings) {
    unlockCurrent.textContent = "";
    unlockPending.hidden = true;
    return;
  }

  unlockCurrent.textContent = `Today: ${serverSettings.unlock_minutes} minutes.`;
  const pending = serverSettings.pending_unlock_minutes;
  if (Number.isInteger(pending) && pending !== serverSettings.unlock_minutes) {
    unlockPending.textContent =
      `Changes to ${pending} minutes on ${serverSettings.pending_unlock_from}. Takes effect tomorrow.`;
    unlockPending.hidden = false;
  } else {
    unlockPending.hidden = true;
  }
}

// Fills both boxes with today's values from the server.
function showServerSettings(settings) {
  serverSettings = settings;

  breakEdited = false;
  breakInput.value = settings ? settings.break_minutes : "";
  renderBreak();

  unlockEdited = false;
  unlockInput.value = settings ? settings.unlock_minutes : "";
  renderUnlock();
}

breakInput.addEventListener("input", () => {
  breakEdited = true;
  breakError.textContent = "";
  markUnsaved();
});

unlockInput.addEventListener("input", () => {
  unlockEdited = true;
  unlockError.textContent = "";
  markUnsaved();
});

const INVALID = Symbol("invalid");

// What to send to the server on Save: a number of minutes, null if there's
// nothing to send, or INVALID (with an error shown) if the box is invalid.
function readBreakChange() {
  if (!breakEdited || !serverSettings) return null;

  const text = breakInput.value.trim();
  const minutes = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(minutes)) {
    breakError.textContent = "Enter a whole number of minutes.";
    return INVALID;
  }
  if (minutes < MIN_BREAK_MINUTES || minutes > MAX_BREAK_MINUTES) {
    breakError.textContent = `Enter between ${MIN_BREAK_MINUTES} and ${MAX_BREAK_MINUTES} minutes.`;
    return INVALID;
  }

  // Only send if it differs from what will apply tomorrow.
  const tomorrow = serverSettings.pending_break_minutes ?? serverSettings.break_minutes;
  return minutes === tomorrow ? null : minutes;
}

// Same as readBreakChange(), for the unlock-time box.
function readUnlockChange() {
  if (!unlockEdited || !serverSettings) return null;

  const text = unlockInput.value.trim();
  const minutes = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(minutes)) {
    unlockError.textContent = "Enter a whole number of minutes.";
    return INVALID;
  }
  if (minutes < MIN_UNLOCK_MINUTES || minutes > MAX_UNLOCK_MINUTES) {
    unlockError.textContent = `Enter between ${MIN_UNLOCK_MINUTES} and ${MAX_UNLOCK_MINUTES} minutes.`;
    return INVALID;
  }

  const tomorrow = serverSettings.pending_unlock_minutes ?? serverSettings.unlock_minutes;
  return minutes === tomorrow ? null : minutes;
}

// ---------- Save ----------

saveButton.addEventListener("click", async () => {
  const dailyLimitMinutes = readLimit();
  const breakChange = readBreakChange();
  const unlockChange = readUnlockChange();
  if (dailyLimitMinutes === null) {
    setStatus("Not saved – fix the daily limit.", "invalid");
    return;
  }
  if (breakChange === INVALID) {
    setStatus("Not saved – fix the break length.", "invalid");
    return;
  }
  if (unlockChange === INVALID) {
    setStatus("Not saved – fix the unlock time.", "invalid");
    return;
  }

  const checkedDefaults = [
    ...defaultSitesEl.querySelectorAll("input:checked"),
  ].map((box) => box.value);

  const settings = {
    blockedSites: [...checkedDefaults, ...customSites],
    dailyLimitMinutes,
  };
  await chrome.storage.local.set({ settings });

  if (breakChange === null && unlockChange === null) {
    setStatus("Settings saved", "saved");
    return;
  }

  saveButton.disabled = true;
  setStatus("Saving to the server…", "unsaved");

  // Both changes are sent (as separate requests - each field has its own
  // tomorrow-only effective date) so one failing doesn't block the other.
  const failed = [];

  if (breakChange !== null) {
    const result = await postBreakSettings(breakChange);
    if (result.settings) {
      showServerSettings(result.settings);
    } else if (result.unreachable) {
      breakOffline.hidden = false;
      failed.push("break length");
    } else {
      breakError.textContent = result.error;
      failed.push("break length");
    }
  }

  if (unlockChange !== null) {
    const result = await postUnlockSettings(unlockChange);
    if (result.settings) {
      showServerSettings(result.settings);
    } else if (result.unreachable) {
      unlockOffline.hidden = false;
      failed.push("unlock time");
    } else {
      unlockError.textContent = result.error;
      failed.push("unlock time");
    }
  }

  saveButton.disabled = false;

  if (failed.length === 0) {
    setStatus("Settings saved", "saved");
  } else {
    const what = failed.join(" and ");
    setStatus(`Website settings saved. ${what[0].toUpperCase()}${what.slice(1)} not changed.`, "invalid");
  }
});

async function init() {
  const settings = await loadSettings();
  renderDefaultSites(settings.blockedSites);
  customSites = settings.blockedSites.filter((d) => !defaultDomains.includes(d));
  renderCustomSites();
  limitInput.value = settings.dailyLimitMinutes;

  // Load the server settings separately so a slow or missing server never
  // holds up the local settings.
  showServerSettings(await fetchServerSettings());
}

init();
