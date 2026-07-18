/*
 * Adds editing to the existing pod/sensor Change History without changing
 * App.jsx. Each edit preserves the record ID, updates the shared site log,
 * re-sorts the history, and refreshes the app.
 */

const SITE_EDIT_MODAL_ID = "hudson-site-edit-modal";
const SITE_EDIT_STYLE_ID = "hudson-site-edit-styles";
const SITE_EDIT_MARKER = "data-site-edit-ready";

const SITE_OPTIONS = {
  pod: [
    "Abdomen — L",
    "Abdomen — R",
    "Lower back — L",
    "Lower back — R",
    "Upper arm — L",
    "Upper arm — R",
    "Thigh — L",
    "Thigh — R",
  ],
  sensor: [
    "Upper arm — L",
    "Upper arm — R",
    "Abdomen — L",
    "Abdomen — R",
    "Thigh — L",
    "Thigh — R",
    "Lower back — L",
    "Lower back — R",
    "Upper buttock — L",
    "Upper buttock — R",
  ],
};

let cachedSites = null;
let cacheLoadedAt = 0;
let decorating = false;
let decorateScheduled = false;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dateInputValue(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`;
}

function timeInputValue(timestamp) {
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function timestampFromInputs(dateValue, timeValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);

  if (
    !year ||
    !month ||
    !day ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  const timestamp = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
  ).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function ensureStyles() {
  if (document.getElementById(SITE_EDIT_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = SITE_EDIT_STYLE_ID;
  style.textContent = `
    .hudson-site-history-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      white-space: nowrap;
    }

    .hudson-site-history-edit,
    .hudson-site-history-remove {
      appearance: none;
      border: 0;
      background: none;
      padding: 4px 0;
      font: inherit;
      font-size: 11px;
      cursor: pointer;
    }

    .hudson-site-history-edit {
      color: #241773;
      font-weight: 800;
    }

    .hudson-site-history-remove {
      color: #9a9aa0 !important;
    }

    #${SITE_EDIT_MODAL_ID} {
      position: fixed;
      inset: 0;
      z-index: 13000;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background: rgba(0, 0, 0, 0.34);
      font-family: 'Nunito Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    #${SITE_EDIT_MODAL_ID}[hidden] {
      display: none;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-sheet {
      width: min(100%, 480px);
      max-height: 92vh;
      overflow-y: auto;
      border-radius: 18px 18px 0 0;
      background: #ffffff;
      padding: 20px 20px calc(28px + env(safe-area-inset-bottom));
      box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.28);
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-handle {
      width: 38px;
      height: 4px;
      margin: 0 auto 18px;
      border-radius: 4px;
      background: #e8e8ec;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 18px;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-title {
      color: #1c1c1e;
      font-size: 20px;
      font-weight: 900;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-close {
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 50%;
      background: #f2f2f4;
      color: #1c1c1e;
      font: inherit;
      font-size: 20px;
      cursor: pointer;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px 10px;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-field-full {
      grid-column: 1 / -1;
    }

    #${SITE_EDIT_MODAL_ID} label {
      color: #6e6e73;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    #${SITE_EDIT_MODAL_ID} select,
    #${SITE_EDIT_MODAL_ID} input {
      width: 100%;
      min-height: 46px;
      border: 0;
      border-radius: 12px;
      outline: none;
      background: #f2f2f4;
      padding: 10px 12px;
      color: #1c1c1e;
      font: inherit;
      font-size: 15px;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-error {
      min-height: 18px;
      margin-top: 12px;
      color: #e8434c;
      font-size: 12px;
      font-weight: 700;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-button {
      min-height: 48px;
      border: 0;
      border-radius: 14px;
      font: inherit;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-cancel {
      background: #f2f2f4;
      color: #1c1c1e;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-save {
      background: #241773;
      color: #ffffff;
    }

    #${SITE_EDIT_MODAL_ID} .site-edit-save:disabled {
      cursor: wait;
      opacity: 0.6;
    }
  `;

  document.head.appendChild(style);
}

async function loadSites(force = false) {
  const freshEnough = Date.now() - cacheLoadedAt < 15000;

  if (!force && cachedSites && freshEnough) {
    return cachedSites;
  }

  const response = await fetch("/api/site-log", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not load change history.");
  }

  const data = await response.json();
  cachedSites = Array.isArray(data)
    ? [...data].sort((a, b) => b.ts - a.ts)
    : [];
  cacheLoadedAt = Date.now();

  return cachedSites;
}

function findHistoryCard() {
  const heading = Array.from(document.querySelectorAll("div")).find(
    (element) =>
      element.children.length === 0 &&
      element.textContent?.trim() === "📋 Change History",
  );

  return heading?.parentElement ?? null;
}

function historyRows(card) {
  return Array.from(card?.children ?? []).filter((child) =>
    Array.from(child.querySelectorAll("button")).some(
      (button) => button.textContent?.trim() === "remove",
    ),
  );
}

function closeEditor() {
  const modal = document.getElementById(SITE_EDIT_MODAL_ID);
  if (modal) modal.hidden = true;
}

function populateLocationOptions(select, device, selectedSite) {
  const options = SITE_OPTIONS[device] ?? SITE_OPTIONS.pod;
  select.innerHTML = "";

  for (const site of options) {
    const option = document.createElement("option");
    option.value = site;
    option.textContent = site;
    option.selected = site === selectedSite;
    select.appendChild(option);
  }

  if (!options.includes(selectedSite)) {
    select.value = options[0];
  }
}

async function saveEditedEntry(entryId, modal) {
  const device = modal.querySelector('[name="site-edit-device"]')?.value;
  const site = modal.querySelector('[name="site-edit-location"]')?.value;
  const date = modal.querySelector('[name="site-edit-date"]')?.value;
  const time = modal.querySelector('[name="site-edit-time"]')?.value;
  const saveButton = modal.querySelector(".site-edit-save");
  const errorBox = modal.querySelector(".site-edit-error");
  const timestamp = timestampFromInputs(date, time);

  errorBox.textContent = "";

  if (!device || !site || !timestamp) {
    errorBox.textContent = "Choose a device, location, date, and time.";
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Saving…";

  try {
    const sites = await loadSites(true);
    const index = sites.findIndex(
      (entry) => String(entry.id) === String(entryId),
    );

    if (index < 0) {
      throw new Error("This history entry could not be found.");
    }

    const next = [...sites];
    next[index] = {
      ...next[index],
      id: next[index].id,
      device,
      site,
      ts: timestamp,
    };

    next.sort((a, b) => b.ts - a.ts);

    const response = await fetch("/api/site-log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sites: next }),
    });

    if (!response.ok) {
      throw new Error("The change could not be saved.");
    }

    cachedSites = next;
    cacheLoadedAt = Date.now();
    saveButton.textContent = "✓ Saved";

    window.setTimeout(() => {
      window.location.reload();
    }, 350);
  } catch (error) {
    errorBox.textContent =
      error instanceof Error
        ? error.message
        : "The change could not be saved.";
    saveButton.disabled = false;
    saveButton.textContent = "Save changes";
  }
}

function openEditor(entry) {
  ensureStyles();

  let modal = document.getElementById(SITE_EDIT_MODAL_ID);

  if (!modal) {
    modal = document.createElement("div");
    modal.id = SITE_EDIT_MODAL_ID;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "site-edit-title");
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeEditor();
    });
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="site-edit-sheet">
      <div class="site-edit-handle"></div>

      <div class="site-edit-header">
        <div class="site-edit-title" id="site-edit-title">Edit change</div>
        <button class="site-edit-close" type="button" aria-label="Close">×</button>
      </div>

      <div class="site-edit-grid">
        <div class="site-edit-field site-edit-field-full">
          <label for="site-edit-device">Device</label>
          <select id="site-edit-device" name="site-edit-device">
            <option value="pod">Pod</option>
            <option value="sensor">Sensor</option>
          </select>
        </div>

        <div class="site-edit-field site-edit-field-full">
          <label for="site-edit-location">Location</label>
          <select id="site-edit-location" name="site-edit-location"></select>
        </div>

        <div class="site-edit-field">
          <label for="site-edit-date">Date</label>
          <input
            id="site-edit-date"
            name="site-edit-date"
            type="date"
            value="${dateInputValue(entry.ts)}"
          />
        </div>

        <div class="site-edit-field">
          <label for="site-edit-time">Time</label>
          <input
            id="site-edit-time"
            name="site-edit-time"
            type="time"
            value="${timeInputValue(entry.ts)}"
          />
        </div>
      </div>

      <div class="site-edit-error" aria-live="polite"></div>

      <div class="site-edit-buttons">
        <button
          class="site-edit-button site-edit-cancel"
          type="button"
        >
          Cancel
        </button>

        <button
          class="site-edit-button site-edit-save"
          type="button"
        >
          Save changes
        </button>
      </div>
    </div>
  `;

  const deviceSelect = modal.querySelector('[name="site-edit-device"]');
  const locationSelect = modal.querySelector('[name="site-edit-location"]');

  deviceSelect.value = entry.device;
  populateLocationOptions(
    locationSelect,
    entry.device,
    entry.site,
  );

  deviceSelect.addEventListener("change", () => {
    populateLocationOptions(
      locationSelect,
      deviceSelect.value,
      locationSelect.value,
    );
  });

  modal
    .querySelector(".site-edit-close")
    ?.addEventListener("click", closeEditor);
  modal
    .querySelector(".site-edit-cancel")
    ?.addEventListener("click", closeEditor);
  modal
    .querySelector(".site-edit-save")
    ?.addEventListener("click", () =>
      saveEditedEntry(entry.id, modal),
    );

  modal.hidden = false;
  deviceSelect.focus();
}

async function decorateHistory() {
  if (decorating) return;

  const card = findHistoryCard();
  if (!card) return;

  const rows = historyRows(card);
  if (rows.length === 0) return;

  decorating = true;

  try {
    const sites = await loadSites(
      !cachedSites || rows.length > cachedSites.length,
    );

    rows.forEach((row, index) => {
      if (row.getAttribute(SITE_EDIT_MARKER) === "true") return;

      const entry = sites[index];
      const removeButton = Array.from(
        row.querySelectorAll("button"),
      ).find(
        (button) => button.textContent?.trim() === "remove",
      );

      if (!entry || !removeButton) return;

      const actions = document.createElement("div");
      actions.className = "hudson-site-history-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "hudson-site-history-edit";
      editButton.textContent = "edit";
      editButton.setAttribute(
        "aria-label",
        `Edit ${entry.device} change at ${entry.site}`,
      );
      editButton.addEventListener("click", () =>
        openEditor(entry),
      );

      removeButton.classList.add(
        "hudson-site-history-remove",
      );

      removeButton.replaceWith(actions);
      actions.append(editButton, removeButton);
      row.setAttribute(SITE_EDIT_MARKER, "true");
    });
  } catch {
    // Leave the existing history untouched if the shared log cannot load.
  } finally {
    decorating = false;
  }
}

function scheduleDecorate() {
  if (decorateScheduled) return;
  decorateScheduled = true;

  window.requestAnimationFrame(() => {
    decorateScheduled = false;
    decorateHistory();
  });
}

function initializeSiteHistoryEditing() {
  if (window.__hudsonSiteHistoryEditingInitialized) return;
  window.__hudsonSiteHistoryEditingInitialized = true;

  ensureStyles();
  scheduleDecorate();

  const root = document.getElementById("root");
  if (!root) return;

  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(root, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeSiteHistoryEditing,
    { once: true },
  );
} else {
  initializeSiteHistoryEditing();
}
