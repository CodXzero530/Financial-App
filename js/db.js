/**
 * Financial Journal - Offline-First Database Layer
 * IndexedDB with LocalStorage fallback, durable persistence, backup & restore.
 */
const DB_NAME = "FinancialJournalDB";
const DB_VERSION = 1;
const LEGACY_KEY = "financial_journal_entries";

class JournalDB {
  constructor() {
    this.db = null;
    this.ready = false;
  }

  async init() {
    if (this.ready && this.db) return this.db;

    // Request durable storage
    if (navigator.storage && navigator.storage.persist) {
      try {
        await navigator.storage.persist();
      } catch (e) { /* ignore */ }
    }

    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        this.ready = true;
        resolve(null);
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains("transactions")) {
          const s = db.createObjectStore("transactions", { keyPath: "id" });
          s.createIndex("date", "date");
          s.createIndex("type", "type");
          s.createIndex("category", "category");
        }
        if (!db.objectStoreNames.contains("budgets"))
          db.createObjectStore("budgets", { keyPath: "category" });
        if (!db.objectStoreNames.contains("categories"))
          db.createObjectStore("categories", { keyPath: "id" });
        if (!db.objectStoreNames.contains("settings"))
          db.createObjectStore("settings", { keyPath: "key" });
      };

      req.onsuccess = (ev) => {
        this.db = ev.target.result;
        this.ready = true;
        this._migrateLegacy().then(
          () => resolve(this.db),
          reject
        );
      };

      req.onerror = () => {
        this.ready = true;
        console.error("[Storage] IndexedDB could not be opened; using the local storage fallback:", req.error);
        resolve(null);
      };
    });
  }

  // --- Legacy Migration ---
  async _migrateLegacy() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) return;
      const existing = await this.getAllTransactions();
      if (existing.length > 0) return;
      for (const e of arr) {
        await this.saveTransaction({
          id: e.id || this._genId(),
          amount: parseFloat(e.amount) || 0,
          type: e.type === "Income" ? "Income" : "Expense",
          date: e.date || new Date().toISOString().split("T")[0],
          category: e.category || "Other",
          description: e.description || "",
          createdAt: e.createdAt || new Date().toISOString()
        });
      }
    } catch (e) {
      console.error("[Storage] Legacy transaction migration failed:", e);
      throw e;
    }
  }

  _genId() {
    return "tx_" + Date.now() + "_" + Math.random().toString(36).substr(2, 8);
  }

  // --- IDB helpers ---
  _idbAll(store) {
    return this._idbRequest(store, "readonly", objectStore => objectStore.getAll())
      .then(result => result || []);
  }

  _idbGet(store, key) {
    return this._idbRequest(store, "readonly", objectStore => objectStore.get(key));
  }

  _idbPut(store, obj) {
    return this._idbRequest(store, "readwrite", objectStore => objectStore.put(obj));
  }

  _idbDel(store, key) {
    return this._idbRequest(store, "readwrite", objectStore => objectStore.delete(key));
  }

  _idbClear(store) {
    return this._idbRequest(store, "readwrite", objectStore => objectStore.clear());
  }

  _idbRequest(store, mode, createRequest) {
    return new Promise((resolve, reject) => {
      let result;
      let tx;
      try {
        tx = this.db.transaction(store, mode);
        const request = createRequest(tx.objectStore(store));
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error("Local database request failed."));
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error || new Error("Local database transaction was aborted."));
        tx.onerror = () => reject(tx.error || new Error("Local database transaction failed."));
      } catch (error) {
        reject(error);
      }
    });
  }

  _readFallbackTransactions() {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
    if (!Array.isArray(parsed)) throw new Error("The local transaction backup is not valid.");
    return parsed;
  }

  _writeFallbackTransactions(entries) {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(entries));
  }

  // --- Transactions ---
  async getAllTransactions() {
    await this.init();
    if (this.db) return this._idbAll("transactions");
    return this._readFallbackTransactions();
  }

  async getTransaction(id) {
    await this.init();
    if (this.db) return this._idbGet("transactions", id);
    const all = await this.getAllTransactions();
    return all.find(e => e.id === id);
  }

  async saveTransaction(t) {
    await this.init();
    const clean = {
      id: t.id || this._genId(),
      amount: Math.abs(parseFloat(t.amount) || 0),
      type: t.type === "Income" ? "Income" : "Expense",
      date: t.date || new Date().toISOString().split("T")[0],
      category: t.category || "Other",
      description: (t.description || "").trim(),
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (this.db) {
      await this._idbPut("transactions", clean);
      try {
        this._writeFallbackTransactions(await this.getAllTransactions());
      } catch (error) {
        console.warn("[Storage] Redundant transaction backup update failed:", error);
      }
    } else {
      const all = this._readFallbackTransactions();
      const index = all.findIndex(entry => entry.id === clean.id);
      if (index === -1) all.push(clean);
      else all[index] = clean;
      this._writeFallbackTransactions(all);
    }
    return clean;
  }

  async deleteTransaction(id) {
    await this.init();
    if (this.db) {
      await this._idbDel("transactions", id);
      try {
        this._writeFallbackTransactions(await this.getAllTransactions());
      } catch (error) {
        console.warn("[Storage] Redundant transaction backup update failed:", error);
      }
    } else {
      const all = this._readFallbackTransactions().filter(entry => entry.id !== id);
      this._writeFallbackTransactions(all);
    }
  }

  async clearAllTransactions() {
    await this.init();
    if (this.db) {
      await this._idbClear("transactions");
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch (error) {
        console.warn("[Storage] Redundant transaction backup removal failed:", error);
      }
    } else {
      localStorage.removeItem(LEGACY_KEY);
    }
  }

  // --- Budgets ---
  async getAllBudgets() {
    await this.init();
    if (this.db) return this._idbAll("budgets");
    try { return JSON.parse(localStorage.getItem("fj_budgets") || "[]"); }
    catch { return []; }
  }

  async saveBudget(category, limit) {
    await this.init();
    const b = { category, monthlyLimit: parseFloat(limit) || 0, updatedAt: new Date().toISOString() };
    if (this.db) await this._idbPut("budgets", b);
    try { const all = await this.getAllBudgets(); localStorage.setItem("fj_budgets", JSON.stringify(all)); } catch (e) {}
    return b;
  }

  async deleteBudget(category) {
    await this.init();
    if (this.db) await this._idbDel("budgets", category);
    try { const all = await this.getAllBudgets(); localStorage.setItem("fj_budgets", JSON.stringify(all)); } catch (e) {}
  }

  // --- Categories ---
  async getAllCategories() {
    await this.init();
    const defaults = [
      { id: "Salary", name: "Salary", type: "Income", icon: "\u{1F4BC}", color: "#10b981" },
      { id: "Investment", name: "Investment", type: "Income", icon: "\u{1F4C8}", color: "#3b82f6" },
      { id: "Freelance", name: "Freelance / Business", type: "Income", icon: "\u{1F4BB}", color: "#6366f1" },
      { id: "OtherIncome", name: "Other Income", type: "Income", icon: "\u{1F4B5}", color: "#14b8a6" },
      { id: "Groceries", name: "Groceries & Food", type: "Expense", icon: "\u{1F6D2}", color: "#f59e0b" },
      { id: "Rent", name: "Rent & Housing", type: "Expense", icon: "\u{1F3E0}", color: "#ef4444" },
      { id: "Utilities", name: "Utilities & Bills", type: "Expense", icon: "\u{1F4A1}", color: "#ec4899" },
      { id: "Transport", name: "Transport & Fuel", type: "Expense", icon: "\u{1F697}", color: "#8b5cf6" },
      { id: "Entertainment", name: "Entertainment", type: "Expense", icon: "\u{1F3AC}", color: "#06b6d4" },
      { id: "Health", name: "Health & Medical", type: "Expense", icon: "\u{1F48A}", color: "#10b981" },
      { id: "Shopping", name: "Shopping & Personal", type: "Expense", icon: "\u{1F6CD}\u{FE0F}", color: "#f97316" },
      { id: "Other", name: "Other Expense", type: "Expense", icon: "\u{1F4E6}", color: "#64748b" }
    ];

    let custom = [];
    if (this.db) {
      custom = await this._idbAll("categories");
    } else {
      try { custom = JSON.parse(localStorage.getItem("fj_categories") || "[]"); } catch (e) {}
    }

    const map = new Map();
    defaults.forEach(c => map.set(c.id, c));
    custom.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }

  async saveCategory(cat) {
    await this.init();
    if (this.db) await this._idbPut("categories", cat);
    try { const all = await this.getAllCategories(); localStorage.setItem("fj_categories", JSON.stringify(all.filter(c => c.isCustom))); } catch (e) {}
    return cat;
  }

  async deleteCategory(id) {
    await this.init();
    if (this.db) await this._idbDel("categories", id);
  }

  // --- Settings ---
  async getSetting(key, def) {
    await this.init();
    if (this.db) {
      const r = await this._idbGet("settings", key);
      if (r && r.value !== undefined) return r.value;
    }
    const v = localStorage.getItem("fj_s_" + key);
    if (v !== null) { try { return JSON.parse(v); } catch { return v; } }
    return def;
  }

  async setSetting(key, value) {
    await this.init();
    if (this.db) await this._idbPut("settings", { key, value, updatedAt: new Date().toISOString() });
    try { localStorage.setItem("fj_s_" + key, JSON.stringify(value)); } catch (e) {}
  }

  // --- Full Backup & Restore ---
  async exportBackupJSON() {
    const data = {
      app: "Financial Journal",
      version: 2,
      exportDate: new Date().toISOString(),
      data: {
        transactions: await this.getAllTransactions(),
        budgets: await this.getAllBudgets(),
        customCategories: (await this.getAllCategories()).filter(c => c.isCustom),
        settings: {
          currency: await this.getSetting("currency", { code: "XAF", symbol: "FCFA", position: "suffix" }),
          theme: await this.getSetting("theme", "light")
        }
      }
    };
    return JSON.stringify(data, null, 2);
  }

  async importBackupJSON(jsonStr, overwrite) {
    let parsed;
    try { parsed = JSON.parse(jsonStr); } catch { throw new Error("Invalid JSON file."); }

    const entries = Array.isArray(parsed) ? parsed
      : (parsed.data && Array.isArray(parsed.data.transactions) ? parsed.data.transactions : []);

    if (overwrite) await this.clearAllTransactions();

    let count = 0;
    for (const item of entries) {
      if (item && item.amount !== undefined) {
        await this.saveTransaction(item);
        count++;
      }
    }

    if (parsed.data) {
      if (Array.isArray(parsed.data.budgets))
        for (const b of parsed.data.budgets) if (b.category) await this.saveBudget(b.category, b.monthlyLimit);
      if (Array.isArray(parsed.data.customCategories))
        for (const c of parsed.data.customCategories) await this.saveCategory(c);
      if (parsed.data.settings && parsed.data.settings.currency)
        await this.setSetting("currency", parsed.data.settings.currency);
    }

    return { importedCount: count, success: true };
  }

  async exportCSV() {
    const entries = await this.getAllTransactions();
    if (entries.length === 0) return null;
    entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    const hdr = "ID,Date,Type,Category,Amount,Description,Created At";
    const rows = entries.map(e =>
      ['"'+e.id+'"', '"'+e.date+'"', '"'+e.type+'"', '"'+(e.category||"").replace(/"/g,'""')+'"',
       (parseFloat(e.amount)||0).toFixed(2), '"'+(e.description||"").replace(/"/g,'""')+'"', '"'+(e.createdAt||"")+'"'
      ].join(",")
    );
    return hdr + "\r\n" + rows.join("\r\n");
  }
}

window.journalDB = new JournalDB();
