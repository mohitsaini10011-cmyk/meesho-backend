const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || "dyanacore_change_this_secret";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@dyanacore.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

/**
 * TEMPORARY MEMORY DATABASE
 * Render restart/redeploy ke baad normal users reset ho sakte hain.
 * Admin auto-create har restart par ho jayega.
 */
const users = [];

const plans = [
  { id: "trial", name: "Free Trial", days: 3, price: 0 },
  { id: "monthly", name: "Monthly Access", days: 30, price: 149 },
  { id: "quarterly", name: "3 Months Access", days: 90, price: 399 },
  { id: "half_yearly", name: "6 Months Access", days: 180, price: 699 },
  { id: "yearly", name: "Yearly Access", days: 365, price: 999 },
  { id: "lifetime", name: "Lifetime Access", days: 3650, price: 4999 }
];

async function createDefaultAdmin() {
  const exists = users.find(u => u.email === ADMIN_EMAIL.toLowerCase());
  if (exists) return;

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  users.push({
    id: "admin-1",
    name: "Dyana Core Admin",
    email: ADMIN_EMAIL.toLowerCase(),
    passwordHash,
    role: "admin",
    plan: "lifetime",
    expiry: "2099-12-31T23:59:59.000Z",
    lockedIp: "",
    lockedDevice: "",
    blocked: false,
    createdAt: new Date().toISOString(),
    loginLogs: []
  });

  console.log("Default admin created:", ADMIN_EMAIL);
}

createDefaultAdmin();

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function makeToken(user) {
  return jwt.sign(
    {
      email: user.email,
      role: user.role || "user"
    },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
      ? header.replace("Bearer ", "")
      : header;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "NO_TOKEN"
      });
    }

    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: "INVALID_TOKEN"
    });
  }
}

function adminAuth(req, res, next) {
  auth(req, res, () => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "ADMIN_ONLY"
      });
    }
    next();
  });
}

function isActive(user) {
  return Boolean(
    user &&
    !user.blocked &&
    user.expiry &&
    new Date(user.expiry).getTime() > Date.now()
  );
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
    createdAt: user.createdAt,
    active: isActive(user),
    loginLogs: user.loginLogs || []
  };
}

function findUserByEmail(email) {
  return users.find(u => u.email === String(email || "").toLowerCase().trim());
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 30));
  return d.toISOString();
}

app.get("/", (req, res) => {
  res.send("Dyana Core Seller Suite Backend Live");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    server: "dyana-core-seller-suite",
    port: String(PORT),
    openai_key_set: !!process.env.OPENAI_API_KEY,
    users_count: users.length,
    admin_email: ADMIN_EMAIL
  });
});

app.get("/plans", (req, res) => {
  res.json({
    success: true,
    plans
  });
});

/* ================= AUTH APIs ================= */

app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password, deviceId } = req.body;
    const ip = getClientIp(req);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "EMAIL_PASSWORD_REQUIRED"
      });
    }

    const cleanEmail = String(email).toLowerCase().trim();

    if (findUserByEmail(cleanEmail)) {
      return res.status(400).json({
        success: false,
        error: "EMAIL_ALREADY_EXISTS"
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = {
      id: "user-" + Date.now(),
      name: name || "",
      email: cleanEmail,
      passwordHash,
      role: "user",
      plan: "trial",
      expiry: addDays(3),
      lockedIp: ip,
      lockedDevice: deviceId || "",
      blocked: false,
      createdAt: new Date().toISOString(),
      loginLogs: [
        {
          type: "signup",
          ip,
          deviceId: deviceId || "",
          time: new Date().toISOString()
        }
      ]
    };

    users.push(user);

    return res.json({
      success: true,
      token: makeToken(user),
      user: safeUser(user)
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password, deviceId } = req.body;
    const ip = getClientIp(req);

    const user = findUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "USER_NOT_FOUND"
      });
    }

    const passwordOk = await bcrypt.compare(password || "", user.passwordHash);

    if (!passwordOk) {
      return res.status(401).json({
        success: false,
        error: "WRONG_PASSWORD"
      });
    }

    if (user.blocked) {
      return res.status(403).json({
        success: false,
        error: "ACCOUNT_BLOCKED"
      });
    }

    if (!isActive(user)) {
      return res.status(403).json({
        success: false,
        error: "SUBSCRIPTION_EXPIRED",
        user: safeUser(user)
      });
    }

    /**
     * One email = one IP/device lock
     * Admin users ko lock se free rakha hai.
     */
    if (user.role !== "admin") {
      if (user.lockedIp && user.lockedIp !== ip) {
        return res.status(403).json({
          success: false,
          error: "IP_DEVICE_LOCKED",
          message:
            "This email is already active on another IP/device. Please buy another subscription or ask admin to reset."
        });
      }

      if (!user.lockedIp) user.lockedIp = ip;
      if (!user.lockedDevice) user.lockedDevice = deviceId || "";
    }

    user.loginLogs = user.loginLogs || [];
    user.loginLogs.unshift({
      type: "login",
      ip,
      deviceId: deviceId || "",
      time: new Date().toISOString()
    });

    user.loginLogs = user.loginLogs.slice(0, 20);

    return res.json({
      success: true,
      token: makeToken(user),
      user: safeUser(user)
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post("/auth/check-session", auth, (req, res) => {
  const user = findUserByEmail(req.user.email);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: "USER_NOT_FOUND"
    });
  }

  return res.json({
    success: true,
    active: isActive(user),
    user: safeUser(user)
  });
});

app.post("/auth/logout", auth, (req, res) => {
  return res.json({
    success: true,
    message: "Logged out"
  });
});

/* ================= ADMIN APIs ================= */

app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const cleanEmail = String(email || "").toLowerCase().trim();

    if (cleanEmail === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
      const adminUser = findUserByEmail(ADMIN_EMAIL);

      return res.json({
        success: true,
        token: makeToken(adminUser || { email: ADMIN_EMAIL, role: "admin" }),
        admin: safeUser(adminUser)
      });
    }

    const user = findUserByEmail(cleanEmail);

    if (!user || user.role !== "admin") {
      return res.status(401).json({
        success: false,
        error: "INVALID_ADMIN_LOGIN"
      });
    }

    const ok = await bcrypt.compare(password || "", user.passwordHash);

    if (!ok) {
      return res.status(401).json({
        success: false,
        error: "INVALID_ADMIN_LOGIN"
      });
    }

    return res.json({
      success: true,
      token: makeToken(user),
      admin: safeUser(user)
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get("/admin/users", adminAuth, (req, res) => {
  return res.json({
    success: true,
    users: users.map(safeUser)
  });
});

app.post("/admin/users/update-plan", adminAuth, (req, res) => {
  const { email, planId, days } = req.body;
  const user = findUserByEmail(email);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: "USER_NOT_FOUND"
    });
  }

  const plan = plans.find(p => p.id === planId);
  const finalDays = Number(days || plan?.days || 30);

  user.plan = planId || "monthly";
  user.expiry = addDays(finalDays);
  user.blocked = false;

  return res.json({
    success: true,
    user: safeUser(user)
  });
});

app.post("/admin/users/block", adminAuth, (req, res) => {
  const { email, blocked } = req.body;
  const user = findUserByEmail(email);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: "USER_NOT_FOUND"
    });
  }

  user.blocked = Boolean(blocked);

  return res.json({
    success: true,
    user: safeUser(user)
  });
});

app.post("/admin/users/delete", adminAuth, (req, res) => {
  const { email } = req.body;
  const index = users.findIndex(
    u => u.email === String(email || "").toLowerCase().trim()
  );

  if (index === -1) {
    return res.status(404).json({
      success: false,
      error: "USER_NOT_FOUND"
    });
  }

  users.splice(index, 1);

  return res.json({
    success: true,
    message: "User deleted"
  });
});

app.post("/admin/users/reset-device", adminAuth, (req, res) => {
  const { email } = req.body;
  const user = findUserByEmail(email);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: "USER_NOT_FOUND"
    });
  }

  user.lockedIp = "";
  user.lockedDevice = "";

  return res.json({
    success: true,
    user: safeUser(user)
  });
});

/* ================= OLD LICENSE API SUPPORT ================= */

app.post("/validate-license", (req, res) => {
  return res.json({
    valid: true,
    plan: "premium",
    remainingDays: 999,
    message: "License bypass active via Dyana Core subscription system"
  });
});

/* ================= AI / LISTING APIs ================= */

app.post("/generate", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({
        success: false,
        error: "No image uploaded"
      });
    }

    return res.json({
      success: true,
      result:
        "Premium women's fashion product by Dyana Core. Generate a Meesho-ready listing with product name, description, color, fabric, price, MRP, GST, HSN, weight, inventory and package details."
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post("/generate-from-form", (req, res) => {
  try {
    const { description } = req.body;

    return res.json({
      success: true,
      fields: generateFields(description)
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post("/generate-from-text", (req, res) => {
  try {
    const { description } = req.body;

    return res.json({
      success: true,
      fields: generateFields(description)
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* ================= EXTRA TOOL APIs ================= */

app.post("/shipping/optimize", (req, res) => {
  const { category, weight } = req.body;
  const w = Number(weight || 500);

  return res.json({
    success: true,
    category: category || "fashion",
    suggestedWeight: Math.max(250, Math.min(w, 900)),
    length: 28,
    breadth: 22,
    height: 4,
    slab: Math.max(250, Math.min(w, 900)) <= 500 ? "Low" : "Medium",
    note: "Use actual packed weight and dimensions. Do not underreport package details."
  });
});

app.post("/image/optimize", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.json({
      success: false,
      error: "No image uploaded"
    });
  }

  return res.json({
    success: true,
    message:
      "Image optimizer route active. For real background removal/resize/compression, connect Sharp or Cloudinary.",
    output: null
  });
});

/* ================= HELPERS ================= */

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
    { key: "manufacturer_address", label: "Manufacturer Address", value: "India" },
    { key: "manufacturer_pincode", label: "Manufacturer Pincode", value: "247776" },
    { key: "packer_name", label: "Packer", value: "Dyana Core" },
    { key: "packer_address", label: "Packer Address", value: "India" },
    { key: "packer_pincode", label: "Packer Pincode", value: "247776" }
  ];
}

function makeTitle(text = "") {
  const clean = String(text).replace(/\s+/g, " ").trim();

  if (!clean) {
    return "Dyana Core Women's Fashion Product";
  }

  return clean
    .replace(/meesho price.*$/i, "")
    .split(".")[0]
    .slice(0, 80)
    .trim() || "Dyana Core Women's Fashion Product";
}

function makeDescription(text = "") {
  const clean = String(text).replace(/\s+/g, " ").trim();

  return (
    clean ||
    "Premium women's fashion product by Dyana Core. Stylish, comfortable and suitable for daily wear, festive wear and casual occasions."
  );
}

function extractPrice(text = "") {
  const match = String(text).match(/₹\s?(\d+)|price[:\s₹]*(\d+)/i);
  return match ? String(match[1] || match[2]) : "";
}

function extractColor(text = "") {
  const colors = [
    "red",
    "blue",
    "black",
    "white",
    "pink",
    "green",
    "yellow",
    "grey",
    "gray",
    "purple",
    "maroon",
    "orange",
    "beige",
    "brown"
  ];

  const lower = String(text).toLowerCase();
  const found = colors.find(c => lower.includes(c));

  return found ? found.charAt(0).toUpperCase() + found.slice(1) : "";
}

app.listen(PORT, () => {
  console.log(`Dyana Core Seller Suite Backend running on port ${PORT}`);
});
