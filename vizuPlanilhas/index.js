// Endereço da API Flask (criarBanco/api.py). Ajuste se rodar em outra porta/host.
const API_BASE = "http://localhost:5000";
const API_SOURCE = "__api__";

const CSV_SOURCES = {
  "../codigoPlanilhas/final_integrado_com_hmdb.csv": "final_integrado_com_hmdb.csv",
  [API_SOURCE]: "PostgreSQL (API)",
};

const ATOMIC_WEIGHTS = {
  H: 1.008,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  P: 30.974,
  S: 32.06,
  F: 18.998,
  Cl: 35.45,
  Br: 79.904,
  I: 126.904,
  Na: 22.99,
  K: 39.098,
  Mg: 24.305,
  Ca: 40.078,
  Fe: 55.845,
  Zn: 65.38,
  Cu: 63.546,
  Se: 78.971,
  Si: 28.085,
  B: 10.81,
  Li: 6.94,
  Al: 26.982
};

let molecules = [];
let selectedMoleculeId = null;

const state = {
  search: "",
  category: "",
  subcategory: "",
  formula: "",
  minWeight: "",
  maxWeight: "",
  page: 1,
  pageSize: 8,
  sourcePath: "../codigoPlanilhas/final_integrado_com_hmdb.csv"
};

const els = {
  searchInput: document.getElementById("searchInput"),
  dataSourceSelect: document.getElementById("dataSourceSelect"),
  dataSourceStatus: document.getElementById("dataSourceStatus"),
  reloadData: document.getElementById("reloadData"),
  categoryFilter: document.getElementById("categoryFilter"),
  subCategoryFilter: document.getElementById("subCategoryFilter"),
  minWeight: document.getElementById("minWeight"),
  maxWeight: document.getElementById("maxWeight"),
  formulaFilter: document.getElementById("formulaFilter"),
  applyFilters: document.getElementById("applyFilters"),
  clearFilters: document.getElementById("clearFilters"),
  exportBtn: document.getElementById("exportBtn"),
  tableBody: document.getElementById("tableBody"),
  resultCount: document.getElementById("resultCount"),
  paginationInfo: document.getElementById("paginationInfo"),
  pageNumbers: document.getElementById("pageNumbers"),
  prevPage: document.getElementById("prevPage"),
  nextPage: document.getElementById("nextPage"),
  statTotal: document.getElementById("statTotal"),
  statTotalDelta: document.getElementById("statTotalDelta"),
  statUnique: document.getElementById("statUnique"),
  statUniqueDelta: document.getElementById("statUniqueDelta"),
  statFavorites: document.getElementById("statFavorites"),
  statFavoritesDelta: document.getElementById("statFavoritesDelta"),
  statRefs: document.getElementById("statRefs"),
  statRefsDelta: document.getElementById("statRefsDelta"),
  selectedName: document.getElementById("selectedName"),
  selectedInfo: document.getElementById("selectedInfo"),
  selectedMeta: document.getElementById("selectedMeta"),
  moleculeImage: document.getElementById("moleculeImage"),
  moleculePlaceholder: document.getElementById("moleculePlaceholder"),
  pubchemLink: document.getElementById("pubchemLink"),
  themeToggle: document.getElementById("themeToggle"),
  filterQuickBtn: document.getElementById("filterQuickBtn")
};

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanValue(value) {
  const text = String(value ?? "").trim();
  if (!text || ["nan", "null", "undefined", "-"].includes(text.toLowerCase())) return "";
  return text;
}

function toNumber(value) {
  const normalized = cleanValue(value).replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = cleanValue(row[key]);
    if (value) return value;
  }
  return "";
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        value += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(value);
      if (row.some(cell => cleanValue(cell))) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value || row.length) {
    row.push(value);
    if (row.some(cell => cleanValue(cell))) rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map(header => cleanValue(header));
  return rows.slice(1).map((cells) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = cleanValue(cells[index]);
    });
    return entry;
  });
}

function calculateMolecularWeight(formula) {
  const normalized = cleanValue(formula).replace(/[+-]/g, "");
  if (!normalized) return null;

  let total = 0;
  let matched = false;
  const regex = /([A-Z][a-z]?)(\d*(?:\.\d+)?)/g;
  let match;

  while ((match = regex.exec(normalized)) !== null) {
    const [, element, rawCount] = match;
    const atomicWeight = ATOMIC_WEIGHTS[element];
    if (!atomicWeight) continue;
    const count = rawCount ? Number(rawCount) : 1;
    total += atomicWeight * count;
    matched = true;
  }

  return matched ? total : null;
}

function createMolecule(row, index) {
  const compoundId = firstValue(row, ["Compound ID", "CID", "PubChem CID", "ID"]);
  const compound = firstValue(row, ["Compound", "Feature", "Amostra"]);
  const name = firstValue(row, ["Description", "Name", "Compound Name", "IUPAC Name", "Compound"]);
  const formula = firstValue(row, ["Formula", "Molecular Formula"]);
  const source = firstValue(row, ["Info_Source", "Source", "Database"]) || "CSV";
  const smiles = firstValue(row, ["SMILES", "Canonical SMILES", "Isomeric SMILES"]);
  const inchikey = firstValue(row, ["InChIKey", "InChI Key"]);
  const iupac = firstValue(row, ["IUPAC Name", "IUPAC"]);
  const information = firstValue(row, ["Information", "Info", "Details"]);
  const score = toNumber(firstValue(row, ["Score"]));
  const fragmentationScore = toNumber(firstValue(row, ["Fragmentation Score"]));
  const isotopeSimilarity = toNumber(firstValue(row, ["Isotope Similarity"]));
  const identifications = toNumber(firstValue(row, ["Identifications"]));
  const weight = calculateMolecularWeight(formula);
  const numericCid = /^\d+$/.test(compoundId) ? compoundId : "";

  return {
    uid: `${compoundId || "CSV"}-${index}`,
    id: compoundId || `CSV-${String(index + 1).padStart(5, "0")}`,
    name: name || compoundId || `Molécula ${index + 1}`,
    formula: formula || "Sem fórmula",
    weight,
    category: source,
    subcategory: compound || "Sem amostra",
    favorite: false,
    refs: identifications ?? 0,
    score,
    fragmentationScore,
    isotopeSimilarity,
    smiles,
    inchikey,
    iupac,
    information,
    numericCid,
    raw: row
  };
}

function formatWeight(value) {
  if (!Number.isFinite(value)) return "N/D";
  return `${value.toFixed(2).replace(".", ",")} g/mol`;
}

function formatScore(value) {
  if (!Number.isFinite(value)) return "N/D";
  return value.toFixed(2).replace(".", ",");
}

function averageScore(list) {
  const scores = list.map(mol => mol.score).filter(Number.isFinite);
  if (!scores.length) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function getFilteredMolecules() {
  const search = state.search.trim().toLowerCase();

  return molecules.filter((mol) => {
    const searchable = [
      mol.name,
      mol.formula,
      mol.id,
      mol.category,
      mol.subcategory,
      mol.smiles,
      mol.inchikey,
      mol.iupac
    ].join(" ").toLowerCase();

    const matchesSearch = !search || searchable.includes(search);
    const matchesCategory = !state.category || mol.category === state.category;
    const matchesSub = !state.subcategory || mol.subcategory === state.subcategory;
    const matchesFormula = !state.formula || mol.formula.toLowerCase().includes(state.formula.trim().toLowerCase());

    const min = state.minWeight === "" ? null : Number(state.minWeight);
    const max = state.maxWeight === "" ? null : Number(state.maxWeight);

    const matchesMin = min === null || (Number.isFinite(mol.weight) && mol.weight >= min);
    const matchesMax = max === null || (Number.isFinite(mol.weight) && mol.weight <= max);

    return matchesSearch && matchesCategory && matchesSub && matchesFormula && matchesMin && matchesMax;
  });
}

function categoryBadgeClass(category) {
  const options = ["green", "blue", "purple", "cyan"];
  let hash = 0;
  for (const char of category) hash = (hash + char.charCodeAt(0)) % options.length;
  return options[hash];
}

function setOptions(select, values, placeholder) {
  const currentValue = select.value;
  const options = [`<option value="">${escapeHTML(placeholder)}</option>`];
  values.forEach((value) => {
    options.push(`<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`);
  });
  select.innerHTML = options.join("");
  select.value = values.includes(currentValue) ? currentValue : "";
}

function populateFilters() {
  const categories = [...new Set(molecules.map(mol => mol.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const subcategories = [...new Set(molecules.map(mol => mol.subcategory).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  setOptions(els.categoryFilter, categories, "Todas");
  setOptions(els.subCategoryFilter, subcategories, "Todas");
}

function renderStats() {
  const sourceName = CSV_SOURCES[state.sourcePath] || state.sourcePath;
  const uniqueFormulas = new Set(molecules.map(m => m.formula).filter(formula => formula && formula !== "Sem fórmula")).size;
  const average = averageScore(molecules);

  els.statTotal.textContent = molecules.length.toLocaleString("pt-BR");
  els.statUnique.textContent = uniqueFormulas.toLocaleString("pt-BR");
  els.statFavorites.textContent = molecules.filter(m => m.favorite).length.toLocaleString("pt-BR");
  els.statRefs.textContent = formatScore(average);

  els.statTotalDelta.textContent = sourceName;
  els.statUniqueDelta.textContent = `${molecules.filter(m => Number.isFinite(m.weight)).length.toLocaleString("pt-BR")} com peso calculado`;
  els.statFavoritesDelta.textContent = "Marcados nesta sessão";
  els.statRefsDelta.textContent = "Score médio do CSV";
}

function getPubChemImageCandidates(mol) {
  const base = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound";
  const candidates = [];

  if (mol.numericCid) {
    candidates.push(`${base}/cid/${encodeURIComponent(mol.numericCid)}/PNG?record_type=2d&image_size=large`);
  }
  if (mol.smiles) {
    candidates.push(`${base}/smiles/${encodeURIComponent(mol.smiles)}/PNG?record_type=2d&image_size=large`);
  }
  if (mol.inchikey) {
    candidates.push(`${base}/inchikey/${encodeURIComponent(mol.inchikey)}/PNG?record_type=2d&image_size=large`);
  }
  if (mol.name) {
    candidates.push(`${base}/name/${encodeURIComponent(mol.name)}/PNG?record_type=2d&image_size=large`);
  }

  return [...new Set(candidates)];
}

function getPubChemPageUrl(mol) {
  if (mol.numericCid) return `https://pubchem.ncbi.nlm.nih.gov/compound/${encodeURIComponent(mol.numericCid)}`;
  const query = mol.inchikey || mol.smiles || mol.name || mol.formula;
  return `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(query)}`;
}

function loadMoleculeImage(mol) {
  const candidates = mol ? getPubChemImageCandidates(mol) : [];
  let index = 0;

  els.moleculeImage.hidden = true;
  els.moleculeImage.removeAttribute("src");
  els.moleculePlaceholder.hidden = false;
  els.moleculePlaceholder.textContent = mol
    ? "Carregando estrutura 2D pelo PubChem..."
    : "Selecione uma molécula para carregar a estrutura 2D pelo PubChem.";

  if (!mol || !candidates.length) {
    els.moleculePlaceholder.textContent = "Esta molécula não possui identificador suficiente para buscar a imagem 2D.";
    return;
  }

  const tryNextImage = () => {
    if (index >= candidates.length) {
      els.moleculeImage.hidden = true;
      els.moleculePlaceholder.hidden = false;
      els.moleculePlaceholder.textContent = "Não foi possível localizar a estrutura 2D no PubChem para este registro.";
      return;
    }

    els.moleculeImage.hidden = true;
    els.moleculeImage.onload = () => {
      els.moleculePlaceholder.hidden = true;
      els.moleculeImage.hidden = false;
    };
    els.moleculeImage.onerror = () => {
      index++;
      tryNextImage();
    };
    els.moleculeImage.src = candidates[index];
  };

  tryNextImage();
}

function renderSelected(mol) {
  selectedMoleculeId = mol ? mol.uid : null;
  els.selectedName.textContent = mol ? mol.name : "Selecione uma molécula";
  els.selectedInfo.textContent = mol
    ? `${mol.formula} · ${formatWeight(mol.weight)} · Fonte: ${mol.category}. ${mol.information || mol.iupac || "Registro carregado diretamente do CSV."}`
    : "Clique em visualizar na tabela para ver detalhes da molécula.";
  els.selectedMeta.textContent = mol
    ? `ID: ${mol.id} · Amostra: ${mol.subcategory} · Score: ${formatScore(mol.score)} · Identificações: ${mol.refs || "N/D"}`
    : "";
  els.pubchemLink.href = mol ? getPubChemPageUrl(mol) : "https://pubchem.ncbi.nlm.nih.gov/";
  loadMoleculeImage(mol);
}

function setSelectedById(id) {
  const mol = molecules.find(m => m.uid === id);
  renderSelected(mol);
}

function renderTable() {
  const filtered = getFilteredMolecules();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));

  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;

  const start = (state.page - 1) * state.pageSize;
  const paged = filtered.slice(start, start + state.pageSize);

  els.tableBody.innerHTML = paged.length
    ? paged.map((mol) => `
      <tr>
        <td>${escapeHTML(mol.id)}</td>
        <td><strong>${escapeHTML(mol.name)}</strong><span class="row-subtitle">${escapeHTML(mol.subcategory)}</span></td>
        <td>${escapeHTML(mol.formula)}</td>
        <td>${escapeHTML(formatWeight(mol.weight))}</td>
        <td><span class="badge ${categoryBadgeClass(mol.category)}">${escapeHTML(formatScore(mol.score))}</span></td>
        <td>
          <div class="actions">
            <button class="action-btn view" data-view="${escapeHTML(mol.uid)}" title="Visualizar">👁</button>
            <button class="action-btn fav ${mol.favorite ? "active" : ""}" data-fav="${escapeHTML(mol.uid)}" title="Favoritar">★</button>
          </div>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="empty-row">Nenhum registro encontrado com os filtros atuais.</td></tr>`;

  els.resultCount.textContent = `${total.toLocaleString("pt-BR")} registros`;
  els.paginationInfo.textContent = total
    ? `Mostrando ${(start + 1).toLocaleString("pt-BR")} a ${Math.min(start + state.pageSize, total).toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} resultados`
    : "Nenhum resultado encontrado";

  renderPagination(totalPages);
  attachRowEvents();
}

function renderPagination(totalPages) {
  const pages = [];
  const maxVisible = 5;

  let start = Math.max(1, state.page - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);

  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }

  for (let i = start; i <= end; i++) {
    pages.push(`
      <button class="page-number ${i === state.page ? "active" : ""}" data-page="${i}">${i}</button>
    `);
  }

  els.pageNumbers.innerHTML = pages.join("");
  els.prevPage.disabled = state.page === 1;
  els.nextPage.disabled = state.page === totalPages;
}

function attachRowEvents() {
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => setSelectedById(btn.dataset.view));
  });

  document.querySelectorAll("[data-fav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mol = molecules.find(m => m.uid === btn.dataset.fav);
      if (!mol) return;
      mol.favorite = !mol.favorite;
      renderStats();
      renderTable();
      if (selectedMoleculeId === mol.uid) renderSelected(mol);
    });
  });
}

function applyFiltersFromInputs() {
  state.search = els.searchInput.value;
  state.category = els.categoryFilter.value;
  state.subcategory = els.subCategoryFilter.value;
  state.minWeight = els.minWeight.value;
  state.maxWeight = els.maxWeight.value;
  state.formula = els.formulaFilter.value;
  state.page = 1;
  renderTable();
}

function clearFilters() {
  els.searchInput.value = "";
  els.categoryFilter.value = "";
  els.subCategoryFilter.value = "";
  els.minWeight.value = "";
  els.maxWeight.value = "";
  els.formulaFilter.value = "";

  state.search = "";
  state.category = "";
  state.subcategory = "";
  state.minWeight = "";
  state.maxWeight = "";
  state.formula = "";
  state.page = 1;

  renderTable();
}

function exportCSV() {
  const filtered = getFilteredMolecules();
  const header = [
    "ID",
    "Nome",
    "Formula",
    "Peso Molecular Estimado",
    "Fonte",
    "Amostra",
    "Score",
    "Fragmentation Score",
    "Isotope Similarity",
    "Identifications"
  ];
  const rows = filtered.map(m => [
    m.id,
    m.name,
    m.formula,
    Number.isFinite(m.weight) ? m.weight.toFixed(2).replace(".", ",") : "",
    m.category,
    m.subcategory,
    formatScore(m.score),
    formatScore(m.fragmentationScore),
    formatScore(m.isotopeSimilarity),
    m.refs || ""
  ]);

  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "moleculas_datamol.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function setLoadingState(message) {
  els.dataSourceStatus.textContent = message;
  els.tableBody.innerHTML = `<tr><td colspan="6" class="loading-row">${escapeHTML(message)}</td></tr>`;
  els.resultCount.textContent = "Carregando...";
  els.paginationInfo.textContent = "Aguarde o carregamento do CSV";
}

async function loadCSV(path = state.sourcePath) {
  state.sourcePath = path;
  state.page = 1;
  selectedMoleculeId = null;
  setLoadingState(`Carregando ${CSV_SOURCES[path] || path}...`);

  try {
    let rows;
    if (path === API_SOURCE) {
      const response = await fetch(`${API_BASE}/api/molecules`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("Resposta inesperada da API.");
    } else {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      rows = parseCSV(text);
    }
    molecules = rows.map(createMolecule).filter(mol => mol.name || mol.formula);

    populateFilters();
    clearFilters();
    renderStats();
    renderSelected(null);
    els.dataSourceStatus.textContent = `${molecules.length.toLocaleString("pt-BR")} registros carregados de ${CSV_SOURCES[path] || path}.`;
  } catch (error) {
    molecules = [];
    renderStats();
    renderSelected(null);
    els.tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row">
          Não foi possível carregar os dados. Para o CSV, sirva o projeto por um servidor local (ex.: python -m http.server). Para a API, rode criarBanco/api.py em ${API_BASE}.
        </td>
      </tr>
    `;
    els.resultCount.textContent = "0 registros";
    els.paginationInfo.textContent = "Erro ao carregar a base";
    els.dataSourceStatus.textContent = `Erro ao carregar ${CSV_SOURCES[path] || path}: ${error.message}`;
  }
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  const dark = document.body.classList.contains("dark");
  localStorage.setItem("datamol-theme", dark ? "dark" : "light");
  els.themeToggle.textContent = dark ? "☀" : "☾";
}

function initTheme() {
  const saved = localStorage.getItem("datamol-theme");
  const dark = saved === "dark";
  document.body.classList.toggle("dark", dark);
  els.themeToggle.textContent = dark ? "☀" : "☾";
}

function bindEvents() {
  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value;
    state.page = 1;
    renderTable();
  });

  els.dataSourceSelect.addEventListener("change", () => {
    loadCSV(els.dataSourceSelect.value);
  });

  els.reloadData.addEventListener("click", () => {
    loadCSV(els.dataSourceSelect.value);
  });

  [els.categoryFilter, els.subCategoryFilter, els.minWeight, els.maxWeight, els.formulaFilter].forEach((el) => {
    el.addEventListener("change", applyFiltersFromInputs);
    el.addEventListener("keyup", (e) => {
      if (e.key === "Enter") applyFiltersFromInputs();
    });
  });

  els.applyFilters.addEventListener("click", applyFiltersFromInputs);
  els.clearFilters.addEventListener("click", clearFilters);
  els.exportBtn.addEventListener("click", exportCSV);
  els.themeToggle.addEventListener("click", toggleTheme);

  els.prevPage.addEventListener("click", () => {
    state.page--;
    renderTable();
  });

  els.nextPage.addEventListener("click", () => {
    state.page++;
    renderTable();
  });

  els.pageNumbers.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-page]");
    if (!btn) return;
    state.page = Number(btn.dataset.page);
    renderTable();
  });

  els.filterQuickBtn.addEventListener("click", () => {
    document.querySelector(".filter-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function init() {
  initTheme();
  bindEvents();
  loadCSV(state.sourcePath);
}

init();
