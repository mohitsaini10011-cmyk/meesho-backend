/**
 * Dyana Core Seller Suite Backend
 * Features:
 * - Email/password signup + login
 * - Subscription plans
 * - One email = one locked IP/device
 * - Admin panel APIs for users, plans, reset, block, subscription
 * - Meesho AI routes used by the Chrome extension
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let OpenAI = null;
try { OpenAI = require("openai").OpenAI; } catch (e) {}

const app = express();
const PORT = process.env.PORT || 10000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const DATA_FILE = path.join(__dirname, "dyana-core-db.json");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@dyanacore.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const openai = OpenAI && process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.set("trust proxy", true);
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

function defaultDB() {
  return {
    plans: [
      { id: "trial", name: "Free Trial", days: 3, price: 0, active: true },
      { id: "monthly", name: "Monthly", days: 30, price: 499, active: true },
      { id: "quarterly", name: "3 Months", days: 90, price: 1299, active: true },
      { id: "yearly", name: "Yearly", days: 365, price: 3999, active: true },
      { id: "lifetime", name: "Lifetime", days: 36500, price: 9999, active: true }
    ],
    users: [],
    loginLogs: []
  };
}
function readDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(defaultDB(), null, 2));
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return defaultDB();
  }
}
function writeDB(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function normEmail(email) { return String(email || "").trim().toLowerCase(); }
function nowISO() { return new Date().toISOString(); }
function clientIp(req) {
  return (req.headers["x-forwarded-for"] || req.ip || req.connection?.remoteAddress || "")
    .toString().split(",")[0].trim().replace("::ffff:", "");
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const test = crypto.pbkdf2Sync(String(password), salt, 120000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
}
function tokenSign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function tokenVerify(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
}
function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 30));
  return d.toISOString();
}
function isExpired(user) {
  if (!user?.subscription?.expiry) return true;
  return new Date(user.subscription.expiry).getTime() < Date.now();
}
function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || "",
    status: user.status || "active",
    lockedIp: user.lockedIp || "",
    lockedDeviceId: user.lockedDeviceId || "",
    subscription: user.subscription || {},
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}
function authRequired(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = tokenVerify(token);
  if (!payload?.uid) return res.status(401).json({ success: false, error: "LOGIN_REQUIRED" });
  const db = readDB();
  const user = db.users.find(u => u.id === payload.uid);
  if (!user) return res.status(401).json({ success: false, error: "USER_NOT_FOUND" });
  if (user.status === "blocked") return res.status(403).json({ success: false, error: "ACCOUNT_BLOCKED" });
  if (isExpired(user)) return res.status(402).json({ success: false, error: "SUBSCRIPTION_EXPIRED" });
  req.user = user;
  next();
}
function adminRequired(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = tokenVerify(token);
  if (payload?.role === "admin") return next();
  return res.status(401).json({ success: false, error: "ADMIN_LOGIN_REQUIRED" });
}

app.get("/", (req, res) => res.send("Dyana Core Seller Suite Backend Live"));
app.get("/health", (req, res) => res.json({ status: "ok", server: "dyana-core-seller-suite", time: nowISO() }));
app.get("/plans", (req, res) => res.json({ success: true, plans: readDB().plans.filter(p => p.active) }));

app.post("/auth/signup", (req, res) => {
  const db = readDB();
  const email = normEmail(req.body.email);
  const password = String(req.body.password || "");
  const name = String(req.body.name || "").trim();
  const deviceId = String(req.body.deviceId || "").trim();
  const ip = clientIp(req);

  if (!email || !email.includes("@")) return res.status(400).json({ success: false, error: "Valid email required" });
  if (password.length < 6) return res.status(400).json({ success: false, error: "Password minimum 6 characters" });
  if (db.users.some(u => u.email === email)) return res.status(409).json({ success: false, error: "Email already registered. Please login." });

  const trial = db.plans.find(p => p.id === "trial") || { days: 3, name: "Free Trial" };
  const user = {
    id: crypto.randomUUID(),
    email,
    name,
    passwordHash: hashPassword(password),
    status: "active",
    lockedIp: ip,
    lockedDeviceId: deviceId || crypto.randomUUID(),
    subscription: { planId: "trial", planName: trial.name, expiry: addDays(trial.days), paymentStatus: "trial" },
    createdAt: nowISO(),
    lastLoginAt: nowISO()
  };
  db.users.push(user);
  db.loginLogs.push({ email, ip, deviceId, type: "signup", at: nowISO(), success: true });
  writeDB(db);

  const token = tokenSign({ uid: user.id, email: user.email, role: "user", iat: Date.now() });
  res.json({ success: true, token, user: publicUser(user) });
});

app.post("/auth/login", (req, res) => {
  const db = readDB();
  const email = normEmail(req.body.email);
  const password = String(req.body.password || "");
  const deviceId = String(req.body.deviceId || "").trim();
  const ip = clientIp(req);
  const user = db.users.find(u => u.email === email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    db.loginLogs.push({ email, ip, deviceId, type: "login", at: nowISO(), success: false, reason: "bad_credentials" });
    writeDB(db);
    return res.status(401).json({ success: false, error: "Invalid email or password" });
  }
  if (user.status === "blocked") return res.status(403).json({ success: false, error: "Your account is blocked. Contact admin." });
  if (isExpired(user)) return res.status(402).json({ success: false, error: "Subscription expired. Please renew your plan." });

  if (user.lockedIp && user.lockedIp !== ip) {
    db.loginLogs.push({ email, ip, deviceId, type: "login", at: nowISO(), success: false, reason: "ip_locked", lockedIp: user.lockedIp });
    writeDB(db);
    return res.status(423).json({ success: false, error: "This email is already active on another IP. Please buy another subscription or ask admin to reset IP." });
  }
  if (user.lockedDeviceId && deviceId && user.lockedDeviceId !== deviceId) {
    db.loginLogs.push({ email, ip, deviceId, type: "login", at: nowISO(), success: false, reason: "device_locked", lockedDeviceId: user.lockedDeviceId });
    writeDB(db);
    return res.status(423).json({ success: false, error: "This email is already active on another device. Please buy another subscription or ask admin to reset device." });
  }
  user.lockedIp = user.lockedIp || ip;
  user.lockedDeviceId = user.lockedDeviceId || deviceId;
  user.lastLoginAt = nowISO();
  db.loginLogs.push({ email, ip, deviceId, type: "login", at: nowISO(), success: true });
  writeDB(db);

  const token = tokenSign({ uid: user.id, email: user.email, role: "user", iat: Date.now() });
  res.json({ success: true, token, user: publicUser(user) });
});

app.post("/auth/check-session", authRequired, (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
});

app.post("/validate-license", (req, res) => {
  res.json({ success: true, valid: true, plan: "email-login", remainingDays: 999, message: "Use email/password login" });
});

app.post("/admin/login", (req, res) => {
  const email = normEmail(req.body.email);
  const password = String(req.body.password || "");
  if (email === normEmail(ADMIN_EMAIL) && password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: tokenSign({ role: "admin", email, iat: Date.now() }) });
  }
  res.status(401).json({ success: false, error: "Invalid admin email/password" });
});

app.get("/admin/users", adminRequired, (req, res) => {
  const db = readDB();
  res.json({ success: true, users: db.users.map(publicUser), plans: db.plans, logs: db.loginLogs.slice(-100).reverse() });
});

app.post("/admin/users/create", adminRequired, (req, res) => {
  const db = readDB();
  const email = normEmail(req.body.email);
  const password = String(req.body.password || "123456");
  if (!email || db.users.some(u => u.email === email)) return res.status(400).json({ success: false, error: "Email missing or already exists" });
  const planId = req.body.planId || "monthly";
  const plan = db.plans.find(p => p.id === planId) || db.plans[1];
  const user = {
    id: crypto.randomUUID(), email, name: req.body.name || "", passwordHash: hashPassword(password),
    status: "active", lockedIp: "", lockedDeviceId: "",
    subscription: { planId: plan.id, planName: plan.name, expiry: addDays(plan.days), paymentStatus: "paid" },
    createdAt: nowISO(), lastLoginAt: ""
  };
  db.users.push(user); writeDB(db);
  res.json({ success: true, user: publicUser(user) });
});

app.post("/admin/users/update-plan", adminRequired, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.body.userId || u.email === normEmail(req.body.email));
  const plan = db.plans.find(p => p.id === req.body.planId);
  if (!user || !plan) return res.status(404).json({ success: false, error: "User or plan not found" });
  user.subscription = { planId: plan.id, planName: plan.name, expiry: addDays(req.body.days || plan.days), paymentStatus: req.body.paymentStatus || "paid" };
  writeDB(db);
  res.json({ success: true, user: publicUser(user) });
});

app.post("/admin/users/block", adminRequired, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.body.userId || u.email === normEmail(req.body.email));
  if (!user) return res.status(404).json({ success: false, error: "User not found" });
  user.status = req.body.block ? "blocked" : "active";
  writeDB(db);
  res.json({ success: true, user: publicUser(user) });
});

app.post("/admin/users/reset-lock", adminRequired, (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.body.userId || u.email === normEmail(req.body.email));
  if (!user) return res.status(404).json({ success: false, error: "User not found" });
  user.lockedIp = "";
  user.lockedDeviceId = "";
  writeDB(db);
  res.json({ success: true, user: publicUser(user) });
});

app.post("/admin/users/delete", adminRequired, (req, res) => {
  const db = readDB();
  db.users = db.users.filter(u => !(u.id === req.body.userId || u.email === normEmail(req.body.email)));
  writeDB(db);
  res.json({ success: true });
});

app.post("/admin/plans/save", adminRequired, (req, res) => {
  const db = readDB();
  const p = req.body.plan || {};
  if (!p.id || !p.name) return res.status(400).json({ success: false, error: "Plan id/name required" });
  const existing = db.plans.find(x => x.id === p.id);
  if (existing) Object.assign(existing, p);
  else db.plans.push({ id: p.id, name: p.name, days: Number(p.days || 30), price: Number(p.price || 0), active: p.active !== false });
  writeDB(db);
  res.json({ success: true, plans: db.plans });
});

// Protect paid tool routes with active subscription
app.use(["/generate", "/generate-from-form", "/generate-from-text", "/shipping-optimize"], authRequired);

app.post("/generate", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No image uploaded" });
    let result = "Women's fashion product. Generate a Meesho-ready title, color, fabric, SKU, price, GST, HSN, weight, packaging size and SEO description.";
    if (openai) {
      const base64 = req.file.buffer.toString("base64");
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Analyze this product image for a Meesho seller. Return concise product details: category, color, fabric, style, title, description, suggested price, weight and dimensions." },
            { type: "image_url", image_url: { url: `data:${req.file.mimetype};base64,${base64}` } }
          ]
        }],
        max_tokens: 700
      });
      result = response.choices?.[0]?.message?.content || result;
    }
    res.json({ success: true, result });
  } catch (e) {
    res.json({ success: true, result: "Dyana Core fashion product. Premium quality, stylish, comfortable and suitable for casual/festive wear." });
  }
});

app.post("/generate-from-form", (req, res) => {
  try { res.json({ success: true, fields: buildFields(req.body.description || "", req.body.formFields || []) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/generate-from-text", (req, res) => {
  try { res.json({ success: true, fields: buildFields(req.body.description || "", req.body.formFields || []) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post("/shipping-optimize", (req, res) => {
  const type = String(req.body.productType || "fashion").toLowerCase();
  const map = {
    saree: { weight: 550, length: 28, breadth: 24, height: 5 },
    kurti: { weight: 320, length: 28, breadth: 22, height: 4 },
    dress: { weight: 420, length: 30, breadth: 24, height: 5 },
    footwear: { weight: 750, length: 32, breadth: 20, height: 11 },
    bag: { weight: 650, length: 34, breadth: 25, height: 9 },
    innerwear: { weight: 180, length: 22, breadth: 18, height: 3 }
  };
  const s = map[type] || { weight: 450, length: 28, breadth: 22, height: 5 };
  res.json({ success: true, suggestion: s, warning: "Use actual packed product measurement. Wrong weight/dimension can cause penalty." });
});

function buildFields(description) {
  const price = extractPrice(description) || "299";
  const title = makeTitle(description);
  return [
    f("product_name", title),
    f("description", makeDescription(description)),
    f("brand", "Dyana Core"),
    f("color", extractColor(description)),
    f("meesho_price", price),
    f("product_mrp", String(Number(price) + 300)),
    f("inventory", "100"),
    f("supplier_gst_percent", "5"),
    f("hsn_code", "6204"),
    f("product_weight_in_gms", suggestWeight(description)),
    f("country_of_origin", "India"),
    f("manufacturer_name", "Dyana Core"),
    f("packer_name", "Dyana Core"),
    f("packaging_length", "28"),
    f("packaging_breadth", "22"),
    f("packaging_height", "4"),
    f("packaging_unit", "cm")
  ];
}
function f(key, value) { return { key, label: key, value: value || "" }; }
function makeTitle(text = "") {
  const clean = String(text).replace(/\s+/g, " ").replace(/Meesho price.*$/i, "").trim();
  return (clean.split(".")[0].slice(0, 75).trim()) || "Dyana Core Women's Fashion Product";
}
function makeDescription(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim() || "Premium women's fashion product by Dyana Core. Comfortable, stylish and suitable for daily wear, festive wear and casual occasions.";
}
function extractPrice(text = "") {
  const m = String(text).match(/₹\s?(\d+)|price[:\s₹]*(\d+)/i);
  return m ? String(m[1] || m[2]) : "";
}
function extractColor(text = "") {
  const colors = ["red","blue","black","white","pink","green","yellow","grey","gray","purple","maroon","orange","beige","brown","sky blue","dark blue"];
  const lower = String(text).toLowerCase();
  const found = colors.find(c => lower.includes(c));
  return found ? found.replace(/\b\w/g, ch => ch.toUpperCase()) : "";
}
function suggestWeight(text = "") {
  const lower = String(text).toLowerCase();
  if (lower.includes("saree")) return "550";
  if (lower.includes("kurti")) return "320";
  if (lower.includes("dress")) return "420";
  if (lower.includes("footwear") || lower.includes("shoe") || lower.includes("sandal")) return "750";
  if (lower.includes("bag")) return "650";
  if (lower.includes("innerwear")) return "180";
  return "450";
}

app.listen(PORT, () => console.log(`Dyana Core Seller Suite Backend running on port ${PORT}`));
