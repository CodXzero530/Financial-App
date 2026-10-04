/**
 * Financial Journal - Core Application Logic
 * 100% Offline-First, Mobile-Grade Personal Finance Experience
 */

document.addEventListener("DOMContentLoaded", async () => {
  // --- State ---
  let currentTab = "dashboard";
  let transactions = [];
  let budgets = [];
  let categories = [];
  let currency = { code: "XAF", symbol: "FCFA", position: "suffix" };
  let editingTxId = null;
  let activeTypeFilter = "All";
  let activeCategoryFilter = "All";
  let activeDatePreset = "all";
  let searchQuery = "";
  let pinCode = null;
  let isPinEnabled = false;
  let enteredPin = "";

  // --- DOM Elements ---
  const tabPanels = document.querySelectorAll(".tab-panel");
  const navItems = document.querySelectorAll(".nav-item");
  const fabBtn = document.getElementById("fab-add-btn");
  const txModal = document.getElementById("tx-modal");
  const txForm = document.getElementById("tx-form");
  const txModalTitle = document.getElementById("tx-modal-title");
  const txSubmitBtn = document.getElementById("tx-submit-btn");
  const txDeleteBtn = document.getElementById("tx-delete-btn");

  // Form Fields
  const txAmount = document.getElementById("tx-amount");
  const txTypeExpense = document.getElementById("type-expense");
  const txTypeIncome = document.getElementById("type-income");
  const txCategory = document.getElementById("tx-category");
  const txDate = document.getElementById("tx-date");
  const txDescription = document.getElementById("tx-description");

  // Search & Filters
  const searchInput = document.getElementById("tx-search-input");
  const categoryFilterSelect = document.getElementById("category-filter-select");
  const filterPills = document.querySelectorAll(".filter-pill");

  // PIN Elements
  const pinLockScreen = document.getElementById("pin-lock-screen");
  const pinDots = document.querySelectorAll(".pin-dot");
  const pinKeypad = document.getElementById("pin-keypad");

  // --- Currency Formatter ---
  function formatMoney(amount) {
    const num = Math.abs(parseFloat(amount) || 0);
    const formatted = num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    if (currency.position === "prefix") {
      return `${currency.symbol} ${formatted}`;
    }
    return `${formatted} ${currency.symbol}`;
  }

  // --- Toast Notifications ---
  function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const icon = type === "success" ? "✓" : "⚠";
    const iconElement = document.createElement("span");
    iconElement.textContent = icon;
    const messageElement = document.createElement("span");
    messageElement.textContent = message;
    toast.append(iconElement, messageElement);

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // --- Initial Data Load ---
  async function loadAllData() {
    await window.journalDB.init();
    transactions = await window.journalDB.getAllTransactions();
    budgets = await window.journalDB.getAllBudgets();
    categories = await window.journalDB.getAllCategories();
    currency = await window.journalDB.getSetting("currency", { code: "XAF", symbol: "FCFA", position: "suffix" });

    const savedPin = await window.journalDB.getSetting("security_pin", null);
    isPinEnabled = (await window.journalDB.getSetting("pin_enabled", false)) && !!savedPin;
    pinCode = savedPin;

    // Check PIN requirement
    if (isPinEnabled && pinCode) {
      showPinScreen();
    } else {
      hidePinScreen();
    }

    populateCategoryDropdowns();
    renderAllViews();
  }

  // --- PIN Lock System ---
  function showPinScreen() {
    enteredPin = "";
    updatePinDots();
    pinLockScreen.classList.remove("hidden");
  }

  function hidePinScreen() {
    pinLockScreen.classList.add("hidden");
    enteredPin = "";
  }

  function updatePinDots() {
    pinDots.forEach((dot, index) => {
      if (index < enteredPin.length) {
        dot.classList.add("filled");
      } else {
        dot.classList.remove("filled");
      }
    });
  }

  if (pinKeypad) {
    pinKeypad.addEventListener("click", async (e) => {
      const btn = e.target.closest(".pin-key");
      if (!btn) return;
      const val = btn.dataset.val;

      if (val === "clear") {
        enteredPin = "";
        updatePinDots();
        return;
      }

      if (val === "back") {
        enteredPin = enteredPin.slice(0, -1);
        updatePinDots();
        return;
      }

      if (enteredPin.length < 4) {
        enteredPin += val;
        updatePinDots();

        if (enteredPin.length === 4) {
          if (enteredPin === pinCode) {
            hidePinScreen();
            showToast("Unlocked successfully!");
          } else {
            showToast("Incorrect PIN, please try again.", "error");
            setTimeout(() => {
              enteredPin = "";
              updatePinDots();
            }, 400);
          }
        }
      }
    });
  }

  // --- Tab Navigation Router ---
  function switchTab(tabId) {
    currentTab = tabId;
    tabPanels.forEach(panel => {
      panel.classList.toggle("active", panel.id === `panel-${tabId}`);
    });

    navItems.forEach(item => {
      item.classList.toggle("active", item.dataset.tab === tabId);
    });

    // Refresh views on tab change
    if (tabId === "analytics") renderAnalyticsView();
    if (tabId === "budgets") renderBudgetsView();
    if (tabId === "transactions") renderTransactionsView();
    if (tabId === "settings") renderSettingsView();
    if (tabId === "dashboard") renderDashboardView();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  navItems.forEach(item => {
    item.addEventListener("click", () => switchTab(item.dataset.tab));
  });

  // Category Dropdown Population
  function populateCategoryDropdowns(selectedType = "Expense") {
    if (!txCategory) return;
    txCategory.innerHTML = "";

    const filtered = categories.filter(c => c.type === selectedType);
    filtered.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = `${cat.icon || "•"} ${cat.name}`;
      txCategory.appendChild(opt);
    });

    // Populate Transactions filter select
    if (categoryFilterSelect) {
      categoryFilterSelect.innerHTML = '<option value="All">All Categories</option>';
      categories.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.id;
        opt.textContent = `${cat.icon || "•"} ${cat.name}`;
        categoryFilterSelect.appendChild(opt);
      });
    }

    // Populate Budget Category Select
    const budgetCategorySelect = document.getElementById("budget-category-select");
    if (budgetCategorySelect) {
      budgetCategorySelect.innerHTML = "";
      const expenseCats = categories.filter(c => c.type === "Expense");
      expenseCats.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.id;
        opt.textContent = `${cat.icon || "•"} ${cat.name}`;
        budgetCategorySelect.appendChild(opt);
      });
    }
  }

  // Type Toggle in Modal Form
  function setFormType(type) {
    if (type === "Income") {
      txTypeIncome.classList.add("active", "income");
      txTypeExpense.classList.remove("active", "expense");
    } else {
      txTypeExpense.classList.add("active", "expense");
      txTypeIncome.classList.remove("active", "income");
    }
    populateCategoryDropdowns(type);
  }

  txTypeExpense.addEventListener("click", () => setFormType("Expense"));
  txTypeIncome.addEventListener("click", () => setFormType("Income"));

  // --- Render All Views ---
  function renderAllViews() {
    renderDashboardView();
    renderTransactionsView();
    renderAnalyticsView();
    renderBudgetsView();
    renderSettingsView();
  }

  // --- 1. Dashboard View ---
  function renderDashboardView() {
    let income = 0;
    let expense = 0;

    transactions.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      if (t.type === "Income") income += amt;
      else expense += amt;
    });

    const net = income - expense;

    // Hero Balance Card
    const heroBalance = document.getElementById("dash-net-balance");
    const heroIncome = document.getElementById("dash-total-income");
    const heroExpense = document.getElementById("dash-total-expense");

    if (heroBalance) {
      heroBalance.textContent = (net < 0 ? "-" : "") + formatMoney(net);
      heroBalance.style.color = "#ffffff";
    }
    if (heroIncome) heroIncome.textContent = "+" + formatMoney(income);
    if (heroExpense) heroExpense.textContent = "-" + formatMoney(expense);

    // Recent 5 Transactions
    const recentList = document.getElementById("dash-recent-list");
    const recentEmpty = document.getElementById("dash-recent-empty");
    if (!recentList) return;

    recentList.innerHTML = "";
    const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const recents = sorted.slice(0, 5);

    if (recents.length === 0) {
      if (recentEmpty) recentEmpty.style.display = "block";
    } else {
      if (recentEmpty) recentEmpty.style.display = "none";
      recents.forEach(t => {
        recentList.appendChild(createTransactionElement(t));
      });
    }
  }

  // Helper: Create Transaction Card Element
  function createTransactionElement(t) {
    const card = document.createElement("div");
    card.className = "transaction-card";
    card.dataset.id = t.id;

    const catObj = categories.find(c => c.id === t.category) || {
      name: t.category,
      icon: t.type === "Income" ? "💰" : "💳",
      color: "#6366f1"
    };

    const isIncome = t.type === "Income";
    const sign = isIncome ? "+" : "-";

    card.innerHTML = `
      <div class="tx-left">
        <div class="tx-icon-bubble" style="background-color: ${catObj.color}20; color: ${catObj.color};">
          ${catObj.icon || "•"}
        </div>
        <div class="tx-details">
          <div class="tx-category">${catObj.name || t.category}</div>
          <div class="tx-meta">${t.description ? t.description : t.date}</div>
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount ${isIncome ? 'income' : 'expense'}">${sign}${formatMoney(t.amount)}</div>
        <div class="tx-date">${t.date}</div>
      </div>
    `;

    card.addEventListener("click", () => openEditModal(t.id));
    return card;
  }

  // --- 2. Transactions View ---
  function renderTransactionsView() {
    const list = document.getElementById("tx-full-list");
    const emptyState = document.getElementById("tx-empty-state");
    if (!list) return;

    list.innerHTML = "";

    // Filtering logic
    const filtered = transactions.filter(t => {
      // Type filter
      if (activeTypeFilter !== "All" && t.type !== activeTypeFilter) return false;

      // Category filter
      if (activeCategoryFilter !== "All" && t.category !== activeCategoryFilter) return false;

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const descMatch = (t.description || "").toLowerCase().includes(q);
        const catMatch = (t.category || "").toLowerCase().includes(q);
        if (!descMatch && !catMatch) return false;
      }

      // Date Presets
      if (activeDatePreset !== "all") {
        const txDateObj = new Date(t.date);
        const now = new Date();

        if (activeDatePreset === "this_month") {
          if (txDateObj.getMonth() !== now.getMonth() || txDateObj.getFullYear() !== now.getFullYear()) {
            return false;
          }
        } else if (activeDatePreset === "last_month") {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          if (txDateObj.getMonth() !== lastMonth.getMonth() || txDateObj.getFullYear() !== lastMonth.getFullYear()) {
            return false;
          }
        } else if (activeDatePreset === "this_year") {
          if (txDateObj.getFullYear() !== now.getFullYear()) return false;
        }
      }

      return true;
    });

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) {
      if (emptyState) emptyState.style.display = "block";
    } else {
      if (emptyState) emptyState.style.display = "none";
      filtered.forEach(t => {
        list.appendChild(createTransactionElement(t));
      });
    }
  }

  // Filter Event Listeners
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value.trim();
      renderTransactionsView();
    });
  }

  filterPills.forEach(pill => {
    pill.addEventListener("click", () => {
      filterPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      activeTypeFilter = pill.dataset.filter;
      renderTransactionsView();
    });
  });

  if (categoryFilterSelect) {
    categoryFilterSelect.addEventListener("change", (e) => {
      activeCategoryFilter = e.target.value;
      renderTransactionsView();
    });
  }

  const datePresetSelect = document.getElementById("date-preset-select");
  if (datePresetSelect) {
    datePresetSelect.addEventListener("change", (e) => {
      activeDatePreset = e.target.value;
      renderTransactionsView();
    });
  }

  // --- 3. Analytics View (100% Offline SVG/Canvas Chart) ---
  function renderAnalyticsView() {
    const donutSvg = document.getElementById("analytics-donut-svg");
    const legendContainer = document.getElementById("analytics-legend");
    const centerVal = document.getElementById("analytics-center-val");
    const barIncomeFill = document.getElementById("bar-income-fill");
    const barExpenseFill = document.getElementById("bar-expense-fill");
    const barIncomeVal = document.getElementById("bar-income-val");
    const barExpenseVal = document.getElementById("bar-expense-val");
    const savingsRateVal = document.getElementById("savings-rate-val");

    if (!donutSvg || !legendContainer) return;

    // Calculate totals for current month or selected period
    let totalExpense = 0;
    let totalIncome = 0;
    const catTotals = {};

    transactions.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      if (t.type === "Expense") {
        totalExpense += amt;
        catTotals[t.category] = (catTotals[t.category] || 0) + amt;
      } else {
        totalIncome += amt;
      }
    });

    if (centerVal) centerVal.textContent = formatMoney(totalExpense);

    // Render Cash Flow Bars
    const maxFlow = Math.max(totalIncome, totalExpense, 1);
    if (barIncomeFill) barIncomeFill.style.width = `${Math.min(100, (totalIncome / maxFlow) * 100)}%`;
    if (barExpenseFill) barExpenseFill.style.width = `${Math.min(100, (totalExpense / maxFlow) * 100)}%`;
    if (barIncomeVal) barIncomeVal.textContent = formatMoney(totalIncome);
    if (barExpenseVal) barExpenseVal.textContent = formatMoney(totalExpense);

    // Savings Rate
    if (savingsRateVal) {
      if (totalIncome > 0) {
        const rate = Math.round(((totalIncome - totalExpense) / totalIncome) * 100);
        savingsRateVal.textContent = `${rate}%`;
        savingsRateVal.style.color = rate >= 20 ? "var(--income-green)" : (rate > 0 ? "var(--warning-amber)" : "var(--expense-red)");
      } else {
        savingsRateVal.textContent = "0%";
        savingsRateVal.style.color = "var(--text-muted)";
      }
    }

    // Render SVG Donut Chart
    donutSvg.innerHTML = "";
    legendContainer.innerHTML = "";

    const sortedCats = Object.entries(catTotals).sort(([, a], [, b]) => b - a);

    if (totalExpense === 0 || sortedCats.length === 0) {
      // Empty donut placeholder ring
      donutSvg.innerHTML = `
        <circle cx="100" cy="100" r="70" stroke="var(--border-light)" stroke-width="24" fill="none" />
      `;
      legendContainer.innerHTML = `
        <p class="empty-state-desc" style="text-align: center; padding: 12px;">No expenses recorded yet.</p>
      `;
      return;
    }

    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    let accumulatedOffset = 0;

    sortedCats.forEach(([catId, amount]) => {
      const percentage = amount / totalExpense;
      const strokeLength = percentage * circumference;
      const strokeGap = circumference - strokeLength;

      const catObj = categories.find(c => c.id === catId) || {
        name: catId,
        color: "#6366f1",
        icon: "📦"
      };

      // SVG circle segment
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "100");
      circle.setAttribute("cy", "100");
      circle.setAttribute("r", radius.toString());
      circle.setAttribute("stroke", catObj.color || "#6366f1");
      circle.setAttribute("stroke-width", "26");
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke-dasharray", `${strokeLength} ${strokeGap}`);
      circle.setAttribute("stroke-dashoffset", (-accumulatedOffset).toString());
      circle.classList.add("donut-segment");
      donutSvg.appendChild(circle);

      accumulatedOffset += strokeLength;

      // Legend Item
      const legendRow = document.createElement("div");
      legendRow.className = "legend-row";
      legendRow.innerHTML = `
        <div class="legend-category">
          <div class="legend-dot" style="background-color: ${catObj.color || '#6366f1'};"></div>
          <span>${catObj.icon || "•"} ${catObj.name || catId}</span>
          <span class="legend-percent">${Math.round(percentage * 100)}%</span>
        </div>
        <div style="font-weight: 700;">${formatMoney(amount)}</div>
      `;
      legendContainer.appendChild(legendRow);
    });
  }

  // --- 4. Budgets View ---
  function renderBudgetsView() {
    const list = document.getElementById("budgets-list");
    const emptyState = document.getElementById("budgets-empty-state");
    if (!list) return;

    list.innerHTML = "";

    // Calculate current month's spending by category
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlySpent = {};
    transactions.forEach(t => {
      if (t.type === "Expense") {
        const d = new Date(t.date);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          monthlySpent[t.category] = (monthlySpent[t.category] || 0) + parseFloat(t.amount);
        }
      }
    });

    if (budgets.length === 0) {
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    budgets.forEach(b => {
      const spent = monthlySpent[b.category] || 0;
      const limit = parseFloat(b.monthlyLimit) || 0;
      const percent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
      const remaining = limit - spent;

      const catObj = categories.find(c => c.id === b.category) || {
        name: b.category,
        icon: "📦",
        color: "#6366f1"
      };

      let statusClass = "safe";
      let statusText = `${formatMoney(remaining)} remaining`;

      if (spent >= limit) {
        statusClass = "over";
        statusText = `Over budget by ${formatMoney(Math.abs(remaining))}!`;
      } else if (percent >= 75) {
        statusClass = "warning";
        statusText = `${percent}% used (${formatMoney(remaining)} left)`;
      }

      const card = document.createElement("div");
      card.className = "budget-card";
      card.innerHTML = `
        <div class="budget-header">
          <div class="budget-category-info">
            <span>${catObj.icon || "•"}</span>
            <span>${catObj.name || b.category}</span>
          </div>
          <button class="icon-btn edit-budget-btn" style="width: 28px; height: 28px; font-size: 11px;" data-cat="${b.category}">✎</button>
        </div>
        <div class="budget-amounts">
          <span>Spent: <strong>${formatMoney(spent)}</strong></span>
          <span>Limit: <strong>${formatMoney(limit)}</strong></span>
        </div>
        <div class="budget-progress-track">
          <div class="budget-progress-fill ${statusClass}" style="width: ${percent}%;"></div>
        </div>
        <div class="budget-alert ${statusClass}">${statusText}</div>
      `;

      card.querySelector(".edit-budget-btn").addEventListener("click", () => {
        openBudgetModal(b.category, b.monthlyLimit);
      });

      list.appendChild(card);
    });
  }

  // Budget Modal Handling
  const budgetModal = document.getElementById("budget-modal");
  const budgetForm = document.getElementById("budget-form");
  const budgetCategorySelect = document.getElementById("budget-category-select");
  const budgetLimitInput = document.getElementById("budget-limit-input");
  const budgetDeleteBtn = document.getElementById("budget-delete-btn");

  function openBudgetModal(category = null, limit = "") {
    if (!budgetModal) return;
    if (category) {
      budgetCategorySelect.value = category;
      budgetCategorySelect.disabled = true;
      budgetLimitInput.value = limit;
      budgetDeleteBtn.style.display = "block";
    } else {
      budgetCategorySelect.disabled = false;
      budgetLimitInput.value = "";
      budgetDeleteBtn.style.display = "none";
    }
    budgetModal.classList.add("active");
  }

  const addBudgetBtn = document.getElementById("add-budget-btn");
  if (addBudgetBtn) addBudgetBtn.addEventListener("click", () => openBudgetModal());

  const closeBudgetBtn = document.getElementById("close-budget-modal");
  if (closeBudgetBtn) closeBudgetBtn.addEventListener("click", () => budgetModal.classList.remove("active"));

  if (budgetForm) {
    budgetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const cat = budgetCategorySelect.value;
      const limit = parseFloat(budgetLimitInput.value);
      if (!cat || isNaN(limit) || limit <= 0) {
        showToast("Please enter a valid monthly limit.", "error");
        return;
      }

      await window.journalDB.saveBudget(cat, limit);
      budgets = await window.journalDB.getAllBudgets();
      budgetModal.classList.remove("active");
      renderBudgetsView();
      showToast("Budget saved successfully!");
    });
  }

  if (budgetDeleteBtn) {
    budgetDeleteBtn.addEventListener("click", async () => {
      const cat = budgetCategorySelect.value;
      if (confirm(`Remove monthly budget limit for ${cat}?`)) {
        await window.journalDB.deleteBudget(cat);
        budgets = await window.journalDB.getAllBudgets();
        budgetModal.classList.remove("active");
        renderBudgetsView();
        showToast("Budget removed.");
      }
    });
  }

  // --- 5. Settings View ---
  function renderSettingsView() {
    const currencySelect = document.getElementById("settings-currency-select");
    if (currencySelect) currencySelect.value = currency.code || "XAF";

    const pinToggle = document.getElementById("settings-pin-toggle");
    if (pinToggle) pinToggle.checked = isPinEnabled;

    const themeSelect = document.getElementById("settings-theme-select");
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    if (themeSelect) themeSelect.value = currentTheme;
  }

  // Settings: Currency Change
  const currencySelect = document.getElementById("settings-currency-select");
  if (currencySelect) {
    currencySelect.addEventListener("change", async (e) => {
      const currencies = {
        XAF: { code: "XAF", symbol: "FCFA", position: "suffix" },
        USD: { code: "USD", symbol: "$", position: "prefix" },
        EUR: { code: "EUR", symbol: "€", position: "suffix" },
        GBP: { code: "GBP", symbol: "£", position: "prefix" },
        NGN: { code: "NGN", symbol: "₦", position: "prefix" },
        GHS: { code: "GHS", symbol: "₵", position: "prefix" },
        KES: { code: "KES", symbol: "KSh", position: "prefix" },
        CAD: { code: "CAD", symbol: "CA$", position: "prefix" }
      };

      const selected = currencies[e.target.value] || { code: e.target.value, symbol: e.target.value, position: "suffix" };
      currency = selected;
      await window.journalDB.setSetting("currency", selected);
      renderAllViews();
      showToast(`Currency updated to ${selected.symbol}`);
    });
  }

  // Settings: Theme Switcher
  const themeToggleBtn = document.getElementById("dark-mode-toggle");
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    window.journalDB.setSetting("theme", theme);
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      setTheme(next);
    });
  }

  // Initial Theme Setup
  const savedTheme = localStorage.getItem("theme") || "light";
  setTheme(savedTheme);

  // Settings: PIN Lock Toggle & Configuration
  const pinToggle = document.getElementById("settings-pin-toggle");
  const setPinModal = document.getElementById("set-pin-modal");
  const newPinInput = document.getElementById("new-pin-input");
  const savePinBtn = document.getElementById("save-pin-btn");
  const closePinModalBtn = document.getElementById("close-pin-modal");

  if (pinToggle) {
    pinToggle.addEventListener("change", async (e) => {
      if (e.target.checked) {
        if (!pinCode) {
          // Open set PIN modal
          if (setPinModal) setPinModal.classList.add("active");
        } else {
          isPinEnabled = true;
          await window.journalDB.setSetting("pin_enabled", true);
          showToast("App PIN security enabled.");
        }
      } else {
        isPinEnabled = false;
        await window.journalDB.setSetting("pin_enabled", false);
        showToast("App PIN security disabled.");
      }
    });
  }

  if (closePinModalBtn) {
    closePinModalBtn.addEventListener("click", () => {
      setPinModal.classList.remove("active");
      if (pinToggle) pinToggle.checked = isPinEnabled;
    });
  }

  if (savePinBtn) {
    savePinBtn.addEventListener("click", async () => {
      const val = (newPinInput.value || "").trim();
      if (!/^\d{4}$/.test(val)) {
        showToast("PIN must be exactly 4 digits.", "error");
        return;
      }

      pinCode = val;
      isPinEnabled = true;
      await window.journalDB.setSetting("security_pin", pinCode);
      await window.journalDB.setSetting("pin_enabled", true);
      setPinModal.classList.remove("active");
      if (pinToggle) pinToggle.checked = true;
      showToast("New PIN saved & enabled!");
    });
  }

  // Settings: Backup & Restore (JSON)
  const exportJsonBtn = document.getElementById("export-json-btn");
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", async () => {
      const jsonStr = await window.journalDB.exportBackupJSON();
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `financial_journal_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Full backup downloaded successfully!");
    });
  }

  const importJsonBtn = document.getElementById("import-json-btn");
  const jsonFileInput = document.getElementById("json-file-input");

  if (importJsonBtn && jsonFileInput) {
    importJsonBtn.addEventListener("click", () => jsonFileInput.click());

    jsonFileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target.result;
          const overwrite = confirm("Do you want to overwrite all existing records? Click 'OK' to overwrite, or 'Cancel' to merge with existing data.");
          const res = await window.journalDB.importBackupJSON(content, overwrite);
          await loadAllData();
          showToast(`Restored ${res.importedCount} transactions!`);
        } catch (err) {
          showToast(err.message || "Failed to restore backup.", "error");
        } finally {
          jsonFileInput.value = "";
        }
      };
      reader.readAsText(file);
    });
  }

  // Settings: CSV Export
  const exportCsvBtn = document.getElementById("export-csv-btn");
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", async () => {
      const csvStr = await window.journalDB.exportCSV();
      if (!csvStr) {
        showToast("No data to export.", "error");
        return;
      }
      const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `financial_journal_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("CSV export downloaded!");
    });
  }

  // Settings: Custom Category Manager
  const addCategoryBtn = document.getElementById("add-custom-cat-btn");
  const catModal = document.getElementById("category-modal");
  const catForm = document.getElementById("category-form");
  const closeCatModalBtn = document.getElementById("close-cat-modal");

  if (addCategoryBtn && catModal) {
    addCategoryBtn.addEventListener("click", () => catModal.classList.add("active"));
  }
  if (closeCatModalBtn) {
    closeCatModalBtn.addEventListener("click", () => catModal.classList.remove("active"));
  }

  if (catForm) {
    catForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("cat-name-input").value.trim();
      const type = document.getElementById("cat-type-select").value;
      const icon = document.getElementById("cat-icon-input").value.trim() || "🏷️";
      const color = document.getElementById("cat-color-input").value;

      if (!name) return;

      const newCat = {
        id: "custom_" + Date.now(),
        name,
        type,
        icon,
        color,
        isCustom: true
      };

      await window.journalDB.saveCategory(newCat);
      categories = await window.journalDB.getAllCategories();
      populateCategoryDropdowns();
      catModal.classList.remove("active");
      catForm.reset();
      showToast(`Category "${name}" created!`);
    });
  }

  // Settings: Clear All Data
  const clearDataBtn = document.getElementById("clear-all-data-btn");
  if (clearDataBtn) {
    clearDataBtn.addEventListener("click", async () => {
      if (confirm("Are you sure you want to permanently clear ALL transaction data? This cannot be undone.")) {
        await window.journalDB.clearAllTransactions();
        transactions = [];
        budgets = [];
        renderAllViews();
        showToast("All data cleared.");
      }
    });
  }

  // --- 6. Transaction Form & Modal (FAB & Edit) ---
  function openAddModal() {
    editingTxId = null;
    txModalTitle.textContent = "New Transaction";
    txSubmitBtn.textContent = "Save Transaction";
    txDeleteBtn.style.display = "none";
    txForm.reset();
    txDate.valueAsDate = new Date();
    setFormType("Expense");
    txModal.classList.add("active");
  }

  async function openEditModal(id) {
    const tx = await window.journalDB.getTransaction(id);
    if (!tx) return;

    editingTxId = id;
    txModalTitle.textContent = "Edit Transaction";
    txSubmitBtn.textContent = "Update Transaction";
    txDeleteBtn.style.display = "block";

    setFormType(tx.type);
    txAmount.value = tx.amount;
    txDate.value = tx.date;
    txDescription.value = tx.description || "";
    txCategory.value = tx.category;

    txModal.classList.add("active");
  }

  if (fabBtn) fabBtn.addEventListener("click", openAddModal);

  const closeTxModalBtn = document.getElementById("close-tx-modal");
  if (closeTxModalBtn) {
    closeTxModalBtn.addEventListener("click", () => txModal.classList.remove("active"));
  }

  // Close modals on overlay backdrop tap
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.remove("active");
      }
    });
  });

  // Transaction Form Submit
  if (txForm) {
    txForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const amountVal = parseFloat(txAmount.value);
      if (isNaN(amountVal) || amountVal <= 0) {
        showToast("Please enter a valid positive amount.", "error");
        return;
      }

      const txData = {
        id: editingTxId,
        amount: amountVal,
        type: txTypeIncome.classList.contains("active") ? "Income" : "Expense",
        date: txDate.value || new Date().toISOString().split("T")[0],
        category: txCategory.value || "Other",
        description: txDescription.value.trim()
      };

      txSubmitBtn.disabled = true;
      try {
        await window.journalDB.saveTransaction(txData);
        transactions = await window.journalDB.getAllTransactions();
        txModal.classList.remove("active");
        renderAllViews();
        showToast(editingTxId ? "Transaction updated!" : "Transaction recorded!");
      } catch (error) {
        console.error("[Storage] Transaction save failed:", error);
        showToast(`Transaction was not saved: ${error.message || "Local storage is unavailable."}`, "error");
      } finally {
        txSubmitBtn.disabled = false;
      }
    });
  }

  // Transaction Delete
  if (txDeleteBtn) {
    txDeleteBtn.addEventListener("click", async () => {
      if (!editingTxId) return;
      if (confirm("Are you sure you want to delete this transaction?")) {
        txDeleteBtn.disabled = true;
        try {
          await window.journalDB.deleteTransaction(editingTxId);
          transactions = await window.journalDB.getAllTransactions();
          txModal.classList.remove("active");
          renderAllViews();
          showToast("Transaction deleted.");
        } catch (error) {
          console.error("[Storage] Transaction delete failed:", error);
          showToast(`Transaction was not deleted: ${error.message || "Local storage is unavailable."}`, "error");
        } finally {
          txDeleteBtn.disabled = false;
        }
      }
    });
  }

  // Quick Action from Dashboard: "See All"
  const seeAllLink = document.getElementById("dash-see-all");
  if (seeAllLink) {
    seeAllLink.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab("transactions");
    });
  }

  // --- Initialize App ---
  try {
    await loadAllData();
  } catch (error) {
    console.error("[Storage] App data could not be loaded:", error);
    showToast(`Your local data could not be loaded: ${error.message || "Storage is unavailable."}`, "error");
  }
});

// Register Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").then((reg) => {
      console.log("[Service Worker] Registered with scope:", reg.scope);
    }).catch(err => {
      console.warn("[Service Worker] Registration failed:", err);
    });
  });
}
