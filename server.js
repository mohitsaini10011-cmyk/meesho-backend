const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@dyanacore.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// Temporary in-memory DB. Render redeploy/restart par data reset hoga.
// Real use ke liye MongoDB connect karna hoga.
const users = [];
const plans = [
  { id: "trial", name: "Free Trial", days: 3, price: 0 },
  { id: "monthly", name: "Monthly", days: 30, price: 149 },
  { id: "yearly", name: "Yearly", days: 365, price: 999 },
  { id: "lifetime", name: "Lifetime", days: 3650, price: 4999 }
];

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function makeToken(user) {
  return jwt.sign({ email: user.email, role: user.role || "user" }, JWT_SECRET, {
    expiresIn: "30d"
  });
}

function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.replace("Bearer ", "");
    if (!token) return res.status(401).json({ success: false, error: "NO_TOKEN" });

    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, error: "INVALID_TOKEN" });
  }
}

function adminAuth(req, res, next) {
  auth(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ success: false, error: "ADMIN_ONLY" });
    }
    next();
  });
}

function isActive(user) {
  return !user.blocked && user.expiry && new Date(user.expiry) > new Date();
}

app.get("/", (req, res) => {
  res.send("Dyana Core Seller Suite Backend Live");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    server: "dyana-core-seller-suite",
    port: String(PORT),
    openai_key_set: !!process.env.OPENAI_API_KEY
  });
});

app.get("/plans", (req, res) => {
  res.json({ success: true, plans });
});

app.post("/auth/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const ip = getClientIp(req);

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "EMAIL_PASSWORD_REQUIRED" });
    }

    const cleanEmail = String(email).toLowerCase().trim();

    if (users.find(u => u.email === cleanEmail)) {
      return res.status(400).json({ success: false, error: "EMAIL_ALREADY_EXISTS" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 3);

    const user = {
      id: Date.now().toString(),
      name: name || "",
      email: cleanEmail,
      passwordHash,
      role: "user",
      plan: "trial",
      expiry: expiry.toISOString(),
      lockedIp: ip,
      lockedDevice: req.body.deviceId || "",
      blocked: false,
      createdAt: new Date().toISOString()
    };

    users.push(user);

    res.json({
      success: true,
      token: makeToken(user),
      user: safeUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;
    const ip = getClientIp(req);

    const user = users.find(u => u.email === String(email || "").toLowerCase().trim());
    if (!user) return res.status(401).json({ success: false, error: "USER_NOT_FOUND" });

    const ok = await bcrypt.compare(password || "", user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: "WRONG_PASSWORD" });

    if (user.blocked) return res.status(403).json({ success: false, error: "ACCOUNT_BLOCKED" });

    if (!isActive(user)) {
      return res.status(403).json({ success: false, error: "SUBSCRIPTION_EXPIRED" });
    }

    if (user.lockedIp && user.lockedIp !== ip) {
      return res.status(403).json({
        success: false,
        error: "IP_DEVICE_LOCKED",
        message: "This email is already active on another IP/device. Buy another subscription or ask admin to reset."
      });
    }

    if (!user.lockedIp) user.lockedIp = ip;
    if (!user.lockedDevice) user.lockedDevice = deviceId || "";

    res.json({
      success: true,
      token: makeToken(user),
      user: safeUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/auth/check-session", auth, (req, res) => {
  const user = users.find(u => u.email === req.user.email);
  if (!user) return res.status(404).json({ success: false, error: "USER_NOT_FOUND" });

  res.json({
    success: true,
    active: isActive(user),
    user: safeUser(user)
  });
});

app.post("/auth/logout", auth, (req, res) => {
  res.json({ success: true });
});

app.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const admin = { email: ADMIN_EMAIL, role: "admin" };
    return res.json({
      success: true,
      token: makeToken(admin),
      admin
    });
  }

  res.status(401).json({ success: false, error: "INVALID_ADMIN_LOGIN" });
});

app.get("/admin/users", adminAuth, (req, res) => {
  res.json({ success: true, users: users.map(safeUser) });
});

app.post("/admin/users/update-plan", adminAuth, (req, res) => {
  const { email, planId, days } = req.body;
  const user = users.find(u => u.email === String(email || "").toLowerCase().trim());

  if (!user) return res.status(404).json({ success: false, error: "USER_NOT_FOUND" });

  const plan = plans.find(p => p.id === planId);
  const finalDays = Number(days || plan?.days || 30);

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + finalDays);

  user.plan = planId || "monthly";
  user.expiry = expiry.toISOString();

  res.json({ success: true, user: safeUser(user) });
});

app.post("/admin/users/block", adminAuth, (req, res) => {
  const user = users.find(u => u.email === String(req.body.email || "").toLowerCase().trim());
  if (!user) return res.status(404).json({ success: false, error: "USER_NOT_FOUND" });

  user.blocked = !!req.body.blocked;
  res.json({ success: true, user: safeUser(user) });
});

app.post("/admin/users/delete", adminAuth, (req, res) => {
  const index = users.findIndex(u => u.email === String(req.body.email || "").toLowerCase().trim());
  if (index === -1) return res.status(404).json({ success: false, error: "USER_NOT_FOUND" });

  users.splice(index, 1);
  res.json({ success: true });
});

app.post("/admin/users/reset-device", adminAuth, (req, res) => {
  const user = users.find(u => u.email === String(req.body.email || "").toLowerCase().trim());
  if (!user) return res.status(404).json({ success: false, error: "USER_NOT_FOUND" });

  user.lockedIp = "";
  user.lockedDevice = "";
  res.json({ success: true, user: safeUser(user) });
});

app.post("/validate-license", (req, res) => {
  res.json({
    valid: true,
    plan: "premium",
    remainingDays: 999
  });
});

app.post("/generate", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.json({ success: false, error: "No image uploaded" });
  }

  res.json({
    success: true,
    result:
      "Premium women's fashion product by Dyana Core. Generate Meesho-ready title, description, color, price, weight and category details."
  });
});

app.post("/generate-from-form", (req, res) => {
  const { description } = req.body;
  res.json({ success: true, fields: generateFields(description) });
});

app.post("/generate-from-text", (req, res) => {
  const { description } = req.body;
  res.json({ success: true, fields: generateFields(description) });
});

app.post("/shipping/optimize", (req, res) => {
  const { category, weight } = req.body;
  const w = Number(weight || 500);

  res.json({
    success: true,
    category: category || "fashion",
    suggestedWeight: Math.max(250, Math.min(w, 900)),
    length: 28,
    breadth: 22,
    height: 4,
    note: "Use actual packed weight and dimensions. Do not underreport package details."
  });
});

app.post("/image/optimize", upload.single("image"), (req, res) => {
  if (!req.file) return res.json({ success: false, error: "No image uploaded" });

  res.json({
    success: true,
    message: "Image optimizer placeholder active. Add Sharp/Cloudinary for real image processing.",
    output: null
  });
});

function generateFields(description = "") {
  const price = extractPrice(description) || "299";

  return [
    { key: "product_name", label: "Product Name", value: makeTitle(description) },
    { key: "description", label: "Description", value: makeDescription(description) },
    { key: "brand", label: "Brand", value: "Dyana Core" },
    { key: "color", label: "Color", value: extractColor(description) },
    { key: "meesho_price", label: "Meesho Price", value: price },
    { key: "product_mrp", label: "MRP", value: String(Number(price) + 300) },
    { key: "inventory", label: "Inventory", value: "100" },
    { key: "supplier_gst_percent", label: "GST", value: "5" },
    { key: "hsn_code", label: "HSN", value: "6204" },
    { key: "product_weight_in_gms", label: "Weight", value: "500" },
    { key: "country_of_origin", label: "Country", value: "India" },
    { key: "manufacturer_name", label: "Manufacturer", value: "Dyana Core" },
    { key: "packer_name", label: "Packer", value: "Dyana Core" }
  ];
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    expiry: user.expiry,
    lockedIp: user.lockedIp,
    lockedDevice: user.lockedDevice,
    blocked: user.blocked,
    createdAt: user.createdAt
  };
}

function makeTitle(text = "") {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return "Dyana Core Women's Fashion Product";
  return clean.split(".")[0].slice(0, 80).trim() || "Dyana Core Women's Fashion Product";
}

function makeDescription(text = "") {
  return (
    String(text).replace(/\s+/g, " ").trim() ||
    "Premium women's fashion product by Dyana Core. Stylish, comfortable and suitable for daily wear, festive wear and casual occasions."
  );
}

function extractPrice(text = "") {
  const match = String(text).match(/₹\s?(\d+)|price[:\s₹]*(\d+)/i);
  return match ? String(match[1] || match[2]) : "";
}

function extractColor(text = "") {
  const colors = ["red", "blue", "black", "white", "pink", "green", "yellow", "grey", "gray", "purple", "maroon", "orange", "beige", "brown"];
  const lower = String(text).toLowerCase();
  const found = colors.find(c => lower.includes(c));
  return found ? found.charAt(0).toUpperCase() + found.slice(1) : "";
}

app.listen(PORT, () => {
  console.log(`Dyana Core Seller Suite Backend running on ${PORT}`);
});
