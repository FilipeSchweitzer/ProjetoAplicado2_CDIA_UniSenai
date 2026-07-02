/* ============================================================
   DataMol · utilitários compartilhados (dashboard + projetos)
   Exposto em window.DM. Carregar (defer) antes de index.js e
   projetos.js.
   ============================================================ */
(function (global) {
  "use strict";

  const NULL_TOKENS = new Set(["", "nan", "null", "none", "-", "na", "undefined"]);

  // Normaliza célula: trim + tokens nulos ("nan", "-", etc.) viram "".
  function cleanValue(value) {
    if (value === undefined || value === null) return "";
    const text = String(value).trim();
    return NULL_TOKENS.has(text.toLowerCase()) ? "" : text;
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function debounce(fn, wait) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // Máquina de estados única para os dois parsers (aspas, "" escapado,
  // vírgula, CRLF). Cada linha completa vira um array de células cruas.
  function createCSVMachine(onRow) {
    let row = [];
    let value = "";
    let insideQuotes = false;

    return {
      feed(source, i) {
        const char = source[i];
        const next = source[i + 1];

        if (char === '"') {
          if (insideQuotes && next === '"') {
            value += '"';
            return i + 2;
          }
          insideQuotes = !insideQuotes;
          return i + 1;
        }

        if (char === "," && !insideQuotes) {
          row.push(value);
          value = "";
          return i + 1;
        }

        if ((char === "\n" || char === "\r") && !insideQuotes) {
          const skip = char === "\r" && next === "\n" ? 2 : 1;
          row.push(value);
          if (row.some(cell => cell.trim())) onRow(row);
          row = [];
          value = "";
          return i + skip;
        }

        value += char;
        return i + 1;
      },
      flush() {
        if (value || row.length) {
          row.push(value);
          if (row.some(cell => cell.trim())) onRow(row);
        }
      }
    };
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map(header => header.trim());
    return rows.slice(1).map((cells) => {
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = (cells[index] || "").trim();
      });
      return entry;
    });
  }

  function stripBOM(text) {
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  }

  // Parse síncrono — adequado a arquivos pequenos (uploads, usuarios.csv).
  function parseCSV(text) {
    const source = stripBOM(text);
    const rows = [];
    const machine = createCSVMachine(row => rows.push(row));
    let i = 0;
    while (i < source.length) i = machine.feed(source, i);
    machine.flush();
    return rowsToObjects(rows);
  }

  // Parse assíncrono em chunks — cede o event loop a cada ~256K chars para
  // a UI (skeleton/shimmer) não travar com CSVs grandes (o da base tem ~7MB).
  async function parseCSVAsync(text, chunkSize = 262144) {
    const source = stripBOM(text);
    const rows = [];
    const machine = createCSVMachine(row => rows.push(row));
    let i = 0;
    let nextYield = chunkSize;
    while (i < source.length) {
      i = machine.feed(source, i);
      if (i >= nextYield) {
        nextYield = i + chunkSize;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    machine.flush();
    return rowsToObjects(rows);
  }

  // Toast de confirmação: entra por translateY+opacity (<=250ms, ease-out)
  // e some sozinho em 3s. Container com aria-live para leitores de tela.
  function showToast(message) {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container";
      container.setAttribute("role", "status");
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/></svg>' +
      "<span>" + escapeHTML(message) + "</span>";
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("leaving");
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
      // Com reduced-motion a animação de saída não dispara: remove direto.
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  global.DM = { cleanValue, escapeHTML, debounce, parseCSV, parseCSVAsync, showToast };
})(window);
