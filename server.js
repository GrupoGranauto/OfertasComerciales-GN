// server.js
// API: GET /api/ofertas?vin=XXXXXXXXXXXXXXXXX (17 caracteres)
// Protegido por Google Sign-In (solo @grupogranauto.mx)
// ✅ Registra uso en BigQuery: base-maestra-gn.Ofertas_Comerciales.control_usuarios

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { BigQuery } from "@google-cloud/bigquery";
import { OAuth2Client } from "google-auth-library";

const app = express();
app.use(express.json());

// =============================
// Seguridad / CSP (Google Sign-In)
// =============================
app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.tailwindcss.com",
          "https://accounts.google.com",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.tailwindcss.com",
          "https://fonts.googleapis.com",
          "https://accounts.google.com",
        ],
        imgSrc: ["'self'", "data:", "https://lh3.googleusercontent.com"],
        connectSrc: ["'self'", "https://accounts.google.com", "https://www.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        frameSrc: ["'self'", "https://accounts.google.com"],
      },
    },
  })
);

// =============================
// CORS (si sirves frontend desde el mismo server, puedes quitarlo)
// =============================
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "";
if (FRONTEND_ORIGIN) {
  app.use(
    cors({
      origin: FRONTEND_ORIGIN,
      credentials: false,
    })
  );
} else {
  app.use(cors());
}

// =============================
// Configuración desde .env (BigQuery)
// =============================
const PROJECT_ID = process.env.GOOGLE_PROJECT_ID;

// LOCAL: ruta al archivo
const KEYFILE = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// PRODUCCIÓN: JSON completo en env
const KEYJSON = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

// Dataset y tabla
const DATASET = "Ofertas_Comerciales";
const TABLE = "vin_ofertas_consolidado";
const PROJECT_TABLE = `${PROJECT_ID}.${DATASET}.${TABLE}`;

// ✅ NUEVO: tabla control usuarios
const CONTROL_TABLE = `${PROJECT_ID}.${DATASET}.control_usuarios`;
const TZ = "America/Hermosillo";

console.log("PROJECT_ID     =>", PROJECT_ID);
console.log("KEYFILE        =>", KEYFILE);
console.log("KEYJSON?       =>", !!KEYJSON);
console.log("PROJECT_TABLE  =>", PROJECT_TABLE);
console.log("CONTROL_TABLE  =>", CONTROL_TABLE);

if (!PROJECT_ID) {
  console.error("❌ Falta GOOGLE_PROJECT_ID en variables de entorno");
  process.exit(1);
}

if (!KEYFILE && !KEYJSON) {
  console.error(
    "❌ Falta alguna credencial: GOOGLE_APPLICATION_CREDENTIALS o GOOGLE_APPLICATION_CREDENTIALS_JSON"
  );
  process.exit(1);
}

// =============================
// Cliente BigQuery
// =============================
const bqConfig = { projectId: PROJECT_ID };

if (KEYJSON) {
  try {
    bqConfig.credentials = JSON.parse(KEYJSON);
  } catch (e) {
    console.error("❌ GOOGLE_APPLICATION_CREDENTIALS_JSON no es un JSON válido:", e);
    process.exit(1);
  }
} else {
  bqConfig.keyFilename = KEYFILE;
}

const bq = new BigQuery(bqConfig);

// =============================
// AUTH (Google Sign-In) — Solo dominio
// =============================
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const ALLOWED_DOMAIN = "grupogranauto.mx";
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function authRequired(req, res, next) {
  (async () => {
    try {
      const auth = req.headers.authorization || "";
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (!m) return res.status(401).json({ error: "No autenticado" });

      if (!GOOGLE_CLIENT_ID) {
        return res.status(500).json({ error: "Falta GOOGLE_CLIENT_ID en env" });
      }

      const idToken = m[1];

      const ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();

      const email = (payload?.email || "").toLowerCase();
      const emailVerified = payload?.email_verified;
      const hd = (payload?.hd || "").toLowerCase();

      if (!emailVerified) {
        return res.status(401).json({ error: "Email no verificado" });
      }

      const emailDomain = email.split("@")[1]?.toLowerCase() || "";
      if (emailDomain !== ALLOWED_DOMAIN && hd !== ALLOWED_DOMAIN) {
        return res.status(403).json({ error: "Dominio no permitido" });
      }

      // ✅ Construcción robusta del nombre
      const fullName =
        payload?.name ||
        [payload?.given_name, payload?.family_name]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        email.split("@")[0];

      req.user = {
        email,
        name: fullName,
        picture: payload?.picture || "",
      };

      next();
    } catch (e) {
      console.error("authRequired error:", e);
      return res.status(401).json({ error: "Token inválido" });
    }
  })();
}

// =============================
// ✅ NUEVO: Registrar uso en BigQuery
// =============================
// =============================
// ✅ Registrar uso en BigQuery (Hora Hermosillo)
// =============================
async function logUso({ email, name }) {
  const query = `
    INSERT INTO \`${CONTROL_TABLE}\`
    (email, nombre, uso, fecha, fecha_hora)
    VALUES (
      @email,
      @nombre,
      1,
      CURRENT_DATE(@tz),
      -- Convierte correctamente a hora de Hermosillo aunque la columna sea TIMESTAMP
      TIMESTAMP(DATETIME(CURRENT_TIMESTAMP(), @tz))
    )
  `;

  await bq.createQueryJob({
    query,
    params: {
      email: String(email || "").toLowerCase(),
      nombre: String(name || ""),
      tz: "America/Hermosillo",
    },
  });
}

// =============================
// Rutas
// =============================

// Health check
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// ✅ Auth probe: el frontend la usa para validar sesión
app.get("/api/me", authRequired, (req, res) => {
  res.json(req.user);
});

// ✅ GET /api/ofertas?vin=XXXXXXXXXXXXXXXXX (PROTEGIDO)
// ✅ Registra uso al momento de "Buscar Ofertas"
app.get("/api/ofertas", authRequired, async (req, res) => {
  try {
    const vin = (req.query.vin || "").toString().trim();
    console.log(">> /api/ofertas llamado con VIN:", vin, "by:", req.user?.email);

    // ✅ Registrar uso (si falla no bloquea la respuesta)
    // Si quieres registrar SOLO cuando el VIN sea válido, mueve este bloque
    // después de las validaciones.
    try {
      await logUso({ email: req.user?.email, nombre: req.user?.name });
    } catch (e) {
      console.error("⚠️ No se pudo registrar en control_usuarios:", e);
    }

    if (!vin) {
      return res.status(400).json({ error: "vin requerido" });
    }

    // VIN estándar: 17 caracteres, sin I, O, Q
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
      return res.status(400).json({ error: "vin inválido" });
    }

    const query = `
      SELECT
        vin,
        oferta_principal_r AS oferta_principal,
        ofertas_r          AS ofertas,
        status_cliente_principal
      FROM \`${PROJECT_TABLE}\`
      WHERE TRIM(LOWER(vin)) = TRIM(LOWER(@vin))
      LIMIT 1`;

    console.log(">> Ejecutando query sobre:", PROJECT_TABLE);

    const [job] = await bq.createQueryJob({ query, params: { vin } });
    const [rows] = await job.getQueryResults();

    console.log(">> Filas encontradas:", rows.length);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        vin,
        found: false,
        message: "No se encontraron ofertas para el VIN proporcionado.",
      });
    }

    const row = rows[0];

    // =============================
    // Normalización de datos
    // =============================
    const principalRaw = row.oferta_principal ?? row.oferta_principal_r ?? "";
    const principal = principalRaw.toString().trim();

    let ofertas = row.ofertas ?? row.ofertas_r ?? [];

    if (typeof ofertas === "string") {
      try {
        const maybeJson = JSON.parse(ofertas);
        if (Array.isArray(maybeJson)) {
          ofertas = maybeJson;
        } else {
          ofertas = ofertas
            .split(/[;,|]/)
            .map((s) => s.trim())
            .filter(Boolean);
        }
      } catch {
        ofertas = ofertas
          .split(/[;,|]/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } else if (!Array.isArray(ofertas)) {
      ofertas = [String(ofertas)].filter(Boolean);
    }

    const pcmp = principal.toLowerCase();
    const others = ofertas.filter(
      (o) => (o ?? "").toString().trim().toLowerCase() !== pcmp
    );

    const payload = {
      vin: row.vin,
      found: true,
      oferta_principal: principal || null,
      ofertas: others,
      status_cliente_principal: row.status_cliente_principal || null,
    };

    return res.json(payload);
  } catch (err) {
    console.error("❌ Error en /api/ofertas:", err);
    return res.status(500).json({ error: "Error interno", detail: String(err) });
  }
});

// =============================
// Static: frontend en /public
// =============================
app.use(express.static("public"));

// =============================
// Arranque del servidor
// =============================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
  console.log(`Auth domain allowed: @${ALLOWED_DOMAIN}`);
});
