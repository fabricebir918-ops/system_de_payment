"use strict";

/* ==========================================================
   ACADEMICPAY — FINANCE
   PAGE : RAPPROCHEMENT GLOBAL
   ========================================================== */


/* ==========================================================
   1. CONFIGURATION
   ========================================================== */

const THEME_KEY = "academicpay-theme";

const STATUS_LABELS = {
    amount_mismatch: "Écart de montant",
    bank_only: "Banque uniquement",
    system_only: "AcademicPay uniquement",
    duplicate: "Doublon",
    matched: "Rapproché"
};


const STATUS_DESCRIPTIONS = {
    amount_mismatch:
        "Le montant figurant sur l'extrait bancaire diffère du montant enregistré dans AcademicPay.",

    bank_only:
        "La transaction existe dans l'extrait bancaire mais aucun paiement correspondant n'a été retrouvé dans AcademicPay.",

    system_only:
        "Le paiement existe dans AcademicPay mais aucune transaction bancaire correspondante n'a été retrouvée.",

    duplicate:
        "Plusieurs opérations semblent utiliser la même référence ou correspondent potentiellement au même paiement.",

    matched:
        "La transaction bancaire correspond parfaitement à un paiement enregistré dans AcademicPay."
};


/* ==========================================================
   2. STATE
   ========================================================== */

let reconciliationChart = null;
let selectedTransaction = null;
let selectedBank = null;


/* ==========================================================
   3. DOM ELEMENTS
   ========================================================== */

const $ = id => document.getElementById(id);

const academicYearFilter = $("academicYearFilter");
const reconciliationSearch = $("reconciliationSearch");
const clearReconciliationSearch = $("clearReconciliationSearch");
const bankFilter = $("bankFilter");
const periodFilter = $("periodFilter");
const reconciliationStatusFilter = $("reconciliationStatusFilter");
const resetReconciliationFilters = $("resetReconciliationFilters");
const reconciliationEmptyReset = $("reconciliationEmptyReset");
const bankFilterReset = $("bankFilterReset");
const reconciliationTableWrapper = $("reconciliationTableWrapper");
const reconciliationEmptyState = $("reconciliationEmptyState");
const reconciliationTableBody = $("reconciliationTableBody");
const transactionResultCount = $("transactionResultCount");
const bankResultCount = $("bankResultCount");


/* ==========================================================
   4. UTILITIES
   ========================================================== */

function normalizeText(value = "") {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function parseMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
    return new Intl.NumberFormat("fr-FR", {
        maximumFractionDigits: 0
    }).format(parseMoney(value)) + " $";
}

function formatNumber(value) {
    return new Intl.NumberFormat("fr-FR").format(Number(value) || 0);
}

function formatPercentage(value, digits = 1) {
    const number = Number(value) || 0;
    return number.toLocaleString("fr-FR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }) + " %";
}

function parseFrenchDate(value) {
    if (!value) return null;
    const parts = value.split("/");
    if (parts.length !== 3) return null;
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year = Number(parts[2]);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getToday() {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
}

function getSelectedAcademicYear() {
    return academicYearFilter?.value || "";
}


/* ==========================================================
   5. CSRF TOKEN HELPER
   ========================================================== */

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}


/* ==========================================================
   6. GET TRANSACTION ROWS
   ========================================================== */

function getTransactionRows() {
    if (!reconciliationTableBody) return [];
    return Array.from(reconciliationTableBody.querySelectorAll("tr[data-id]"));
}

function getTransactionFromRow(row) {
    if (!row) return null;
    const data = row.dataset;
    const bankAmount = parseMoney(data.bankAmount);
    const systemAmount = parseMoney(data.systemAmount);

    return {
        id: data.id || "",
        date: data.date || "",
        dateObject: parseFrenchDate(data.date),
        reference: data.reference || "",
        bank: data.bank || "",
        bankName: data.bankName || data.bank || "—",
        bankAmount: bankAmount,
        systemAmount: systemAmount,
        difference: Math.abs(bankAmount - systemAmount),
        student: data.student || "",
        matricule: data.matricule || "",
        status: data.status || ""
    };
}


/* ==========================================================
   7. DATE FILTERS
   ========================================================== */

function getAcademicYearRange(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{4})$/);
    if (!match) return null;
    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
    return {
        start: new Date(startYear, 6, 1, 0, 0, 0),
        end: new Date(endYear, 5, 30, 23, 59, 59)
    };
}

function isDateInsideAcademicYear(date, academicYear) {
    if (!date) return false;
    const range = getAcademicYearRange(academicYear);
    if (!range) return true;
    return date >= range.start && date <= range.end;
}

function isDateInsidePeriod(date, period) {
    if (!period) return true;
    if (!date) return false;

    const today = getToday();

    if (period === "today") {
        return date.getFullYear() === today.getFullYear() &&
               date.getMonth() === today.getMonth() &&
               date.getDate() === today.getDate();
    }

    if (period === "7days") {
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        return date >= start && date <= today;
    }

    if (period === "30days") {
        const start = new Date(today);
        start.setDate(start.getDate() - 29);
        return date >= start && date <= today;
    }

    if (period === "semester") {
        const academicYear = getSelectedAcademicYear();
        const range = getAcademicYearRange(academicYear);
        if (!range) return true;

        const now = getToday();
        let start, end;

        if (now >= range.start && now <= new Date(range.start.getFullYear(), 11, 31, 23, 59, 59)) {
            start = range.start;
            end = new Date(range.start.getFullYear(), 11, 31, 23, 59, 59);
        } else {
            start = new Date(range.end.getFullYear(), 0, 1, 0, 0, 0);
            end = range.end;
        }
        return date >= start && date <= end;
    }

    return true;
}


/* ==========================================================
   8. FILTER MATCHING
   ========================================================== */

function transactionMatchesFilters(transaction) {
    if (!transaction) return false;

    const search = normalizeText(reconciliationSearch?.value);
    const selectedBank = bankFilter?.value || "";
    const selectedPeriod = periodFilter?.value || "";
    const selectedStatus = reconciliationStatusFilter?.value || "";
    const selectedAcademicYear = getSelectedAcademicYear();

    // Academic year
    if (selectedAcademicYear && !isDateInsideAcademicYear(transaction.dateObject, selectedAcademicYear)) {
        return false;
    }

    // Bank
    if (selectedBank && transaction.bank !== selectedBank) {
        return false;
    }

    // Status
    if (selectedStatus && transaction.status !== selectedStatus) {
        return false;
    }

    // Period
    if (selectedPeriod && !isDateInsidePeriod(transaction.dateObject, selectedPeriod)) {
        return false;
    }

    // Search
    if (search) {
        const searchable = normalizeText([
            transaction.reference,
            transaction.bankName,
            transaction.student,
            transaction.matricule,
            STATUS_LABELS[transaction.status] || ""
        ].join(" "));
        if (!searchable.includes(search)) return false;
    }

    return true;
}


/* ==========================================================
   9. APPLY FILTERS
   ========================================================== */

function applyFilters() {
    const rows = getTransactionRows();
    let visibleCount = 0;

    rows.forEach(row => {
        const transaction = getTransactionFromRow(row);
        const visible = transactionMatchesFilters(transaction);
        row.hidden = !visible;
        if (visible) visibleCount++;
    });

    if (transactionResultCount) {
        transactionResultCount.textContent = String(visibleCount);
    }

    const hasResults = visibleCount > 0;

    if (reconciliationTableWrapper) {
        reconciliationTableWrapper.hidden = !hasResults;
    }

    if (reconciliationEmptyState) {
        reconciliationEmptyState.hidden = hasResults;
    }

    applyBankCardsFilter();
    updateClearSearchButton();
    updateBankResetButton();
}


/* ==========================================================
   10. BANK CARDS FILTER
   ========================================================== */

function applyBankCardsFilter() {
    const cards = Array.from(document.querySelectorAll("[data-bank-card]"));
    const selected = bankFilter?.value || "";
    let visible = 0;

    cards.forEach(card => {
        const bank = card.dataset.bankCard;
        const show = !selected || selected === bank;
        card.hidden = !show;
        if (show) visible += 1;
    });

    if (bankResultCount) {
        bankResultCount.textContent = String(visible);
    }

    updateBankResetButton();
}


/* ==========================================================
   11. UI UPDATES
   ========================================================== */

function updateClearSearchButton() {
    if (!clearReconciliationSearch) return;
    const hasValue = Boolean(reconciliationSearch?.value?.trim());
    clearReconciliationSearch.style.display = hasValue ? "flex" : "none";
}

function updateBankResetButton() {
    if (!bankFilterReset) return;
    bankFilterReset.hidden = !bankFilter?.value;
}


/* ==========================================================
   12. RESET FILTERS
   ========================================================== */

function resetAllReconciliationFilters() {
    if (reconciliationSearch) reconciliationSearch.value = "";
    if (bankFilter) bankFilter.value = "";
    if (periodFilter) periodFilter.value = "";
    if (reconciliationStatusFilter) reconciliationStatusFilter.value = "";
    applyFilters();
    showToast("Les filtres ont été réinitialisés.");
}

function resetBankFilter() {
    if (bankFilter) bankFilter.value = "";
    applyFilters();
    showToast("Toutes les banques sont affichées.");
}


/* ==========================================================
   13. TOAST
   ========================================================== */

function showToast(message) {
    const toast = $("financeToast");
    const text = $("toastMessage");
    if (!toast || !text || typeof bootstrap === "undefined") return;
    text.textContent = message;
    bootstrap.Toast.getOrCreateInstance(toast, { delay: 2600 }).show();
}


/* ==========================================================
   14. MODALS
   ========================================================== */

function openTransactionModal(row) {
    const transaction = getTransactionFromRow(row);
    if (!transaction) return;

    selectedTransaction = transaction;

    setText("modalBankReference", transaction.reference || "—");
    setText("modalBankName", transaction.bankName);
    setText("modalBankDate", transaction.date || "—");
    setText("modalBankAmount", transaction.bankAmount > 0 ? formatMoney(transaction.bankAmount) : "—");
    setText("modalStudentName", transaction.student || "Non identifié");
    setText("modalStudentMatricule", transaction.matricule || "—");
    setText("modalSystemReference", transaction.systemAmount > 0 ? transaction.reference : "—");
    setText("modalSystemAmount", transaction.systemAmount > 0 ? formatMoney(transaction.systemAmount) : "—");
    setText("modalDiagnostic", STATUS_LABELS[transaction.status] || "À examiner");
    setText("modalDiagnosticDescription", STATUS_DESCRIPTIONS[transaction.status] || "Cette transaction nécessite une vérification.");
    setText("modalDifference", formatMoney(transaction.difference));

    const diffBox = $("modalDifferenceBox");
    if (diffBox) {
        diffBox.hidden = transaction.difference === 0 && transaction.status !== "duplicate";
    }

    const modal = $("transactionDetailModal");
    if (modal && typeof bootstrap !== "undefined") {
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}


/* ==========================================================
   15. THEME
   ========================================================== */

function applyTheme(theme) {
    const isLight = theme === "light";
    document.documentElement.setAttribute("data-theme", theme);
    document.body.classList.toggle("light-theme", isLight);
    localStorage.setItem(THEME_KEY, theme);
    updateThemeButton(theme);
    refreshChartTheme();
}

function getPreferredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
    return "dark";
}

function updateThemeButton(theme) {
    const button = $("themeButton");
    if (!button) return;
    const icon = button.querySelector("i");
    if (theme === "dark") {
        if (icon) icon.className = "bi bi-sun";
        button.title = "Passer au mode clair";
    } else {
        if (icon) icon.className = "bi bi-moon-stars";
        button.title = "Passer au mode sombre";
    }
}

function toggleTheme() {
    const current = document.body.classList.contains("light-theme") ? "light" : "dark";
    applyTheme(current === "dark" ? "light" : "dark");
}


/* ==========================================================
   16. CHART
   ========================================================== */

function getChartData() {
    // Get data from the bank summary in the DOM
    const bankItems = document.querySelectorAll("[data-bank-card]");
    const labels = [];
    const statementData = [];
    const systemData = [];

    bankItems.forEach(item => {
        if (item.hidden) return;
        const name = item.querySelector('.bank-cell-info strong')?.textContent || '';
        const metrics = item.querySelectorAll('.bank-reconciliation-metric strong');
        if (metrics.length >= 2) {
            labels.push(name);
            const statementValue = parseMoney(metrics[0]?.textContent?.replace('$', '').trim() || 0);
            const systemValue = parseMoney(metrics[1]?.textContent?.replace('$', '').trim() || 0);
            statementData.push(statementValue);
            systemData.push(systemValue);
        }
    });

    return { labels, statement: statementData, system: systemData };
}

function createChart() {
    const canvas = $("reconciliationChart");
    if (!canvas || typeof Chart === "undefined") return;

    const data = getChartData();

    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#84cc16";
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#777";
    const border = getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "rgba(128,128,128,.2)";
    const text = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#ddd";

    reconciliationChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: "Extraits bancaires",
                    data: data.statement,
                    backgroundColor: accent,
                    borderRadius: 5,
                    borderSkipped: false
                },
                {
                    label: "AcademicPay",
                    data: data.system,
                    backgroundColor: muted,
                    borderRadius: 5,
                    borderSkipped: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(context) {
                            return `${context.dataset.label}: ${formatMoney(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: text, font: { size: 10 } },
                    border: { color: border }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: border },
                    ticks: {
                        color: text,
                        font: { size: 10 },
                        callback(value) {
                            if (Math.abs(value) >= 1000000) {
                                return (value / 1000000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " M";
                            }
                            if (Math.abs(value) >= 1000) {
                                return (value / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " k";
                            }
                            return value;
                        }
                    },
                    border: { display: false }
                }
            }
        }
    });
}

function updateChart() {
    if (!reconciliationChart) {
        createChart();
        return;
    }
    const data = getChartData();
    reconciliationChart.data.labels = data.labels;
    reconciliationChart.data.datasets[0].data = data.statement;
    reconciliationChart.data.datasets[1].data = data.system;
    reconciliationChart.update();
}

function refreshChartTheme() {
    if (!reconciliationChart) return;

    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#84cc16";
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#777";
    const border = getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "rgba(128,128,128,.2)";
    const text = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#ddd";

    reconciliationChart.data.datasets[0].backgroundColor = accent;
    reconciliationChart.data.datasets[1].backgroundColor = muted;
    reconciliationChart.options.scales.x.ticks.color = text;
    reconciliationChart.options.scales.x.border.color = border;
    reconciliationChart.options.scales.y.ticks.color = text;
    reconciliationChart.options.scales.y.grid.color = border;
    reconciliationChart.update();
}


/* ==========================================================
   17. EVENTS
   ========================================================== */

// Academic year
academicYearFilter?.addEventListener("change", () => {
    localStorage.setItem("academicPayFinanceYear", academicYearFilter.value);
    // Reload page with new academic year
    window.location.search = `?academic_year=${academicYearFilter.value}`;
});

// Search
reconciliationSearch?.addEventListener("input", applyFilters);

// Clear search
clearReconciliationSearch?.addEventListener("click", () => {
    if (reconciliationSearch) {
        reconciliationSearch.value = "";
        reconciliationSearch.focus();
        applyFilters();
    }
});

// Filters
bankFilter?.addEventListener("change", applyFilters);
periodFilter?.addEventListener("change", applyFilters);
reconciliationStatusFilter?.addEventListener("change", applyFilters);

// Reset buttons
resetReconciliationFilters?.addEventListener("click", resetAllReconciliationFilters);
reconciliationEmptyReset?.addEventListener("click", resetAllReconciliationFilters);
bankFilterReset?.addEventListener("click", resetBankFilter);

// View transaction
document.addEventListener("click", (event) => {
    const button = event.target.closest(".reconciliation-view-button");
    if (!button) return;
    const row = button.closest("tr[data-id]");
    if (!row) return;
    openTransactionModal(row);
});

// View bank detail
document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bank-view]");
    if (!button) return;
    const bankKey = button.dataset.bankView;
    // Open bank detail modal
    const modal = $("bankDetailModal");
    if (modal && typeof bootstrap !== "undefined") {
        // Fill modal with data from the bank card
        const card = document.querySelector(`[data-bank-card="${bankKey}"]`);
        if (card) {
            const name = card.querySelector('.bank-cell-info strong')?.textContent || '';
            const metrics = card.querySelectorAll('.bank-reconciliation-metric strong');
            const coverage = card.querySelector('.coverage-cell-header strong')?.textContent || '0%';
            const anomalies = card.querySelector('.reconciliation-status')?.textContent?.trim() || '0 anomalies';
            const transactions = card.querySelector('.bank-reconciliation-metric:first-child span')?.textContent || '';

            setText("bankDetailName", name);
            if (metrics.length >= 2) {
                setText("bankDetailStatement", metrics[0]?.textContent || '—');
                setText("bankDetailSystem", metrics[1]?.textContent || '—');
            }
            if (metrics.length >= 3) {
                setText("bankDetailDifference", metrics[2]?.textContent || '—');
            }
            setText("bankDetailCoverage", coverage);
            setText("bankDetailTransactions", transactions);
            setText("bankDetailAnomalies", anomalies.replace('anomalies', '').trim() || '0');
        }
        bootstrap.Modal.getOrCreateInstance(modal).show();
        selectedBank = bankKey;
    }
});

// Filter bank transactions
$("filterBankTransactionsButton")?.addEventListener("click", () => {
    if (selectedBank && bankFilter) {
        bankFilter.value = selectedBank;
        const modal = $("bankDetailModal");
        if (modal && typeof bootstrap !== "undefined") {
            bootstrap.Modal.getOrCreateInstance(modal).hide();
        }
        applyFilters();
        document.querySelector(".unmatched-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
        showToast(`Filtre appliqué : ${selectedBank}.`);
    }
});

// Open anomaly
$("openAnomalyButton")?.addEventListener("click", () => {
    if (selectedTransaction) {
        const modal = $("transactionDetailModal");
        if (modal && typeof bootstrap !== "undefined") {
            bootstrap.Modal.getOrCreateInstance(modal).hide();
        }
        // Redirect to anomalies page with filter
        window.location.href = `{% url 'finance_anomalies' %}?search=${encodeURIComponent(selectedTransaction.reference)}`;
    }
});

// Theme
$("themeButton")?.addEventListener("click", toggleTheme);

// Export CSV
$("exportCsvButton")?.addEventListener("click", () => {
    showToast("Export CSV en cours de développement.");
});

// Export PDF
$("exportPdfButton")?.addEventListener("click", () => {
    showToast("Export PDF en cours de développement.");
});


/* ==========================================================
   18. INITIALIZATION
   ========================================================== */

function initReconciliationPage() {
    // Theme
    applyTheme(getPreferredTheme());

    // Restore saved academic year
    const savedYear = localStorage.getItem("academicPayFinanceYear");
    if (savedYear && academicYearFilter) {
        const optionExists = [...academicYearFilter.options].some(opt => opt.value === savedYear);
        if (optionExists) {
            academicYearFilter.value = savedYear;
        }
    }

    // If no year selected, select first
    if (academicYearFilter && !academicYearFilter.value && academicYearFilter.options.length) {
        academicYearFilter.selectedIndex = 0;
    }

    // Apply filters
    applyFilters();

    // Create chart
    createChart();

    // Update UI
    updateClearSearchButton();
    updateBankResetButton();
}

// Start
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReconciliationPage);
} else {
    initReconciliationPage();
}