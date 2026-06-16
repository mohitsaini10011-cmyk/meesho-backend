const SERVER_URL = "https://meesho-backend-ga8x.onrender.com";

let TOKEN = localStorage.getItem("dc_admin_token") || "";
let USERS = [];
let PLANS = [];
let LOGS = [];

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();

  if (TOKEN) {
    showDashboard();
    loadAll();
  }
});

function bindEvents() {
  const loginBtn = document.getElementById("loginBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const savePlanBtn = document.getElementById("savePlanBtn");
  const createUserBtn = document.getElementById("createUserBtn");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");

  if (loginBtn) loginBtn.addEventListener("click", adminLogin);
  if (refreshBtn) refreshBtn.addEventListener("click", loadAll);
  if (logoutBtn) logoutBtn.addEventListener("click", logout);
  if (savePlanBtn) savePlanBtn.addEventListener("click", savePlan);
  if (createUserBtn) createUserBtn.addEventListener("click", createUser);
  if (saveSettingsBtn) saveSettingsBtn.addEventListener("click", saveSettings);

  document.querySelectorAll(".tabBtn").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab, btn));
  });
}

function showStatus(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
}

function hideStatus(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("hidden");
}

function showDashboard() {
  document.getElementById("loginBox").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
}

function showLogin() {
  document.getElementById("loginBox").classList.remove("hidden");
  document.getElementById("dashboard").classList.add("hidden");
}

function showTab(name, btn) {
  document.querySelectorAll(".tab").forEach((x) => x.classList.add("hidden"));
  const tab = document.getElementById("tab-" + name);
  if (tab) tab.classList.remove("hidden");

  document.querySelectorAll(".tabBtn").forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
}

async function adminLogin() {
  try {
    showStatus("loginStatus", "Logging in...");

    const email = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value.trim();

    const res = await fetch(SERVER_URL + "/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!data.success) {
      showStatus("loginStatus", data.error || "Login failed");
      return;
    }

    TOKEN = data.token;
    localStorage.setItem("dc_admin_token", TOKEN);

    hideStatus("loginStatus");
    showDashboard();
    await loadAll();
  } catch (e) {
    showStatus("loginStatus", "Server error: " + e.message);
  }
}

async function loadAll() {
  try {
    showStatus("dashStatus", "Loading...");

    const res = await fetch(SERVER_URL + "/admin/users", {
      headers: { Authorization: "Bearer " + TOKEN }
    });

    const data = await res.json();

    if (!data.success) {
      showStatus("dashStatus", data.error || "Failed to load admin data");
      if (data.error === "ADMIN_LOGIN_REQUIRED") {
        localStorage.removeItem("dc_admin_token");
        TOKEN = "";
        showLogin();
      }
      return;
    }

    USERS = data.users || [];
    PLANS = data.plans || [];
    LOGS = data.logs || [];

    renderStats();
    renderUsers();
    renderPlans();
    renderLogs();
    fillPlanSelects();

    showStatus("dashStatus", "Loaded successfully");
  } catch (e) {
    showStatus("dashStatus", "Load error: " + e.message);
  }
}

function renderStats() {
  const active = USERS.filter((u) => u.active === true).length;
  const blocked = USERS.filter((u) => u.status === "blocked").length;
  const expired = USERS.length - active - blocked;

  document.getElementById("statUsers").textContent = USERS.length;
  document.getElementById("statActive").textContent = active;
  document.getElementById("statBlocked").textContent = blocked;
  document.getElementById("statExpired").textContent = expired < 0 ? 0 : expired;
}

function renderUsers() {
  const body = document.getElementById("usersBody");
  body.innerHTML = "";

  USERS.forEach((u) => {
    const plan = u.subscription?.planName || u.subscription?.planId || "-";
    const expiry = u.subscription?.expiry ? new Date(u.subscription.expiry).toLocaleString() : "-";
    const status = u.status === "blocked" ? "Blocked" : (u.active ? "Active" : "Expired");
    const cls = u.status === "blocked" ? "bad" : (u.active ? "" : "warn");

    const tr = document.createElement("tr");

    const planOptions = PLANS.map((p) => {
      const selected = (u.subscription?.planId === p.id) ? "selected" : "";
      return `<option value="${escapeHtml(p.id)}" ${selected}>${escapeHtml(p.name)}</option>`;
    }).join("");

    tr.innerHTML = `
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.name || "-")}</td>
      <td>${escapeHtml(plan)}</td>
      <td>${escapeHtml(expiry)}</td>
      <td><span class="pill ${cls}">${escapeHtml(status)}</span></td>
      <td>${escapeHtml(u.lockedIp || "-")}</td>
      <td>${escapeHtml(u.lockedDeviceId || "-")}</td>
      <td>
        <select class="userPlanSelect" data-user-id="${escapeHtml(u.id)}">${planOptions}</select>
        <button class="updatePlanBtn" data-user-id="${escapeHtml(u.id)}">Update</button>
        <button class="resetDeviceBtn" data-user-id="${escapeHtml(u.id)}">Reset IP/Device</button>
        <button class="blockUserBtn" data-user-id="${escapeHtml(u.id)}" data-block="${u.status !== "blocked"}">${u.status === "blocked" ? "Unblock" : "Block"}</button>
        <button class="deleteUserBtn" data-user-id="${escapeHtml(u.id)}">Delete</button>
      </td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".updatePlanBtn").forEach((btn) => {
    btn.addEventListener("click", () => updatePlan(btn.dataset.userId));
  });

  document.querySelectorAll(".resetDeviceBtn").forEach((btn) => {
    btn.addEventListener("click", () => resetDevice(btn.dataset.userId));
  });

  document.querySelectorAll(".blockUserBtn").forEach((btn) => {
    btn.addEventListener("click", () => blockUser(btn.dataset.userId, btn.dataset.block === "true"));
  });

  document.querySelectorAll(".deleteUserBtn").forEach((btn) => {
    btn.addEventListener("click", () => deleteUser(btn.dataset.userId));
  });
}

function renderPlans() {
  const box = document.getElementById("plansList");
  box.innerHTML = "";

  PLANS.forEach((p) => {
    const div = document.createElement("div");
    div.className = "stat";
    div.innerHTML = `
      <b>${escapeHtml(p.name)}</b>
      <p>ID: ${escapeHtml(p.id)} | Days: ${escapeHtml(String(p.days))} | Price: ₹${escapeHtml(String(p.price))} | Active: ${p.active !== false}</p>
      <button class="editPlanBtn" data-plan-id="${escapeHtml(p.id)}">Edit</button>
    `;
    box.appendChild(div);
  });

  document.querySelectorAll(".editPlanBtn").forEach((btn) => {
    btn.addEventListener("click", () => editPlan(btn.dataset.planId));
  });
}

function renderLogs() {
  const body = document.getElementById("logsBody");
  body.innerHTML = "";

  LOGS.forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(l.email || "-")}</td>
      <td>${escapeHtml(l.type || "-")}</td>
      <td>${escapeHtml(String(l.success))}</td>
      <td>${escapeHtml(l.reason || "-")}</td>
      <td>${escapeHtml(l.ip || "-")}</td>
      <td>${escapeHtml(l.deviceId || "-")}</td>
      <td>${escapeHtml(l.at ? new Date(l.at).toLocaleString() : "-")}</td>
    `;
    body.appendChild(tr);
  });
}

function fillPlanSelects() {
  const s = document.getElementById("newPlan");
  if (!s) return;

  s.innerHTML = PLANS.map((p) => {
    return `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`;
  }).join("");
}

async function api(path, body) {
  const res = await fetch(SERVER_URL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + TOKEN
    },
    body: JSON.stringify(body)
  });

  return res.json();
}

async function updatePlan(userId) {
  const select = document.querySelector(`.userPlanSelect[data-user-id="${cssEscape(userId)}"]`);
  const planId = select ? select.value : "";

  const data = await api("/admin/users/update-plan", { userId, planId });
  showStatus("dashStatus", data.success ? "Plan updated" : (data.error || "Failed"));
  await loadAll();
}

async function resetDevice(userId) {
  const data = await api("/admin/users/reset-device", { userId });
  showStatus("dashStatus", data.success ? "IP/device reset" : (data.error || "Failed"));
  await loadAll();
}

async function blockUser(userId, block) {
  const data = await api("/admin/users/block", { userId, block });
  showStatus("dashStatus", data.success ? "User updated" : (data.error || "Failed"));
  await loadAll();
}

async function deleteUser(userId) {
  const ok = confirm("Delete user?");
  if (!ok) return;

  const data = await api("/admin/users/delete", { userId });
  showStatus("dashStatus", data.success ? "User deleted" : (data.error || "Failed"));
  await loadAll();
}

async function createUser() {
  const data = await api("/admin/users/create", {
    name: document.getElementById("newName").value.trim(),
    email: document.getElementById("newEmail").value.trim(),
    password: document.getElementById("newPassword").value.trim(),
    planId: document.getElementById("newPlan").value
  });

  showStatus("dashStatus", data.success ? "User created" : (data.error || "Failed"));
  await loadAll();
}

function editPlan(id) {
  const p = PLANS.find((x) => x.id === id);
  if (!p) return;

  document.getElementById("planId").value = p.id;
  document.getElementById("planName").value = p.name;
  document.getElementById("planDays").value = p.days;
  document.getElementById("planPrice").value = p.price;

  showTab("plans", document.querySelector('[data-tab="plans"]'));
}

async function savePlan() {
  const data = await api("/admin/plans/save", {
    plan: {
      id: document.getElementById("planId").value.trim(),
      name: document.getElementById("planName").value.trim(),
      days: Number(document.getElementById("planDays").value),
      price: Number(document.getElementById("planPrice").value),
      active: true
    }
  });

  showStatus("dashStatus", data.success ? "Plan saved" : (data.error || "Failed"));
  await loadAll();
}

function saveSettings() {
  localStorage.setItem("dc_tool_settings", JSON.stringify({
    listing: document.getElementById("setListing").checked,
    image: document.getElementById("setImage").checked,
    shipping: document.getElementById("setShipping").checked,
    autofill: document.getElementById("setAutofill").checked
  }));

  showStatus("dashStatus", "Settings saved locally");
}

function logout() {
  localStorage.removeItem("dc_admin_token");
  TOKEN = "";
  location.reload();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}
