"use strict";

/*
 * love-budget — page logic + pure helpers.
 *
 * "Our Budget": a shared money tracker for Mena and Ammar. Income and
 * expenses with a category, a note, a date and who paid. Everything lives in
 * localStorage on this device only — no accounts, no servers, no tracking.
 *
 * All the maths is exposed on window.MenaBudget so it can be tested on its own.
 */

(function () {
  var STORE = "mena-budget";

  var CURRENCIES = [
    { code: "PKR", symbol: "\u20A8" },
    { code: "RON", symbol: "lei" },
    { code: "EUR", symbol: "\u20AC" },
    { code: "USD", symbol: "$" }
  ];

  var WHO = [
    { id: "ammar", label: "Ammar" },
    { id: "mena", label: "Mena" },
    { id: "both", label: "Both of us" }
  ];

  var DEFAULT_CATEGORIES = [
    "Food", "Pizza", "Groceries", "Travel", "Gifts", "Art supplies",
    "Data & calls", "Games", "Rent", "Savings", "Other"
  ];

  var state = { entries: [], currency: "PKR" };

  /* ---------------- small helpers ---------------- */

  function pad2(n) { return String(n).padStart(2, "0"); }

  function dayISO(date) {
    var d = date || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function asDate(iso) {
    var parts = String(iso || "").split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  function monthKey(iso) { return String(iso || "").slice(0, 7); }

  function monthLabel(key) {
    var parts = String(key || "").split("-");
    var m = Number(parts[1]) - 1;
    if (!MONTHS[m]) return String(key || "");
    return MONTHS[m] + " " + parts[0];
  }

  function pretty(iso) {
    var d = asDate(iso);
    if (isNaN(d.getTime())) return String(iso || "");
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  function currencySymbol(code) {
    for (var i = 0; i < CURRENCIES.length; i += 1) {
      if (CURRENCIES[i].code === code) return CURRENCIES[i].symbol;
    }
    return code || "";
  }

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function formatMoney(amount, code) {
    var value = round2(amount);
    var text;
    try {
      text = value.toLocaleString(undefined, {
        minimumFractionDigits: value % 1 ? 2 : 0,
        maximumFractionDigits: 2
      });
    } catch (e) {
      text = String(value);
    }
    var symbol = currencySymbol(code);
    return /^[A-Z]{3}$/.test(symbol) ? text + " " + symbol : symbol + text;
  }

  function whoLabel(id) {
    for (var i = 0; i < WHO.length; i += 1) {
      if (WHO[i].id === id) return WHO[i].label;
    }
    return "Both of us";
  }

  /* ---------------- pure maths ---------------- */

  function filterByMonth(entries, key) {
    var out = [];
    (entries || []).forEach(function (e) {
      if (e && monthKey(e.date) === key) out.push(e);
    });
    return out;
  }

  function filterByKind(entries, kind) {
    if (!kind || kind === "all") return (entries || []).slice();
    return (entries || []).filter(function (e) { return e && e.kind === kind; });
  }

  function summarize(entries) {
    var income = 0;
    var expense = 0;
    (entries || []).forEach(function (e) {
      if (!e) return;
      if (e.kind === "income") income += Number(e.amount) || 0;
      else expense += Number(e.amount) || 0;
    });
    income = round2(income);
    expense = round2(expense);
    return { income: income, expense: expense, balance: round2(income - expense) };
  }

  function byCategory(entries) {
    var map = {};
    var total = 0;
    (entries || []).forEach(function (e) {
      if (!e || e.kind !== "expense") return;
      var key = String(e.category || "").trim() || "Other";
      var amount = Number(e.amount) || 0;
      map[key] = (map[key] || 0) + amount;
      total += amount;
    });
    var rows = Object.keys(map).map(function (key) {
      var value = round2(map[key]);
      return {
        category: key,
        total: value,
        pct: total > 0 ? Math.round((map[key] / total) * 1000) / 10 : 0
      };
    });
    rows.sort(function (a, b) { return b.total - a.total; });
    return rows;
  }

  function byPerson(entries) {
    var out = { ammar: 0, mena: 0, both: 0 };
    (entries || []).forEach(function (e) {
      if (!e || e.kind !== "expense") return;
      var id = out.hasOwnProperty(e.who) ? e.who : "both";
      out[id] += Number(e.amount) || 0;
    });
    out.ammar = round2(out.ammar);
    out.mena = round2(out.mena);
    out.both = round2(out.both);
    return out;
  }

  function sortEntries(entries) {
    return (entries || []).slice().sort(function (a, b) {
      if (a.date === b.date) return (b.createdAt || 0) - (a.createdAt || 0);
      return a.date < b.date ? 1 : -1;
    });
  }

  function csvCell(value) {
    var s = String(value == null ? "" : value);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(entries, code) {
    var lines = ["date,kind,category,who,note,amount,currency"];
    sortEntries(entries).forEach(function (e) {
      lines.push([
        csvCell(e.date), csvCell(e.kind), csvCell(e.category),
        csvCell(e.who), csvCell(e.note), csvCell(round2(e.amount)), csvCell(code)
      ].join(","));
    });
    return lines.join("\n");
  }

  /* ---------------- normalisation ---------------- */

  function cleanEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    var amount = Number(raw.amount);
    if (!isFinite(amount) || amount < 0) return null;
    var date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : dayISO();
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : uid(),
      kind: raw.kind === "income" ? "income" : "expense",
      amount: round2(amount),
      category: String(raw.category || "Other").slice(0, 40),
      who: (raw.who === "ammar" || raw.who === "mena") ? raw.who : "both",
      note: String(raw.note || "").slice(0, 120),
      date: date,
      createdAt: isFinite(raw.createdAt) ? Math.floor(raw.createdAt) : Date.now()
    };
  }

  function normalizeState(raw) {
    var out = { entries: [], currency: "PKR" };
    if (raw && typeof raw === "object") {
      if (typeof raw.currency === "string") out.currency = raw.currency;
      if (Array.isArray(raw.entries)) {
        raw.entries.forEach(function (e) {
          var cleaned = cleanEntry(e);
          if (cleaned) out.entries.push(cleaned);
        });
      }
    }
    return out;
  }

  var uidCounter = 0;
  function uid() {
    uidCounter += 1;
    return "e" + Date.now().toString(36) + uidCounter.toString(36);
  }

  /* ---------------- storage ---------------- */

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORE); } catch (e) { raw = null; }
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
    var clean = normalizeState(parsed);
    state.entries = clean.entries;
    state.currency = clean.currency;
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  /* ---------------- mutations (pure-ish on state) ---------------- */

  function addEntry(fields) {
    var entry = cleanEntry(fields);
    if (!entry) return null;
    state.entries.push(entry);
    save();
    return entry;
  }

  function removeEntry(id) {
    for (var i = 0; i < state.entries.length; i += 1) {
      if (state.entries[i].id === id) {
        state.entries.splice(i, 1);
        save();
        return true;
      }
    }
    return false;
  }

  function setCurrency(code) {
    state.currency = code;
    save();
  }

  function replaceState(raw) {
    var clean = normalizeState(raw);
    state.entries = clean.entries;
    state.currency = clean.currency;
    save();
  }

  function months(entries) {
    var seen = {};
    (entries || []).forEach(function (e) {
      if (e) seen[monthKey(e.date)] = true;
    });
    var keys = Object.keys(seen).filter(function (k) { return /^\d{4}-\d{2}$/.test(k); });
    keys.sort(function (a, b) { return a < b ? 1 : -1; });
    return keys;
  }

  /* ---------------- expose the testable surface ---------------- */

  window.MenaBudget = {
    STORE: STORE,
    CURRENCIES: CURRENCIES,
    WHO: WHO,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    state: state,
    pad2: pad2,
    dayISO: dayISO,
    asDate: asDate,
    monthKey: monthKey,
    monthLabel: monthLabel,
    pretty: pretty,
    currencySymbol: currencySymbol,
    formatMoney: formatMoney,
    whoLabel: whoLabel,
    filterByMonth: filterByMonth,
    filterByKind: filterByKind,
    summarize: summarize,
    byCategory: byCategory,
    byPerson: byPerson,
    sortEntries: sortEntries,
    toCSV: toCSV,
    cleanEntry: cleanEntry,
    normalizeState: normalizeState,
    months: months,
    load: load,
    save: save,
    addEntry: addEntry,
    removeEntry: removeEntry,
    setCurrency: setCurrency,
    replaceState: replaceState
  };

  /* ---------------- DOM (browser only) ---------------- */

  var viewMonth = monthKey(dayISO());
  var viewKind = "all";

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function $(id) { return document.getElementById(id); }

  function setText(id, value) {
    var node = $(id);
    if (node) node.textContent = String(value);
  }

  function note(id, message) { setText(id, message); }

  function fillSelect(select, items) {
    if (!select) return;
    select.textContent = "";
    items.forEach(function (item) {
      var opt = el("option");
      opt.value = item.value;
      opt.textContent = item.label;
      select.appendChild(opt);
    });
  }

  function renderMonthOptions() {
    var keys = months(state.entries);
    if (keys.indexOf(viewMonth) < 0) keys.unshift(viewMonth);
    fillSelect($("month-select"), keys.map(function (k) {
      return { value: k, label: monthLabel(k) };
    }));
    var sel = $("month-select");
    if (sel) sel.value = viewMonth;
    setText("summary-month", monthLabel(viewMonth).toUpperCase());
    setText("month-label", monthLabel(viewMonth));
  }

  function renderSummary() {
    var rows = filterByMonth(state.entries, viewMonth);
    var sums = summarize(rows);
    var cur = state.currency;
    setText("sum-income", formatMoney(sums.income, cur));
    setText("sum-expense", formatMoney(sums.expense, cur));
    setText("sum-balance", formatMoney(sums.balance, cur));

    var split = byPerson(rows);
    setText("split-ammar", formatMoney(split.ammar, cur));
    setText("split-mena", formatMoney(split.mena, cur));
    setText("split-both", formatMoney(split.both, cur));

    var bars = $("category-bars");
    if (bars) {
      bars.textContent = "";
      var cats = byCategory(rows);
      if (!cats.length) {
        var empty = el("p", "bars-empty");
        empty.textContent = "No expenses this month yet.";
        bars.appendChild(empty);
      }
      cats.forEach(function (row) {
        var wrap = el("div", "bar");
        var top = el("div", "bar-top");
        var name = el("span", "bar-name");
        name.textContent = row.category;
        var val = el("span", "bar-val");
        val.textContent = formatMoney(row.total, cur) + "  \u00b7  " + row.pct + "%";
        top.appendChild(name);
        top.appendChild(val);
        var track = el("div", "bar-track");
        var fill = el("div", "bar-fill");
        fill.style.width = Math.max(row.pct, 2) + "%";
        track.appendChild(fill);
        wrap.appendChild(top);
        wrap.appendChild(track);
        bars.appendChild(wrap);
      });
    }
  }

  function renderEntries() {
    var list = $("entry-list");
    if (list) {
      list.textContent = "";
      var rows = sortEntries(filterByKind(state.entries, viewKind));
      if (!rows.length) {
        var empty = el("p", "entry-empty");
        empty.textContent = "Nothing here yet \u2014 add the first line above.";
        list.appendChild(empty);
      }
      rows.forEach(function (e) {
        var card = el("div", "entry");
        card.setAttribute("data-id", e.id);

        var head = el("div", "entry-head");
        var cat = el("span", "entry-cat");
        cat.textContent = e.category || "Other";
        var amount = el("span", "entry-amount " + e.kind);
        amount.textContent = (e.kind === "income" ? "+" : "\u2212") + formatMoney(e.amount, state.currency);
        head.appendChild(cat);
        head.appendChild(amount);
        card.appendChild(head);

        var meta = el("div", "entry-meta");
        meta.textContent = pretty(e.date) + " \u00b7 " + whoLabel(e.who);
        card.appendChild(meta);

        if (e.note) {
          var body = el("p", "entry-note-text");
          body.textContent = e.note;
          card.appendChild(body);
        }

        var rm = el("button", "entry-remove");
        rm.type = "button";
        rm.textContent = "Remove";
        rm.addEventListener("click", function () {
          removeEntry(e.id);
          renderAll();
          note("save-note", "That line is gone.");
        });
        card.appendChild(rm);

        list.appendChild(card);
      });
    }
    setText("entry-count", state.entries.length);
  }

  function renderCategoryOptions() {
    var used = {};
    state.entries.forEach(function (e) { if (e.category) used[e.category] = true; });
    var cats = DEFAULT_CATEGORIES.slice();
    Object.keys(used).forEach(function (c) {
      if (cats.indexOf(c) < 0) cats.push(c);
    });
    var dl = $("category-list");
    if (dl) {
      dl.textContent = "";
      cats.forEach(function (c) {
        var opt = el("option");
        opt.value = c;
        dl.appendChild(opt);
      });
    }
  }

  function renderCurrencies() {
    var items = CURRENCIES.map(function (c) {
      return { value: c.code, label: c.code + " " + c.symbol };
    });
    [ "entry-currency", "currency-select" ].forEach(function (id) {
      var sel = $(id);
      fillSelect(sel, items);
      if (sel) sel.value = state.currency;
    });
  }

  function renderAll() {
    renderMonthOptions();
    renderSummary();
    renderEntries();
    renderCategoryOptions();
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function wire() {
    var dateInput = $("entry-date");
    if (dateInput) dateInput.value = dayISO();

    renderCurrencies();

    var add = $("add-entry");
    if (add) add.addEventListener("click", function () {
      var amountInput = $("entry-amount");
      var amount = amountInput ? Number(amountInput.value) : 0;
      if (!isFinite(amount) || amount <= 0) {
        note("add-note", "Pop in an amount first \u2665");
        return;
      }
      var kind = $("entry-kind");
      var cat = $("entry-category");
      var who = $("entry-who");
      var date = $("entry-date");
      var noteText = $("entry-note");
      addEntry({
        kind: kind ? kind.value : "expense",
        amount: amount,
        category: cat && cat.value ? cat.value : "Other",
        who: who ? who.value : "both",
        date: date && date.value ? date.value : dayISO(),
        note: noteText ? noteText.value : ""
      });
      if (amountInput) amountInput.value = "";
      if (noteText) noteText.value = "";
      viewMonth = monthKey($("entry-date") && $("entry-date").value ? $("entry-date").value : dayISO());
      viewKind = "all";
      var fk = $("filter-kind");
      if (fk) fk.value = "all";
      renderAll();
      note("add-note", "Added \u2014 it is counted \u2665");
    });

    var monthSel = $("month-select");
    if (monthSel) monthSel.addEventListener("change", function () {
      viewMonth = monthSel.value;
      renderSummary();
      renderMonthOptions();
    });

    var filterKind = $("filter-kind");
    if (filterKind) filterKind.addEventListener("change", function () {
      viewKind = filterKind.value;
      renderEntries();
    });

    var currencySel = $("currency-select");
    if (currencySel) currencySel.addEventListener("change", function () {
      setCurrency(currencySel.value);
      renderCurrencies();
      renderSummary();
      renderEntries();
    });

    var entryCurrency = $("entry-currency");
    if (entryCurrency) entryCurrency.addEventListener("change", function () {
      setCurrency(entryCurrency.value);
      renderCurrencies();
      renderSummary();
      renderEntries();
    });

    var csv = $("export-csv");
    if (csv) csv.addEventListener("click", function () {
      download("our-budget.csv", toCSV(state.entries, state.currency), "text/csv;charset=utf-8");
      note("save-note", "CSV saved \u2665");
    });

    var json = $("export-json");
    if (json) json.addEventListener("click", function () {
      download("our-budget.json", JSON.stringify(state, null, 2), "application/json");
      note("save-note", "JSON saved \u2665");
    });

    var imp = $("import-file");
    if (imp) imp.addEventListener("change", function () {
      var file = imp.files && imp.files[0];
      if (!file || !file.text) return;
      file.text().then(function (text) {
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
        if (!parsed) { note("save-note", "That file did not look right."); return; }
        replaceState(parsed);
        viewMonth = monthKey(state.entries.length ? sortEntries(state.entries)[0].date : dayISO());
        renderAll();
        note("save-note", "Imported \u2665");
      });
    });

    var reset = $("reset-budget");
    if (reset) reset.addEventListener("click", function () {
      replaceState({ entries: [], currency: state.currency });
      renderAll();
      note("save-note", "The budget is empty \u2014 a fresh start whenever you like.");
    });

    var share = $("share-button");
    if (share) share.addEventListener("click", function () {
      var url = window.location.href;
      if (navigator.share) {
        navigator.share({ title: document.title, url: url }).catch(function () {});
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          note("save-note", "Link copied \u2665");
        }).catch(function () { note("save-note", url); });
        return;
      }
      note("save-note", url);
    });
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", function () {
      load();
      renderAll();
      wire();

      if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
          navigator.serviceWorker.register("sw.js").catch(function () {});
        });
      }
    });
  }
})();
