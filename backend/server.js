const fs = require("fs");
const os = require("os");
const path = require("path");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");

let OpenAI = null;
try {
  OpenAI = require("openai");
} catch (_error) {
  OpenAI = null;
}

const app = express();
const PORT = Number(process.env.PORT || 4173);
const IS_VERCEL = Boolean(process.env.VERCEL);
const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const DOCUMENTS_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), "baubericht-dokumente")
  : path.join(ROOT_DIR, "Dokumente");
const DATA_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), "baubericht-data")
  : path.join(ROOT_DIR, "data");
const OUTPUT_FILE = path.join(DATA_DIR, "extracted-documents.json");

const objects = [
  {
    id: "mainz-kaiserstrasse-15",
    name: "Mainz, Kaiserstraße 15",
    address: "Kaiserstraße 15, 55116 Mainz",
    aliases: ["mainz", "kaiserstraße 15", "kaiserstrasse 15"]
  },
  {
    id: "wiesbaden-schillerplatz-4",
    name: "Wiesbaden, Schillerplatz 4",
    address: "Schillerplatz 4, 65185 Wiesbaden",
    aliases: ["wiesbaden", "schillerplatz 4"]
  },
  {
    id: "frankfurt-berger-strasse-120",
    name: "Frankfurt, Berger Straße 120",
    address: "Berger Straße 120, 60385 Frankfurt am Main",
    aliases: ["frankfurt", "berger straße 120", "berger strasse 120"]
  },
  {
    id: "bad-homburg-louisenstrasse-8",
    name: "Bad Homburg, Louisenstraße 8",
    address: "Louisenstraße 8, 61348 Bad Homburg",
    aliases: ["bad homburg", "louisenstraße 8", "louisenstrasse 8"]
  },
  {
    id: "offenbach-kaiserstrasse-100",
    name: "Offenbach, Kaiserstraße 100",
    address: "Kaiserstraße 100, 63065 Offenbach",
    aliases: ["offenbach", "kaiserstraße 100", "kaiserstrasse 100"]
  },
  {
    id: "darmstadt-rheinstrasse-42",
    name: "Darmstadt, Rheinstraße 42",
    address: "Rheinstraße 42, 64283 Darmstadt",
    aliases: ["darmstadt", "rheinstraße 42", "rheinstrasse 42"]
  },
  {
    id: "hamburg-pamirweg-1-14",
    name: "Hamburg, Pamirweg 1-14",
    address: "Pamirweg 1-14, 21129 Hamburg",
    aliases: ["hamburg", "pamirweg", "pamirweg 1", "pamirweg 14"]
  }
];

const sampleDocuments = [
  {
    fileName: "beispiel-mainz-fassade.pdf",
    objectId: "mainz-kaiserstrasse-15",
    objectName: "Mainz, Kaiserstraße 15",
    address: "Kaiserstraße 15, 55116 Mainz",
    invoiceDate: "2024-03-18",
    invoiceNumber: "RE-2024-018",
    measure: "Fassadensanierung und Putzarbeiten",
    trade: "Fassade",
    net: 37815.13,
    vat: 7184.87,
    gross: 45000,
    allocation: "GE",
    confidence: 0.92,
    status: "Automatisch erkannt",
    source: "Beispieldaten"
  },
  {
    fileName: "beispiel-wiesbaden-dach.pdf",
    objectId: "wiesbaden-schillerplatz-4",
    objectName: "Wiesbaden, Schillerplatz 4",
    address: "Schillerplatz 4, 65185 Wiesbaden",
    invoiceDate: "2024-05-07",
    invoiceNumber: "RE-2024-071",
    measure: "Dachabdichtung und Reparaturarbeiten",
    trade: "Dach",
    net: 15294.12,
    vat: 2905.88,
    gross: 18200,
    allocation: "GE",
    confidence: 0.88,
    status: "Automatisch erkannt",
    source: "Beispieldaten"
  },
  {
    fileName: "beispiel-pamirweg-elektro.pdf",
    objectId: "hamburg-pamirweg-1-14",
    objectName: "Hamburg, Pamirweg 1-14",
    address: "Pamirweg 1-14, 21129 Hamburg",
    invoiceDate: "2024-08-22",
    invoiceNumber: "RE-2024-144",
    measure: "Elektroprüfung Haus 1 bis 14",
    trade: "Elektro",
    net: 13445.38,
    vat: 2554.62,
    gross: 16000,
    allocation: "SE",
    confidence: 0.9,
    status: "Automatisch erkannt",
    source: "Beispieldaten"
  }
];

ensureProjectFolders();

const openai =
  process.env.OPENAI_API_KEY && OpenAI
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, DOCUMENTS_DIR),
  filename: (_req, file, callback) => {
    const safeName = file.originalname
      .replace(/[^\w.\- äöüÄÖÜß]/g, "_")
      .replace(/\s+/g, "_");
    callback(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      path.extname(file.originalname).toLowerCase() === ".pdf";
    callback(isPdf ? null : new Error("Nur PDF-Dateien sind erlaubt."), isPdf);
  }
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(FRONTEND_DIR));
app.use("/Dokumente", express.static(DOCUMENTS_DIR));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mode: openai ? "openai" : "mock",
    documentsDir: DOCUMENTS_DIR,
    outputFile: OUTPUT_FILE
  });
});

app.get("/api/objects", (_req, res) => {
  res.json({ objects });
});

app.get("/api/documents", (_req, res) => {
  res.json({ documents: readStoredDocuments() });
});

app.post("/api/upload", upload.array("pdfs", 30), (req, res) => {
  res.json({
    ok: true,
    files: (req.files || []).map((file) => ({
      fileName: file.filename,
      originalName: file.originalname,
      size: file.size,
      path: `/Dokumente/${encodeURIComponent(file.filename)}`
    }))
  });
});

app.post("/api/analyze-documents", async (_req, res, next) => {
  try {
    const pdfFiles = fs
      .readdirSync(DOCUMENTS_DIR)
      .filter((file) => file.toLowerCase().endsWith(".pdf"));

    if (pdfFiles.length === 0) {
      writeStoredDocuments(sampleDocuments);
      return res.json({
        ok: true,
        mode: "sample",
        documents: sampleDocuments,
        message: "Keine PDFs gefunden. Es wurden Beispieldaten geladen."
      });
    }

    const analyzed = [];
    for (const fileName of pdfFiles) {
      const filePath = path.join(DOCUMENTS_DIR, fileName);
      try {
        const buffer = fs.readFileSync(filePath);
        const parsed = await pdfParse(buffer);
        const text = parsed.text || "";
        const document = openai
          ? await analyzeWithOpenAI(text, fileName)
          : analyzeWithMock(text, fileName);
        analyzed.push(document);
      } catch (error) {
        analyzed.push({
          fileName,
          objectId: null,
          objectName: "Nicht zugeordnet",
          address: "",
          invoiceDate: "",
          invoiceNumber: "",
          measure: "PDF konnte nicht sicher ausgelesen werden",
          trade: "",
          net: 0,
          vat: 0,
          gross: 0,
          allocation: "",
          confidence: 0,
          status: "Prüfung erforderlich",
          source: "PDF",
          error: error.message
        });
      }
    }

    writeStoredDocuments(analyzed);
    res.json({
      ok: true,
      mode: openai ? "openai" : "mock",
      documents: analyzed
    });
  } catch (error) {
    next(error);
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.use((error, _req, res, _next) => {
  res.status(500).json({
    ok: false,
    message: error.message || "Unbekannter Serverfehler"
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Baubericht-Dashboard läuft auf http://127.0.0.1:${PORT}`);
    console.log(`PDF-Ordner: ${DOCUMENTS_DIR}`);
    console.log(`Analysemodus: ${openai ? "OpenAI" : "Mock/Testmodus"}`);
  });
}

module.exports = app;

function ensureProjectFolders() {
  fs.mkdirSync(FRONTEND_DIR, { recursive: true });
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const marker = path.join(DOCUMENTS_DIR, "PDFs-hier-ablegen.txt");
  if (!fs.existsSync(marker)) {
    fs.writeFileSync(
      marker,
      "Lege hier PDF-Rechnungen, Bauberichte, Angebote und weitere Dokumente ab.\n",
      "utf8"
    );
  }

  if (!fs.existsSync(OUTPUT_FILE)) {
    writeStoredDocuments(sampleDocuments);
  }
}

function readStoredDocuments() {
  try {
    const raw = fs.readFileSync(OUTPUT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : parsed.documents || [];
  } catch (_error) {
    return sampleDocuments;
  }
}

function writeStoredDocuments(documents) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(documents, null, 2), "utf8");
}

async function analyzeWithOpenAI(text, fileName) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "Du extrahierst strukturierte Rechnungs- und Bauberichtsdaten aus deutschem PDF-Text. Antworte ausschließlich als JSON."
      },
      {
        role: "user",
        content: [
          "Extrahiere diese Felder:",
          "objectName, address, invoiceDate, invoiceNumber, measure, trade, net, vat, gross, allocation, confidence.",
          "allocation ist GE, SE oder leer. confidence ist 0 bis 1.",
          "Wenn Daten fehlen, nutze leere Strings oder 0.",
          "",
          `Datei: ${fileName}`,
          "Bekannte Objekte:",
          JSON.stringify(objects, null, 2),
          "",
          "PDF-Text:",
          text.slice(0, 12000)
        ].join("\n")
      }
    ]
  });

  const raw = response.choices?.[0]?.message?.content || "{}";
  const clean = raw.replace(/```json|```/g, "").trim();
  return normalizeDocument(JSON.parse(clean), text, fileName, "OpenAI");
}

function analyzeWithMock(text, fileName) {
  const compact = text.replace(/\s+/g, " ").trim();
  const matchedObject = findObject(compact, fileName);
  const gross = findMoney(compact, [
    /brutto[:\s]*([\d.,]+)\s*€/i,
    /gesamtbetrag[:\s]*([\d.,]+)\s*€/i,
    /rechnungssumme[:\s]*([\d.,]+)\s*€/i,
    /([\d.,]+)\s*€\s*brutto/i
  ]);
  const net =
    findMoney(compact, [/netto[:\s]*([\d.,]+)\s*€/i, /([\d.,]+)\s*€\s*netto/i]) ||
    (gross ? roundCurrency(gross / 1.19) : 0);
  const vat =
    findMoney(compact, [/mwst[:\s]*([\d.,]+)\s*€/i, /ust[:\s]*([\d.,]+)\s*€/i]) ||
    (gross && net ? roundCurrency(gross - net) : 0);

  return normalizeDocument(
    {
      objectName: matchedObject?.name || "",
      address: matchedObject?.address || "",
      invoiceDate: findDate(compact),
      invoiceNumber: findInvoiceNumber(compact),
      measure: findMeasure(compact, fileName),
      trade: findTrade(compact, fileName),
      net,
      vat,
      gross: gross || roundCurrency(net + vat),
      allocation: findAllocation(compact),
      confidence: matchedObject ? 0.78 : 0.25
    },
    compact,
    fileName,
    "Mock"
  );
}

function normalizeDocument(rawDocument, text, fileName, source) {
  const matchedObject =
    findObject(rawDocument.address || "", rawDocument.objectName || "") ||
    findObject(text || "", fileName);
  const confidence = Number(rawDocument.confidence || 0);

  return {
    fileName,
    objectId: matchedObject?.id || null,
    objectName: matchedObject?.name || rawDocument.objectName || "Nicht zugeordnet",
    address: rawDocument.address || matchedObject?.address || "",
    invoiceDate: rawDocument.invoiceDate || "",
    invoiceNumber: rawDocument.invoiceNumber || "",
    measure: rawDocument.measure || "Prüfung der Maßnahme erforderlich",
    trade: rawDocument.trade || "",
    net: toNumber(rawDocument.net),
    vat: toNumber(rawDocument.vat),
    gross: toNumber(rawDocument.gross),
    allocation: String(rawDocument.allocation || "").toUpperCase(),
    confidence,
    status:
      matchedObject && confidence >= 0.65
        ? "Automatisch erkannt"
        : "Prüfung erforderlich",
    source
  };
}

function findObject(...inputs) {
  const haystack = inputs.join(" ").toLowerCase();
  return objects.find((object) =>
    [object.name, object.address, object.id, ...object.aliases].some((value) =>
      haystack.includes(value.toLowerCase())
    )
  );
}

function findMoney(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return toNumber(match[1]);
  }
  return 0;
}

function findDate(text) {
  const match = text.match(/(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})/);
  if (!match) return "";
  if (match[1].includes("-")) return match[1];
  const [day, month, year] = match[1].split(".");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function findInvoiceNumber(text) {
  const match = text.match(/(?:rechnung(?:snummer)?|re[-\s]?nr\.?)[:\s#-]*([A-Z0-9\-\/]+)/i);
  return match ? match[1] : "";
}

function findMeasure(text, fileName) {
  const lower = `${text} ${fileName}`.toLowerCase();
  if (lower.includes("fassade")) return "Fassadenarbeiten";
  if (lower.includes("dach")) return "Dacharbeiten";
  if (lower.includes("elektro")) return "Elektroarbeiten";
  if (lower.includes("heizung")) return "Heizungsarbeiten";
  if (lower.includes("sanitär") || lower.includes("sanitaer")) return "Sanitärarbeiten";
  if (lower.includes("fenster")) return "Fensterarbeiten";
  return "Prüfung der Maßnahme erforderlich";
}

function findTrade(text, fileName) {
  const lower = `${text} ${fileName}`.toLowerCase();
  const trades = ["Fassade", "Dach", "Elektro", "Heizung", "Sanitär", "Fenster", "Maler"];
  return trades.find((trade) => lower.includes(trade.toLowerCase())) || "";
}

function findAllocation(text) {
  if (/\bGE\b|gemeinschaftseigentum/i.test(text)) return "GE";
  if (/\bSE\b|sondereigentum/i.test(text)) return "SE";
  return "";
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return roundCurrency(value);
  if (!value) return 0;
  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : 0;
}

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
