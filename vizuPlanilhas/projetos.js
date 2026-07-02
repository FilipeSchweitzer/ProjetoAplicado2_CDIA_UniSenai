/* ============================================================
   DataMol · Projetos
   Persistência local (localStorage), colaboradores a partir do
   usuarios.csv, adição de moléculas do dashboard ou via upload de
   CSV (enriquecido no mesmo padrão do backend).
   OBS: provisório/client-side, igual ao login.
   ============================================================ */

const STORAGE_KEY = "datamol-projetos";
const CSV_DASHBOARD = "../codigoPlanilhas/final_integrado_com_hmdb.csv";
const USERS_CSV = "usuarios.csv";

// Colunas finais no mesmo padrão do dashboard/backend
const COLUNAS = ["Compound ID", "Description", "Natureza_Final", "Natural_Product", "Formula", "SMILES", "IUPAC Name", "Score", "Fragmentation Score", "Isotope Similarity", "Identifications", "Information", "Molecular_Uses", "ChEMBL_Type", "Max_Clinical_Phase", "Is_Human_Metabolite", "In_FooDB", "Info_Source", "m/z", "InChIKey", "HMDB_ID", "FooDB_ID"];

const SVG = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const ICON_X = `<svg ${SVG}><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const ICON_USER = `<svg ${SVG}><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.5 3-5.2 7-5.2s7 1.7 7 5.2"/></svg>`;
const ICON_MOL = `<svg ${SVG}><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="10" r="2.3"/><circle cx="10.5" cy="17" r="2.3"/><path d="M9 8 15 9.4M8.4 9.2 9.6 14.9M12.2 15.6 15.4 11.7"/></svg>`;
const ICON_TEAM = `<svg ${SVG}><circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3.1 2.5-4.7 5.5-4.7s5.5 1.6 5.5 4.7"/><path d="M16 5.3a3 3 0 0 1 0 5.7M20.5 20c0-2.4-1.3-3.9-3.3-4.5"/></svg>`;

let projetos = [];
let usuarios = [];
let dashboardRows = null;   // carregado sob demanda
let projetoAberto = null;   // id do projeto em detalhe

/* ---------------- Persistência ---------------- */
function carregarProjetos() {
  try { projetos = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { projetos = []; }
}
function salvarProjetos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projetos));
}
function novoId() {
  return "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

/* ---------------- CSV util ---------------- */
const NULL_TOKENS = new Set(["", "nan", "null", "none", "-", "na", "undefined"]);
function limpar(v) {
  if (v === undefined || v === null) return "";
  const t = String(v).trim();
  return NULL_TOKENS.has(t.toLowerCase()) ? "" : t;
}
function parseCSV(text) {
  const rows = [];
  let row = [], value = "", inQ = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '"') { if (inQ && n === '"') { value += '"'; i++; } else inQ = !inQ; continue; }
    if (c === "," && !inQ) { row.push(value); value = ""; continue; }
    if ((c === "\n" || c === "\r") && !inQ) {
      if (c === "\r" && n === "\n") i++;
      row.push(value);
      if (row.some(x => x.trim())) rows.push(row);
      row = []; value = ""; continue;
    }
    value += c;
  }
  if (value || row.length) { row.push(value); if (row.some(x => x.trim())) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(cells => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (cells[i] || "").trim(); });
    return o;
  });
}
function escapeHTML(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function primeiro(row, chaves) {
  for (const k of chaves) { if (row[k] !== undefined && limpar(row[k])) return limpar(row[k]); }
  return "";
}

/* ============================================================
   PIPELINE DE ENRIQUECIMENTO (porte do ist.ipynb para o navegador)
   ============================================================ */
function regrasLocais(name) {
  const n = String(name || "").trim();
  if (/^([a-zA-Z]{3,4}-)+[a-zA-Z]{3,4}$/.test(n)) {
    return {
      "InChIKey": "NaN", "IUPAC Name": "NaN", "SMILES": "NaN",
      "Information": "Fragmento de peptídeo identificado por sequenciamento.",
      "Molecular_Uses": "NaN", "Info_Source": "Regras Locais (Peptídeo)",
      "ChEMBL_Type": "Oligopeptide", "Natural_Product": "Yes",
      "Max_Clinical_Phase": "NaN", "Is_Human_Metabolite": "Yes",
      "HMDB_ID": "NaN", "In_FooDB": "Yes", "FooDB_ID": "NaN"
    };
  }
  return null;
}

async function pubchemSearch(name) {
  const res = { "Information": "NaN", "Molecular_Uses": "NaN", "Info_Source": "NaN", "IUPAC Name": "NaN", "SMILES": "NaN", "InChIKey": "NaN" };
  try {
    const base = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/" + encodeURIComponent(name);
    const r = await fetch(base + "/property/IUPACName,SMILES,InChIKey/JSON");
    if (r.ok) {
      const p = (await r.json()).PropertyTable.Properties[0] || {};
      res["IUPAC Name"] = p.IUPACName || "NaN";
      res["SMILES"] = p.SMILES || p.CanonicalSMILES || p.ConnectivitySMILES || "NaN";
      res["InChIKey"] = p.InChIKey || "NaN";
      const rd = await fetch(base + "/description/JSON");
      if (rd.ok) {
        const list = (((await rd.json()).InformationList) || {}).Information || [];
        const descricoes = [], usos = [];
        const kw = ["used for", "use in", "application", "treatment", "therapeutic", "industry"];
        for (const item of list) {
          if (item.Description) {
            const text = item.Description;
            if (kw.some(k => text.toLowerCase().includes(k))) usos.push(text);
            else { descricoes.push(text); res["Info_Source"] = item.DescriptionSourceName || res["Info_Source"]; }
          }
        }
        if (descricoes.length) res["Information"] = descricoes[0];
        if (usos.length) res["Molecular_Uses"] = usos.slice(0, 2).join(" | ");
      }
    }
  } catch (e) { /* CORS/rede: mantém NaN */ }
  return res;
}

async function chemblSearch(inchikey) {
  try {
    if (!inchikey || inchikey === "NaN") return {};
    const r = await fetch("https://www.ebi.ac.uk/chembl/api/data/molecule.json?molecule_structures__standard_inchi_key=" + encodeURIComponent(inchikey));
    if (r.ok) {
      const m = ((await r.json()).molecules || [])[0];
      if (m) return {
        "ChEMBL_Type": m.molecule_type || "NaN",
        "Natural_Product": m.natural_product === 1 ? "Yes" : "No",
        "Max_Clinical_Phase": (m.max_phase === null || m.max_phase === undefined) ? "NaN" : m.max_phase,
        "Is_Parent": (m.molecule_hierarchy && m.molecule_hierarchy.parent_chembl_id === m.molecule_chembl_id) ? "Yes" : "No"
      };
    }
  } catch (e) { }
  return {};
}

async function hmdbSearch(inchikey, name) {
  let q = null;
  if (inchikey && inchikey !== "NaN") q = 'inchikey:' + inchikey;
  else if (name) q = 'name:"' + name + '"';
  else return { "Is_Human_Metabolite": "No", "HMDB_ID": "NaN" };
  try {
    const r = await fetch("https://mychem.info/v1/query?fields=hmdb&q=" + encodeURIComponent(q));
    if (r.ok) {
      const d = await r.json();
      if (d.hits && d.hits.length && d.hits[0].hmdb) {
        let h = d.hits[0].hmdb; if (Array.isArray(h)) h = h[0];
        return { "Is_Human_Metabolite": "Yes", "HMDB_ID": (h && h.accession) || "Found" };
      }
    }
  } catch (e) { }
  return { "Is_Human_Metabolite": "No", "HMDB_ID": "NaN" };
}

async function foodbSearch(inchikey, name) {
  let q = null;
  if (inchikey && inchikey !== "NaN") q = 'inchikey:' + inchikey;
  else if (name) q = 'name:"' + name + '"';
  else return { "In_FooDB": "No", "FooDB_ID": "NaN" };
  try {
    const r = await fetch("https://biothings.ncats.io/foodb/query?q=" + encodeURIComponent(q));
    if (r.ok) {
      const d = await r.json();
      if (d.hits && d.hits.length) return { "In_FooDB": "Yes", "FooDB_ID": d.hits[0]._id || "Found" };
    }
  } catch (e) { }
  return { "In_FooDB": "No", "FooDB_ID": "NaN" };
}

function classificarNatureza(row) {
  const isMet = row["Is_Human_Metabolite"], nat = row["Natural_Product"];
  const info = String(row["Information"] || "").toLowerCase();
  const fase = Number(row["Max_Clinical_Phase"]);
  if (isMet === "Yes") return "Metabólito Endógeno (HMDB)";
  if (nat === "Yes") return "Produto Natural";
  if (info.includes("metabolite") && isMet !== "Yes") return "Metabólito (Não-humano / Geral)";
  if (Number.isFinite(fase) && fase === 4) return "Fármaco Sintético Aprovado";
  if (Number.isFinite(fase) && fase > 0) return "Sintético em Investigação (Fase " + Math.trunc(fase) + ")";
  return "Sintético / Indefinido";
}

// Enriquece uma linha base (que já traz Description e possíveis colunas originais)
async function enriquecerMolecula(base) {
  const nome = base["Description"] || base["Compound"] || "";
  const local = regrasLocais(nome);
  let merged;
  if (local) {
    merged = Object.assign({}, base, local);
  } else {
    const pc = await pubchemSearch(nome);
    const inchikey = pc["InChIKey"];
    const ch = await chemblSearch(inchikey);
    const hm = await hmdbSearch(inchikey, nome);
    const fd = await foodbSearch(inchikey, nome);
    merged = Object.assign({}, base, pc, ch, hm, fd);
    await new Promise(r => setTimeout(r, 120)); // fôlego para o rate limit do PubChem
  }
  merged["Natureza_Final"] = classificarNatureza(merged);
  // Normaliza para o padrão de colunas do dashboard
  const out = {};
  COLUNAS.forEach(c => { out[c] = merged[c] !== undefined && String(merged[c]) !== "" ? merged[c] : "NaN"; });
  return out;
}

// Executa enriquecimento com concorrência limitada e callback de progresso
async function enriquecerLote(bases, onProgress) {
  const total = bases.length, resultados = new Array(total);
  let done = 0, next = 0;
  const LIMITE = 3;
  async function worker() {
    while (next < total) {
      const i = next++;
      resultados[i] = await enriquecerMolecula(bases[i]);
      done++;
      if (onProgress) onProgress(done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(LIMITE, total) }, worker));
  return resultados;
}

// Constrói a linha-base a partir de um registro do CSV enviado (mapeando colunas flexíveis)
function baseDoUpload(row) {
  return {
    "Compound ID": primeiro(row, ["Compound ID", "CID", "ID", "PubChem CID"]),
    "Description": primeiro(row, ["Description", "Compound", "Name", "Nome", "Molecule", "IUPAC Name"]),
    "Formula": primeiro(row, ["Formula", "Molecular Formula", "Fórmula"]),
    "Score": primeiro(row, ["Score"]),
    "Fragmentation Score": primeiro(row, ["Fragmentation Score"]),
    "Isotope Similarity": primeiro(row, ["Isotope Similarity"]),
    "Identifications": primeiro(row, ["Identifications"]),
    "m/z": primeiro(row, ["m/z", "mz"])
  };
}

/* ============================================================
   UI
   ============================================================ */
const el = id => document.getElementById(id);

function molId(m) { return limpar(m["Compound ID"]) || limpar(m["Description"]) || "—"; }
function molNome(m) { return limpar(m["Description"]) || limpar(m["Compound ID"]) || "Sem nome"; }

/* ---- Lista de projetos ---- */
function renderLista() {
  el("viewDetail").classList.add("hidden");
  el("viewList").classList.remove("hidden");
  projetoAberto = null;
  const grid = el("projGrid");
  el("listStatus").textContent = projetos.length
    ? projetos.length + (projetos.length === 1 ? " projeto" : " projetos")
    : "Nenhum projeto ainda. Crie o primeiro.";
  if (!projetos.length) {
    grid.innerHTML = '<div class="proj-empty">Você ainda não tem projetos.<br>Clique em <strong>“+ Novo projeto”</strong> para começar.</div>';
    return;
  }
  grid.innerHTML = projetos.map(p => `
    <article class="proj-card" data-open="${p.id}" tabindex="0" role="button" aria-label="Abrir projeto ${escapeHTML(p.titulo)}">
      <h3>${escapeHTML(p.titulo)}</h3>
      <p>${escapeHTML(p.descricao || "Sem descrição.")}</p>
      <div class="proj-meta">
        <span>${ICON_MOL} ${p.moleculas.length} molécula(s)</span>
        <span>${ICON_TEAM} ${p.colaboradores.length} colaborador(es)</span>
      </div>
    </article>
  `).join("");
  grid.querySelectorAll("[data-open]").forEach(c => {
    c.addEventListener("click", () => abrirProjeto(c.dataset.open));
    c.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirProjeto(c.dataset.open); }
    });
  });
}

/* ---- Modal novo projeto ---- */
function abrirModal() {
  el("projTitle").value = "";
  el("projDesc").value = "";
  el("collabList").innerHTML = usuarios.length
    ? usuarios.map(u => `
      <label class="collab-opt"><input type="checkbox" value="${escapeHTML(u)}"> ${escapeHTML(u)}</label>
    `).join("")
    : '<span class="muted">Nenhum usuário em usuarios.csv.</span>';
  el("collabList").querySelectorAll(".collab-opt").forEach(opt => {
    const cb = opt.querySelector("input");
    cb.addEventListener("change", () => opt.classList.toggle("checked", cb.checked));
  });
  el("modalBackdrop").classList.add("open");
}
function fecharModal() { el("modalBackdrop").classList.remove("open"); }

function salvarNovoProjeto() {
  const titulo = el("projTitle").value.trim();
  if (!titulo) { el("projTitle").focus(); return; }
  const colaboradores = [...el("collabList").querySelectorAll("input:checked")].map(c => c.value);
  projetos.unshift({
    id: novoId(), titulo,
    descricao: el("projDesc").value.trim(),
    colaboradores, moleculas: [], criadoEm: new Date().toISOString()
  });
  salvarProjetos();
  fecharModal();
  renderLista();
}

/* ---- Detalhe do projeto ---- */
function projetoAtual() { return projetos.find(p => p.id === projetoAberto); }

function abrirProjeto(id) {
  projetoAberto = id;
  const p = projetoAtual();
  if (!p) return;
  el("viewList").classList.add("hidden");
  el("viewDetail").classList.remove("hidden");
  el("detailTitle").textContent = p.titulo;
  el("detailDesc").textContent = p.descricao || "Sem descrição.";
  el("detailCollabs").innerHTML = p.colaboradores.length
    ? p.colaboradores.map(c => `<span class="chip">${ICON_USER} ${escapeHTML(c)}</span>`).join("")
    : '<span class="muted">Sem colaboradores.</span>';
  ativarAba("dashboard");
  el("molSearch").value = "";
  el("pickerResults").innerHTML = '<div class="picker-row"><small>Digite para buscar moléculas do dashboard.</small></div>';
  renderMoleculasProjeto();
  window.scrollTo(0, 0);
}

function renderMoleculasProjeto() {
  const p = projetoAtual();
  const tb = el("projMolBody");
  el("molCount").textContent = p.moleculas.length + " molécula(s)";
  tb.innerHTML = p.moleculas.length
    ? p.moleculas.map((m, i) => `
      <tr>
        <td>${escapeHTML(molId(m))}</td>
        <td><strong>${escapeHTML(molNome(m))}</strong></td>
        <td>${escapeHTML(limpar(m["Formula"]) || "—")}</td>
        <td class="num">${escapeHTML(limpar(m["Score"]) || "—")}</td>
        <td>${escapeHTML(limpar(m["Natureza_Final"]) || "—")}</td>
        <td><button class="action-btn" data-rem="${i}" title="Remover" aria-label="Remover">${ICON_X}</button></td>
      </tr>
    `).join("")
    : '<tr><td colspan="6" class="empty-row">Nenhuma molécula neste projeto ainda.</td></tr>';
  tb.querySelectorAll("[data-rem]").forEach(b =>
    b.addEventListener("click", () => {
      p.moleculas.splice(Number(b.dataset.rem), 1);
      salvarProjetos(); renderMoleculasProjeto();
    }));
}

function jaTem(p, m) {
  const id = molId(m), nome = molNome(m);
  return p.moleculas.some(x => molId(x) === id && molNome(x) === nome);
}

function adicionarMolecula(m) {
  const p = projetoAtual();
  if (!p) return;
  const norm = {}; COLUNAS.forEach(c => { norm[c] = m[c] !== undefined ? m[c] : "NaN"; });
  if (jaTem(p, norm)) return;
  p.moleculas.push(norm);
  salvarProjetos(); renderMoleculasProjeto();
}

/* ---- Abas add ---- */
function ativarAba(qual) {
  const dash = qual === "dashboard";
  el("tabDashboard").classList.toggle("active", dash);
  el("tabUpload").classList.toggle("active", !dash);
  el("paneDashboard").classList.toggle("hidden", !dash);
  el("paneUpload").classList.toggle("hidden", dash);
}

/* ---- Busca no dashboard ---- */
async function garantirDashboard() {
  if (dashboardRows) return dashboardRows;
  try {
    const r = await fetch(CSV_DASHBOARD, { cache: "no-store" });
    dashboardRows = r.ok ? parseCSV(await r.text()) : [];
  } catch { dashboardRows = []; }
  return dashboardRows;
}

async function buscarNoDashboard(termo) {
  const rows = await garantirDashboard();
  const q = termo.trim().toLowerCase();
  const box = el("pickerResults");
  if (!q) { box.innerHTML = '<div class="picker-row"><small>Digite para buscar moléculas do dashboard.</small></div>'; return; }
  const hits = rows.filter(m => {
    const s = [m["Description"], m["Formula"], m["Compound ID"], m["InChIKey"]].join(" ").toLowerCase();
    return s.includes(q);
  }).slice(0, 50);
  box.innerHTML = hits.length ? hits.map((m, i) => `
    <div class="picker-row">
      <div><span class="mol-name">${escapeHTML(molNome(m))}</span><br><small>${escapeHTML(limpar(m["Formula"]) || "—")} · ${escapeHTML(molId(m))}</small></div>
      <button class="mini-add" data-idx="${i}">Adicionar</button>
    </div>`).join("")
    : '<div class="picker-row"><small>Nenhuma molécula encontrada.</small></div>';
  box.querySelectorAll("[data-idx]").forEach(b =>
    b.addEventListener("click", () => { adicionarMolecula(hits[Number(b.dataset.idx)]); b.textContent = "Adicionada ✓"; b.disabled = true; }));
}

/* ---- Upload CSV ---- */
async function processarArquivo(file) {
  const p = projetoAtual();
  if (!p || !file) return;
  const texto = await file.text();
  const linhas = parseCSV(texto);
  if (!linhas.length) { alert("CSV vazio ou inválido."); return; }
  const bases = linhas.map(baseDoUpload).filter(b => b["Description"]);
  if (!bases.length) { alert("Não encontrei uma coluna de nome/descrição da molécula no CSV."); return; }

  el("progressWrap").classList.remove("hidden");
  el("progressFill").style.transform = "scaleX(0)";
  el("progressLabel").textContent = "Enriquecendo 0/" + bases.length + " moléculas...";

  const enriquecidas = await enriquecerLote(bases, (done, total) => {
    el("progressFill").style.transform = "scaleX(" + (done / total) + ")";
    el("progressLabel").textContent = "Enriquecendo " + done + "/" + total + " moléculas...";
  });

  let adicionadas = 0;
  enriquecidas.forEach(m => { if (!jaTem(p, m)) { p.moleculas.push(m); adicionadas++; } });
  salvarProjetos();
  renderMoleculasProjeto();
  el("progressLabel").textContent = "✓ " + adicionadas + " molécula(s) adicionada(s) ao projeto.";
  setTimeout(() => el("progressWrap").classList.add("hidden"), 4000);
}

/* ---------------- Carregar usuários ---------------- */
async function carregarUsuarios() {
  try {
    const r = await fetch(USERS_CSV, { cache: "no-store" });
    if (r.ok) usuarios = parseCSV(await r.text()).map(u => u.usuario || u.Usuario).filter(Boolean);
  } catch { usuarios = []; }
}

/* ---------------- Eventos ---------------- */
function bind() {
  el("newProjectBtn").addEventListener("click", abrirModal);
  el("modalClose").addEventListener("click", fecharModal);
  el("cancelProject").addEventListener("click", fecharModal);
  el("saveProject").addEventListener("click", salvarNovoProjeto);
  el("modalBackdrop").addEventListener("click", e => { if (e.target === el("modalBackdrop")) fecharModal(); });

  el("backBtn").addEventListener("click", renderLista);
  el("deleteProjectBtn").addEventListener("click", () => {
    if (!confirm("Excluir este projeto?")) return;
    projetos = projetos.filter(p => p.id !== projetoAberto);
    salvarProjetos(); renderLista();
  });

  el("tabDashboard").addEventListener("click", () => ativarAba("dashboard"));
  el("tabUpload").addEventListener("click", () => ativarAba("upload"));

  let t;
  el("molSearch").addEventListener("input", e => { clearTimeout(t); const v = e.target.value; t = setTimeout(() => buscarNoDashboard(v), 250); });

  const dz = el("dropzone"), fi = el("fileInput");
  dz.addEventListener("click", () => fi.click());
  fi.addEventListener("change", () => { if (fi.files[0]) processarArquivo(fi.files[0]); });
  ["dragover", "dragenter"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) processarArquivo(f); });
}

async function init() {
  carregarProjetos();
  await carregarUsuarios();
  bind();
  renderLista();
}
init();
