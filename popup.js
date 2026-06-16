let SERVER_URL = "https://meesho-backend-ga8x.onrender.com";
let TOKEN = localStorage.getItem("dc_user_token") || "";
let CURRENT_USER = null;
let GENERATED_FIELDS = [];
let SCANNED_FIELDS = [];

document.addEventListener("DOMContentLoaded", () => {
  const savedServer = localStorage.getItem("dc_server_url");
  if (savedServer) SERVER_URL = savedServer.replace(/\/$/, "");

  const serverInput = document.getElementById("serverUrl");
  if (serverInput) serverInput.value = SERVER_URL;

  bindEvents();

  if (TOKEN) checkSession();
});

function bindEvents() {
  byId("loginBtn").addEventListener("click", login);
  byId("signupBtn").addEventListener("click", signup);
  byId("logoutBtn").addEventListener("click", logout);
  byId("adminBtn").addEventListener("click", openAdmin);
  byId("generateTextBtn").addEventListener("click", generateFromText);
  byId("scanBtn").addEventListener("click", scanMeeshoForm);
  byId("autofillBtn").addEventListener("click", autofillMeesho);
  byId("analyzeImageBtn").addEventListener("click", analyzeImage);
  byId("optimizeImageBtn").addEventListener("click", optimizeImage);
  byId("shippingBtn").addEventListener("click", optimizeShipping);
  byId("saveServerBtn").addEventListener("click", saveServer);

  document.querySelectorAll(".tabBtn").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab, btn));
  });
}

function byId(id) {
  return document.getElementById(id);
}

function status(id, msg) {
  const el = byId(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

function showTab(name, btn) {
  document.querySelectorAll(".tab").forEach(t => t.classList.add("hidden"));
  byId("tab-" + name).classList.remove("hidden");

  document.querySelectorAll(".tabBtn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

function deviceId() {
  let id = localStorage.getItem("dc_device_id");
  if (!id) {
    id = "device-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem("dc_device_id", id);
  }
  return id;
}

async function login() {
  try {
    status("authStatus", "Logging in...");

    const res = await fetch(SERVER_URL + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: byId("email").value.trim(),
        password: byId("password").value.trim(),
        deviceId: deviceId()
      })
    });

    const data = await res.json();

    if (!data.success) {
      status("authStatus", data.error || "Login failed");
      return;
    }

    TOKEN = data.token;
    CURRENT_USER = data.user;

    localStorage.setItem("dc_user_token", TOKEN);

    showApp();
  } catch (e) {
    status("authStatus", "Server error: " + e.message);
  }
}

async function signup() {
  try {
    status("authStatus", "Creating account...");

    const res = await fetch(SERVER_URL + "/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: byId("name").value.trim(),
        email: byId("email").value.trim(),
        password: byId("password").value.trim(),
        deviceId: deviceId()
      })
    });

    const data = await res.json();

    if (!data.success) {
      status("authStatus", data.error || "Signup failed");
      return;
    }

    TOKEN = data.token;
    CURRENT_USER = data.user;

    localStorage.setItem("dc_user_token", TOKEN);

    showApp();
  } catch (e) {
    status("authStatus", "Server error: " + e.message);
  }
}

async function checkSession() {
  try {
    const res = await fetch(SERVER_URL + "/auth/check-session", {
      method: "POST",
      headers: { Authorization: "Bearer " + TOKEN }
    });

    const data = await res.json();

    if (!data.success) {
      logout();
      return;
    }

    CURRENT_USER = data.user;
    showApp();
  } catch {
    logout();
  }
}

function showApp() {
  byId("authBox").classList.add("hidden");
  byId("appBox").classList.remove("hidden");

  const sub = CURRENT_USER.subscription || {};
  const expiry = sub.expiry ? new Date(sub.expiry).toLocaleDateString() : "-";

  byId("accountInfo").innerHTML =
    "Email: <b>" + escapeHtml(CURRENT_USER.email) + "</b><br>" +
    "Plan: <b>" + escapeHtml(sub.planName || sub.planId || "Active") + "</b><br>" +
    "Expiry: <b>" + escapeHtml(expiry) + "</b>";

  byId("planBadge").textContent = "✓ " + (sub.planName || "Active");
  byId("planBadge").classList.remove("hidden");
}

function logout() {
  localStorage.removeItem("dc_user_token");
  TOKEN = "";
  CURRENT_USER = null;
  byId("authBox").classList.remove("hidden");
  byId("appBox").classList.add("hidden");
}

function openAdmin() {
  chrome.tabs.create({ url: chrome.runtime.getURL("admin.html") });
}

async function generateFromText() {
  try {
    const text = byId("productText").value.trim();
    const price = byId("priceInput").value.trim();
    const description = price ? text + " Meesho price: ₹" + price : text;

    if (!description) {
      status("listingStatus", "Enter product description first");
      return;
    }

    status("listingStatus", "Generating...");

    const res = await fetch(SERVER_URL + "/generate-from-text", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + TOKEN
      },
      body: JSON.stringify({
        description,
        formFields: SCANNED_FIELDS
      })
    });

    const data = await res.json();

    if (!data.success) {
      status("listingStatus", data.error || "Generate failed");
      return;
    }

    GENERATED_FIELDS = data.fields || [];

    byId("generatedOutput").value = JSON.stringify(GENERATED_FIELDS, null, 2);
    status("listingStatus", "Generated successfully");
  } catch (e) {
    status("listingStatus", "Error: " + e.message);
  }
}

async function analyzeImage() {
  try {
    const file = byId("imageFile").files[0];

    if (!file) {
      status("imageStatus", "Select image first");
      return;
    }

    status("imageStatus", "Analyzing image...");

    const fd = new FormData();
    fd.append("image", file);

    const res = await fetch(SERVER_URL + "/generate", {
      method: "POST",
      headers: { Authorization: "Bearer " + TOKEN },
      body: fd
    });

    const data = await res.json();

    if (!data.success) {
      status("imageStatus", data.error || "Image analyze failed");
      return;
    }

    byId("productText").value = data.result || "";
    status("imageStatus", "Image analyzed. Go to AI Listing tab and generate fields.");
  } catch (e) {
    status("imageStatus", "Error: " + e.message);
  }
}

async function optimizeImage() {
  status("imageStatus", "Image optimizer UI added. Backend processing can be connected to /image/optimize.");
}

async function optimizeShipping() {
  try {
    status("shippingStatus", "Getting suggestion...");

    const res = await fetch(SERVER_URL + "/shipping-optimize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + TOKEN
      },
      body: JSON.stringify({
        productType: byId("shipType").value
      })
    });

    const data = await res.json();

    if (!data.success) {
      status("shippingStatus", data.error || "Shipping failed");
      return;
    }

    const s = data.suggestion || {};

    status(
      "shippingStatus",
      "Weight: " + s.weight + "g | L: " + s.length + "cm | B: " + s.breadth + "cm | H: " + s.height + "cm"
    );
  } catch (e) {
    status("shippingStatus", "Error: " + e.message);
  }
}

async function scanMeeshoForm() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes("supplier.meesho.com")) {
      status("listingStatus", "Open Meesho supplier listing page first");
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, { action: "PING" });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["selector-utils.js", "content.js"]
      });
      await delay(600);
    }

    const result = await chrome.tabs.sendMessage(tab.id, { action: "SCAN_FORM" });

    if (!result || !result.success || !result.fields || !result.fields.length) {
      status("listingStatus", "No fields found. Open listing add/edit page.");
      return;
    }

    SCANNED_FIELDS = result.fields;
    status("listingStatus", result.fields.length + " fields scanned");
  } catch (e) {
    status("listingStatus", "Scan error: " + e.message);
  }
}

async function autofillMeesho() {
  try {
    if (!GENERATED_FIELDS.length) {
      status("listingStatus", "Generate fields first");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes("supplier.meesho.com")) {
      status("listingStatus", "Open Meesho supplier listing page first");
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, { action: "PING" });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["selector-utils.js", "content.js"]
      });
      await delay(600);
    }

    await chrome.tabs.sendMessage(tab.id, {
      action: "AUTOFILL",
      data: {
        fields: GENERATED_FIELDS,
        force: true
      }
    });

    status("listingStatus", "Autofill started");
  } catch (e) {
    status("listingStatus", "Autofill error: " + e.message);
  }
}

function saveServer() {
  const value = byId("serverUrl").value.trim().replace(/\/$/, "");

  if (!value.startsWith("http")) {
    status("settingsStatus", "Enter valid server URL");
    return;
  }

  SERVER_URL = value;
  localStorage.setItem("dc_server_url", SERVER_URL);
  status("settingsStatus", "Server saved");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
