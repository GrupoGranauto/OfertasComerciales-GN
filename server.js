// server.js
// API: GET /api/ofertas?vin=XXXXXXXXXXXXXXXXX (17 caracteres)

import "dotenv/config";
import express from "express";
import cors from "cors";
import { BigQuery } from "@google-cloud/bigquery";

const app = express();
app.use(cors());
app.use(express.json());

// =============================
// Configuración desde .env
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

console.log("PROJECT_ID     =>", PROJECT_ID);
console.log("KEYFILE        =>", KEYFILE);
console.log("KEYJSON?       =>", !!KEYJSON);
console.log("PROJECT_TABLE  =>", PROJECT_TABLE);

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
  // Producción (Railway): el contenido del JSON en una variable
  try {
    bqConfig.credentials = JSON.parse(KEYJSON);
  } catch (e) {
    console.error("❌ GOOGLE_APPLICATION_CREDENTIALS_JSON no es un JSON válido:", e);
    process.exit(1);
  }
} else {
  // Desarrollo local: archivo físico
  bqConfig.keyFilename = KEYFILE; // ./Credentials/credencialesAI.json
}

const bq = new BigQuery(bqConfig);

// =============================
// Rutas
// =============================

// Health check
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// GET /api/ofertas?vin=XXXXXXXXXXXXXXXXX
app.get("/api/ofertas", async (req, res) => {
  try {
    const vin = (req.query.vin || "").toString().trim();
    console.log(">> /api/ofertas llamado con VIN:", vin);

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
        ofertas_r          AS ofertas
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

    // Puede venir como oferta_principal (alias) o directo como *_r
    const principalRaw =
      row.oferta_principal ??
      row.oferta_principal_r ??
      "";
    const principal = principalRaw.toString().trim();

    // Ofertas: puede venir como string, JSON, array, etc.
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

    // Regla: si alguna oferta es igual a la principal, se elimina del arreglo
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
    return res
      .status(500)
      .json({ error: "Error interno", detail: String(err) });
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
});
