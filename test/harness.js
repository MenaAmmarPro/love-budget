"use strict";

/*
 * test/harness.js — dependency-free checks for love-budget.
 *
 * Run:  node test/harness.js
 * Loads js/app.js in a bare context (no real DOM) and checks the pure
 * helpers exposed on window.MenaBudget.
 */

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const store = {};

const el = () => ({
  style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {},
  appendChild() {}, addEventListener() {}, setAttribute() {}, removeAttribute() {},
  querySelector: () => null, querySelectorAll: () => [], focus() {}, remove() {},
  innerHTML: "", textContent: "", value: ""
});

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Intl,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => el(),
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    documentElement: { classList: { add() {}, remove() {}, toggle() {} } }
  },
  navigator: { language: "en", clipboard: { writeText: async () => {} } },
  requestAnimationFrame: (fn) => setTimeout(fn, 0)
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = process.argv.slice(2);
for (const f of (files.length ? files : ["js/app.js"])) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), sandbox, { filename: f });
}

const NS = sandbox.window.MenaBudget;

let failures = 0;
function assert(cond, message) {
  if (!cond) {
    console.error("FAIL: " + message);
    failures += 1;
    process.exitCode = 1;
  } else {
    console.log("ok - " + message);
  }
}

/* ---------------- namespace ---------------- */
assert(!!NS, "namespace window.MenaBudget is exposed");
assert(NS.STORE === "mena-budget", "storage key is mena-budget");
assert(Array.isArray(NS.CURRENCIES) && NS.CURRENCIES.length === 4, "four currencies");
assert(NS.CURRENCIES.map((c) => c.code).join(",") === "PKR,RON,EUR,USD", "currency codes PKR/RON/EUR/USD");

/* ---------------- money + labels ---------------- */
assert(NS.currencySymbol("EUR") === "\u20AC", "EUR symbol is the euro sign");
assert(NS.formatMoney(1234.5, "PKR").indexOf("1,234.5") >= 0, "formatMoney groups thousands (PKR)");
assert(NS.formatMoney(1234.5, "PKR").indexOf("\u20A8") === 0, "PKR symbol is a prefix");
assert(NS.formatMoney(1234.5, "RON").indexOf("lei") > 0, "RON symbol is a suffix");
assert(NS.formatMoney(10, "USD") === "$10", "whole amounts drop decimals");
assert(NS.monthLabel("2026-10") === "October 2026", "monthLabel reads a month key");
assert(NS.monthLabel("nope") === "nope", "monthLabel passes unknown keys through");
assert(NS.monthKey("2026-10-19") === "2026-10", "monthKey trims the day");
assert(NS.dayISO(new Date(2026, 0, 5)) === "2026-01-05", "dayISO zero-pads");
assert(NS.whoLabel("mena") === "Mena", "whoLabel reads a person");

/* ---------------- summarise ---------------- */
const entries = [
  { kind: "income", amount: 100, category: "Savings", who: "both", date: "2026-10-01" },
  { kind: "expense", amount: 30, category: "Food", who: "ammar", date: "2026-10-02" },
  { kind: "expense", amount: 10, category: "Food", who: "mena", date: "2026-10-03" },
  { kind: "expense", amount: 20, category: "Travel", who: "both", date: "2026-10-04" },
  { kind: "expense", amount: 5, category: "Travel", who: "ammar", date: "2026-09-30" }
];

const sums = NS.summarize(entries);
assert(sums.income === 100, "summarize totals income");
assert(sums.expense === 65, "summarize totals expense");
assert(sums.balance === 35, "summarize computes the balance");

const october = NS.filterByMonth(entries, "2026-10");
assert(october.length === 4, "filterByMonth keeps only that month");
assert(NS.filterByKind(entries, "income").length === 1, "filterByKind income");
assert(NS.filterByKind(entries, "all").length === 5, "filterByKind all keeps everything");

/* ---------------- categories ---------------- */
const cats = NS.byCategory(october);
assert(cats.length === 2, "byCategory groups categories");
assert(cats[0].category === "Food" && cats[0].total === 40, "biggest category first");
assert(cats[1].category === "Travel" && cats[1].total === 20, "second category");
assert(Math.abs(cats[0].pct - 66.7) < 0.1, "category percentage of spend");

/* ---------------- days / per-day ---------------- */
assert(NS.daysInMonth("2026-10") === 31, "daysInMonth October = 31");
assert(NS.daysInMonth("2026-02") === 28, "daysInMonth February 2026 = 28");
assert(NS.daysInMonth("bad") === 30, "daysInMonth falls back to 30");

/* 2026-09 is a completed month: 5 / 30 days = 0.17. */
assert(NS.perDay(entries, "2026-09") === 0.17, "perDay spreads spend over the month");
assert(NS.perDay(entries, "2026-08") === 0, "perDay is zero for an empty month");

/* ---------------- split ---------------- */
const split = NS.byPerson(october);
assert(split.ammar === 30, "Ammar's share of October spend");
assert(split.mena === 10, "Mena's share of October spend");
assert(split.both === 20, "shared spend");

/* ---------------- sorting + months ---------------- */
const sorted = NS.sortEntries(entries);
assert(sorted[0].date >= sorted[sorted.length - 1].date, "sortEntries newest first");
const months = NS.months(entries);
assert(months[0] === "2026-10" && months[1] === "2026-09", "months newest first");

/* ---------------- csv ---------------- */
const csv = NS.toCSV(entries, "PKR");
const lines = csv.split("\n");
assert(lines[0] === "date,kind,category,who,note,amount,currency", "CSV header");
assert(lines.length === entries.length + 1, "CSV has one row per entry");
assert(csv.indexOf('"a, b"') >= 0 || csv.indexOf("Food") >= 0, "CSV includes category cells");
const quoted = NS.toCSV([{ date: "2026-01-01", kind: "expense", category: 'He said "hi"', who: "both", note: "a, b", amount: 1 }], "EUR");
assert(quoted.indexOf('"He said ""hi"""') >= 0, "CSV escapes quotes");
assert(quoted.indexOf('"a, b"') >= 0, "CSV quotes commas");

/* ---------------- normalisation ---------------- */
assert(NS.cleanEntry(null) === null, "cleanEntry rejects nothing");
assert(NS.cleanEntry({ amount: -5 }) === null, "cleanEntry rejects negative amounts");
assert(NS.cleanEntry({ amount: "abc" }) === null, "cleanEntry rejects non-numeric amounts");
const clean = NS.cleanEntry({ amount: "12.345", kind: "income", category: "Gift", who: "mena", date: "2026-10-19", note: "x" });
assert(clean && clean.amount === 12.35, "cleanEntry rounds to two decimals");
assert(clean.kind === "income" && clean.who === "mena", "cleanEntry keeps kind + who");
assert(clean.id && clean.id.length > 1, "cleanEntry assigns an id");

const norm = NS.normalizeState({ currency: "RON", entries: [{ amount: 5 }, { amount: -1 }] });
assert(norm.currency === "RON", "normalizeState keeps currency");
assert(norm.entries.length === 1, "normalizeState drops invalid entries");

/* ---------------- storage round-trip ---------------- */
NS.replaceState({ currency: "EUR", entries: [] });
assert(NS.state.currency === "EUR" && NS.state.entries.length === 0, "replaceState resets state");
const added = NS.addEntry({ kind: "expense", amount: 9.5, category: "Pizza", who: "both", date: "2026-10-19" });
assert(added && NS.state.entries.length === 1, "addEntry appends an entry");
assert(store["mena-budget"].indexOf("Pizza") >= 0, "addEntry persists to localStorage");
assert(NS.addEntry({ amount: 0 }) !== null, "addEntry accepts a zero amount");

NS.load();
assert(NS.state.entries.length === 2, "load reads the saved entries back");
assert(NS.removeEntry(added.id) === true, "removeEntry deletes by id");
assert(NS.state.entries.length === 1, "removeEntry shortens the list");
assert(NS.removeEntry("nope") === false, "removeEntry reports a miss");

NS.load();
assert(NS.state.entries.length === 1, "removal was persisted");

console.log(failures ? "\n" + failures + " failure(s)" : "\nall checks passed");
