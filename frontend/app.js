const state = {
  objects: [],
  documents: [],
  selectedObjectId: null,
  view: "dashboard"
};

const objectPositions = {
  "mainz-kaiserstrasse-15": { x: 28, y: 62 },
  "wiesbaden-schillerplatz-4": { x: 35, y: 38 },
  "frankfurt-berger-strasse-120": { x: 56, y: 34 },
  "bad-homburg-louisenstrasse-8": { x: 62, y: 22 },
  "offenbach-kaiserstrasse-100": { x: 66, y: 45 },
  "darmstadt-rheinstrasse-42": { x: 58, y: 72 },
  "hamburg-pamirweg-1-14": { x: 78, y: 26 }
};

const formatMoney = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
});

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  await loadObjects();
  await loadDocuments();
  render();
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.getElementById("refreshButton").addEventListener("click", loadAndRender);
  document.getElementById("uploadButton").addEventListener("click", uploadPdfs);
  document.getElementById("analyzeButton").addEventListener("click", analyzeDocuments);
  document.getElementById("objectFilter").addEventListener("change", (event) => {
    state.selectedObjectId = event.target.value === "all" ? null : event.target.value;
    render();
  });
}

async function loadAndRender() {
  await loadDocuments();
  render();
}

async function loadObjects() {
  const response = await fetch("/api/objects");
  const data = await response.json();
  state.objects = data.objects || [];
}

async function loadDocuments() {
  const response = await fetch("/api/documents");
  const data = await response.json();
  state.documents = data.documents || [];
}

async function uploadPdfs() {
  const input = document.getElementById("pdfUpload");
  const status = document.getElementById("uploadStatus");
  const files = Array.from(input.files || []);

  if (files.length === 0) {
    status.textContent = "Bitte zuerst PDF-Dateien auswählen.";
    return;
  }

  const formData = new FormData();
  files.forEach((file) => formData.append("pdfs", file));

  status.textContent = "Upload läuft...";
  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });
  const data = await response.json();

  if (!response.ok) {
    status.textContent = data.message || "Upload fehlgeschlagen.";
    return;
  }

  status.textContent = `${data.files.length} PDF-Datei(en) hochgeladen.`;
  input.value = "";
}

async function analyzeDocuments() {
  const button = document.getElementById("analyzeButton");
  button.disabled = true;
  button.textContent = "Analyse läuft...";

  try {
    const response = await fetch("/api/analyze-documents", { method: "POST" });
    const data = await response.json();
    state.documents = data.documents || [];
    render();
  } finally {
    button.disabled = false;
    button.textContent = "Dokumente analysieren";
  }
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}View`);
  });
}

function render() {
  renderObjectFilter();
  renderKpis();
  renderMap();
  renderRecentDocuments();
  renderObjectCards();
  renderObjectDetail();
  renderDocumentsTable();
  renderUnassignedDocuments();
}

function renderObjectFilter() {
  const filter = document.getElementById("objectFilter");
  if (filter.options.length > 1) return;

  state.objects.forEach((object) => {
    const option = document.createElement("option");
    option.value = object.id;
    option.textContent = object.name;
    filter.append(option);
  });
}

function renderKpis() {
  const documents = filteredDocuments();
  const gross = sum(documents, "gross");
  const review = documents.filter((doc) => doc.status === "Prüfung erforderlich").length;

  document.getElementById("kpiObjects").textContent = state.objects.length;
  document.getElementById("kpiDocuments").textContent = documents.length;
  document.getElementById("kpiGross").textContent = formatMoney.format(gross);
  document.getElementById("kpiReview").textContent = review;
  document.getElementById("sidebarTotal").textContent = formatMoney.format(gross);
  document.getElementById("sidebarDocs").textContent = `${documents.length} Dokumente`;
}

function renderMap() {
  const map = document.getElementById("mapMock");
  map.innerHTML = "";

  state.objects.forEach((object) => {
    const position = objectPositions[object.id] || { x: 50, y: 50 };
    const docs = state.documents.filter((doc) => doc.objectId === object.id);
    const pin = document.createElement("button");
    pin.className = "map-pin";
    pin.style.left = `${position.x}%`;
    pin.style.top = `${position.y}%`;
    pin.textContent = docs.length || 0;
    pin.title = object.name;
    pin.addEventListener("click", () => selectObject(object.id));

    const label = document.createElement("div");
    label.className = "map-label";
    label.style.left = `${position.x}%`;
    label.style.top = `${position.y}%`;
    label.textContent = object.name.split(",")[0];

    map.append(pin, label);
  });
}

function renderRecentDocuments() {
  const container = document.getElementById("recentDocuments");
  const documents = filteredDocuments().slice(0, 5);
  container.innerHTML = documents.length
    ? documents.map(documentRow).join("")
    : emptyState("Noch keine Dokumente analysiert.");
}

function renderObjectCards() {
  const container = document.getElementById("objectCards");
  container.innerHTML = state.objects
    .map((object) => {
      const docs = state.documents.filter((doc) => doc.objectId === object.id);
      const gross = sum(docs, "gross");
      return `
        <button class="object-card" type="button" data-object-id="${object.id}">
          <strong>${object.name}</strong>
          <span>${object.address}</span>
          <p>${docs.length} Dokumente · ${formatMoney.format(gross)}</p>
        </button>
      `;
    })
    .join("");

  container.querySelectorAll("[data-object-id]").forEach((button) => {
    button.addEventListener("click", () => selectObject(button.dataset.objectId));
  });
}

function renderObjectDetail() {
  const panel = document.getElementById("objectDetail");
  const object =
    state.objects.find((entry) => entry.id === state.selectedObjectId) || state.objects[0];
  if (!object) return;

  const docs = state.documents.filter((doc) => doc.objectId === object.id);
  const net = sum(docs, "net");
  const vat = sum(docs, "vat");
  const gross = sum(docs, "gross");

  panel.classList.add("active");
  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>${object.name}</h2>
        <p>${object.address}</p>
      </div>
      <span class="status">${docs.length} Dokumente</span>
    </div>
    <div class="detail-grid">
      <div><span class="meta">Netto</span><h3>${formatMoney.format(net)}</h3></div>
      <div><span class="meta">MwSt.</span><h3>${formatMoney.format(vat)}</h3></div>
      <div><span class="meta">Brutto</span><h3>${formatMoney.format(gross)}</h3></div>
      <div><span class="meta">Prüfung offen</span><h3>${docs.filter((doc) => doc.status === "Prüfung erforderlich").length}</h3></div>
    </div>
    <h3>Dokumente & Rechnungen</h3>
    <div class="document-list">${docs.length ? docs.map(documentRow).join("") : emptyState("Noch keine Dokumente für dieses Objekt.")}</div>
  `;
}

function renderDocumentsTable() {
  const tbody = document.getElementById("documentsTable");
  const documents = filteredDocuments();

  tbody.innerHTML = documents.length
    ? documents
        .map(
          (doc) => `
        <tr>
          <td>${doc.objectName || "Nicht zugeordnet"}</td>
          <td>${doc.measure || ""}</td>
          <td>${doc.trade || ""}</td>
          <td>${formatMoney.format(doc.net || 0)}</td>
          <td>${formatMoney.format(doc.vat || 0)}</td>
          <td>${formatMoney.format(doc.gross || 0)}</td>
          <td>${doc.allocation || ""}</td>
          <td>${doc.fileName || ""}</td>
          <td><span class="status ${doc.status === "Prüfung erforderlich" ? "review" : ""}">${doc.status || ""}</span></td>
        </tr>
      `
        )
        .join("")
    : `<tr><td colspan="9">${emptyState("Keine Dokumentdaten vorhanden.")}</td></tr>`;
}

function renderUnassignedDocuments() {
  const container = document.getElementById("unassignedDocuments");
  const documents = state.documents.filter((doc) => !doc.objectId);
  container.innerHTML = documents.length
    ? documents.map(documentRow).join("")
    : emptyState("Aktuell sind alle Dokumente zugeordnet.");
}

function selectObject(objectId) {
  state.selectedObjectId = objectId;
  document.getElementById("objectFilter").value = objectId;
  setView("objects");
  render();
}

function filteredDocuments() {
  if (!state.selectedObjectId) return state.documents;
  return state.documents.filter((doc) => doc.objectId === state.selectedObjectId);
}

function documentRow(doc) {
  const statusClass = doc.status === "Prüfung erforderlich" ? "review" : "";
  return `
    <div class="document-row">
      <div>
        <strong>${doc.measure || "Dokument"}</strong>
        <div class="meta">${doc.objectName || "Nicht zugeordnet"} · ${doc.fileName || ""}</div>
      </div>
      <div>
        <strong>${formatMoney.format(doc.gross || 0)}</strong>
        <span class="status ${statusClass}">${doc.status || "Offen"}</span>
      </div>
    </div>
  `;
}

function emptyState(text) {
  return `<p class="meta">${text}</p>`;
}

function sum(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}
