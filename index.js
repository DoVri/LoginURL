// ==========================
// 🔥 Dynamic Express Backend with HTTPS
// ==========================

const express = require("express");
const https = require("https");
const fs = require("fs");
const bodyParser = require("body-parser");
const rateLimiter = require("express-rate-limit");
const compression = require("compression");
const path = require("path");
const axios = require("axios");

// === 🔧 Konfigurasi Cloudflare ===
const CLOUDFLARE_API_KEY = "-MVi_2gXGraqJRw-A5S_IeNkH_dmW2gbpOGTx7Qp"; // Token API Cloudflare
const CLOUDFLARE_ZONE_ID = "979cf36b97cf7d4a62dbc29f26c8ce64"; // Zone ID untuk domain privates.icu
const BASE_DOMAIN = "privates.icu"; // Domain utama untuk subdomain
const SERVER_IP = "157.245.58.207"; // IP server untuk A record

// === 🗂 File Data Server ===
const SERVERS_FILE = path.join(__dirname, "servers.json");
let servers = {};

// === Load data servers.json ===
if (fs.existsSync(SERVERS_FILE)) {
  try {
    servers = JSON.parse(fs.readFileSync(SERVERS_FILE, "utf8"));
  } catch (e) {
    console.error("❌ Gagal load servers.json:", e);
    servers = {};
  }
} else {
  servers = {};
  fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2));
}

// === Simpan data ke servers.json ===
function saveServers() {
  fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2));
}

// === Membuat aplikasi Express terlebih dahulu ===
const app = express();

// === Middleware dasar ===
app.use(express.static(path.join(__dirname, "public")));
app.use(
  compression({
    level: 5,
    threshold: 0,
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  })
);
app.set("view engine", "ejs");
app.set("trust proxy", 1);
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.url}`);
  next();
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100, headers: true }));

// ==========================
// 🔹 Fungsi Buat Subdomain CF
// ==========================
async function createSubdomainCF(name) {
  const subdomain = `${name.toLowerCase()}.${BASE_DOMAIN}`;
  const dnsRecord = {
    type: "A",
    name: subdomain,
    content: SERVER_IP,
    ttl: 120,
    proxied: true,
  };

  try {
    const res = await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
      dnsRecord,
      {
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Debug full response from Cloudflare
    console.log("Cloudflare Response:", res.status, res.data);

    if (!res.data.success) {
      throw new Error(`Cloudflare error: ${JSON.stringify(res.data.errors)}`);
    }

    return subdomain;
  } catch (err) {
    console.error("❌ Cloudflare error:", err.message);
    throw err;
  }
}

// ==========================
// 🔹 Endpoint untuk bot Telegram
// ==========================
app.post("/register", async (req, res) => {
  const { name } = req.body;  // Ganti dengan "name" sesuai yang bot kirimkan
  if (!name)
    return res.json({ success: false, error: "Nama server kosong." });

  try {
    const subdomain = await createSubdomainCF(name);

    servers[subdomain] = {
      name: name,
      created_at: new Date().toISOString(),
      ip: SERVER_IP,
    };
    saveServers();

    console.log(`✅ Server baru ditambahkan: ${name} (${subdomain})`);
    res.json({ success: true, loginUrl: `${subdomain}` }); // Update untuk `loginUrl`
  } catch (err) {
    console.error("❌ Gagal membuat server:", err.message);
    res.json({ success: false, error: err.message });
  }
});

// ==========================
// 🔹 Endpoint untuk menampilkan daftar server
// ==========================
app.get("/servers", (req, res) => {
  try {
    const serverList = Object.keys(servers).map((subdomain) => {
      return {
        name: servers[subdomain].name,
        domain: `https://${subdomain}`,
      };
    });

    res.json({ success: true, servers: serverList });
  } catch (err) {
    console.error("❌ Gagal mengambil daftar server:", err.message);
    res.json({ success: false, error: "Gagal mengambil daftar server." });
  }
});

// ==========================
// 🔹 ROUTES
// ==========================

// Favicon
app.get("/favicon.:ext", function (req, res) {
  res.sendFile(path.join(__dirname, "public", "favicon.ico"));
});

// Dashboard login (EJS)
app.all("/player/login/dashboard", function (req, res) {
  const hostname = req.hostname;
  const serverName =
    servers[hostname]?.name || hostname.split(".")[0] || "MazdaPS";

  const tData = {};
  try {
    const uData = JSON.stringify(req.body).split('"')[1].split("\\n");
    for (let i = 0; i < uData.length - 1; i++) {
      const d = uData[i].split("|");
      tData[d[0]] = d[1];
    }
  } catch (err) {
    console.log("⚠️ Parse error:", err.message);
  }

  res.render(__dirname + "/public/html/dashboard.ejs", {
    data: tData,
    serverName: serverName,
  });
});

// Validasi login → generate token
app.all("/player/growid/login/validate", (req, res) => {
  const _token = req.body._token || "";
  const growId = req.body.growId || "";
  const password = req.body.password || "";

  const token = Buffer.from(
    `_token=${_token}&growId=${growId}&password=${password}`
  ).toString("base64");

  res.send(
    JSON.stringify({
      status: "success",
      message: "Account Validated.",
      token: token,
      url: "",
      accountType: "growtopia",
      accountAge: 2,
    })
  );
});

// Check token → refresh
app.all("/player/growid/checktoken", (req, res) => {
  const { refreshToken } = req.body;
  try {
    const decoded = Buffer.from(refreshToken, "base64").toString("utf-8");
    if (
      typeof decoded !== "string" &&
      !decoded.startsWith("growId=") &&
      !decoded.includes("password=")
    )
      return res.render(__dirname + "/public/html/dashboard.ejs");

    res.json({
      status: "success",
      message: "Account Validated.",
      token: refreshToken,
      url: "",
      accountType: "growtopia",
      accountAge: 2,
    });
  } catch (error) {
    res.render(__dirname + "/public/html/dashboard.ejs");
  }
});

// Root
app.get("/", (req, res) => {
  const hostname = req.hostname;
  const serverName =
    servers[hostname]?.name || hostname.split(".")[0] || "MazdaPS";
  res.send(`Welcome to ${serverName}!`);
});

// ==========================
// 🔹 Jalankan Server HTTPS
// ==========================
const options = {
  key: fs.readFileSync("log.key"), // Ganti dengan path ke file log.key
  cert: fs.readFileSync("log.crt"), // Ganti dengan path ke file log.crt
};

https.createServer(options, app).listen(443, () => {
  console.log("✅ Express berjalan di port 443 dengan HTTPS");
});
