const express = require("express");
const cors = require("cors");
const multer = require("multer");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.get("/", (req, res) => {
  res.send("Dyana Core Meesho AI Backend Live");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    server: "dyana-core-meesho-ai",
    time: new Date().toISOString()
  });
});

app.post("/validate-license", (req, res) => {
  res.json({
    valid: true,
    plan: "free",
    remainingDays: 999,
    message: "License accepted"
  });
});

app.post("/generate", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({
        success: false,
        error: "No image uploaded"
      });
    }

    res.json({
      success: true,
      result:
        "Women's fashion product. Create a clear Meesho listing with attractive title, product description, color, fabric, size, price, GST, HSN, inventory and product details."
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post("/generate-from-form", async (req, res) => {
  try {
    const { description, formFields } = req.body;

    const fields = [];

    const addField = (key, value) => {
      fields.push({
        key,
        label: key,
        value: value || ""
      });
    };

    addField("product_name", makeTitle(description));
    addField("description", makeDescription(description));
    addField("brand", "Dyana Core");
    addField("color", extractColor(description));
    addField("meesho_price", extractPrice(description) || "299");
    addField("product_mrp", String(Number(extractPrice(description) || 299) + 300));
    addField("inventory", "100");
    addField("supplier_gst_percent", "5");
    addField("hsn_code", "6204");
    addField("product_weight_in_gms", "500");
    addField("country_of_origin", "India");
    addField("manufacturer_name", "Dyana Core");
    addField("packer_name", "Dyana Core");

    res.json({
      success: true,
      fields
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post("/generate-from-text", async (req, res) => {
  try {
    const { description, formFields } = req.body;

    const fields = [];

    const addField = (key, value) => {
      fields.push({
        key,
        label: key,
        value: value || ""
      });
    };

    addField("product_name", makeTitle(description));
    addField("description", makeDescription(description));
    addField("brand", "Dyana Core");
    addField("color", extractColor(description));
    addField("meesho_price", extractPrice(description) || "299");
    addField("product_mrp", String(Number(extractPrice(description) || 299) + 300));
    addField("inventory", "100");
    addField("supplier_gst_percent", "5");
    addField("hsn_code", "6204");
    addField("product_weight_in_gms", "500");
    addField("country_of_origin", "India");

    res.json({
      success: true,
      fields
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

function makeTitle(text = "") {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return "Dyana Core Women's Fashion Product";

  return clean
    .split(".")[0]
    .slice(0, 80)
    .replace(/meesho price.*$/i, "")
    .trim() || "Dyana Core Women's Fashion Product";
}

function makeDescription(text = "") {
  const clean = String(text).replace(/\s+/g, " ").trim();

  return (
    clean ||
    "Premium women's fashion product by Dyana Core. Comfortable, stylish and suitable for daily wear, festive wear and casual occasions."
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

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Dyana Core Meesho AI Backend running on port ${PORT}`);
});
