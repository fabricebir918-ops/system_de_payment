/* ==========================================================
   ACADEMICPAY — FINANCE / RAPPROCHEMENT GLOBAL
   finance-reconciliation.js

   Données réelles injectées par Django (finance_reconciliation)
   dans le bloc <script id="finance-reconciliation-bootstrap"
   type="application/json"> du template
   finance-reconciliation.html.

   Le rapprochement lui-même (BankTransaction <-> PaymentClaim)
   est calculé côté serveur ; ce fichier ne fait que filtrer,
   afficher et exporter les résultats déjà calculés.
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    "use strict";

    /* ======================================================
       1. OUTILS GÉNÉRAUX
    ====================================================== */

    const $ = id => document.getElementById(id);


    /* ======================================================
       2. DONNÉES INJECTÉES PAR LE SERVEUR
    ====================================================== */

    function readBootstrapData() {

        const node = $("finance-reconciliation-bootstrap");

        const empty = {
            academicYear: "",
            items: [],
            banks: [],
            bankSummary: [],
            kpi: {
                totalBankAmount: "0",
                totalSystemAmount: "0",
                totalDifference: "0",
                coverageRate: "0",
                matchedCount: 0,
                anomalyCount: 0,
                bankCount: 0
            }
        };

        if (!node) {
            console.error(
                "AcademicPay : bloc de données " +
                "finance-reconciliation-bootstrap introuvable."
            );
            return empty;
        }

        try {
            return JSON.parse(node.textContent);
        } catch (error) {
            console.error(
                "AcademicPay : données bootstrap invalides.",
                error
            );
            return empty;
        }
    }


    const BOOTSTRAP = readBootstrapData();

    const ANOMALIES_URL =
        document.body.dataset.anomaliesUrl || "";


    /* ======================================================
       3. RÉFÉRENTIEL (fourni par Django)
    ====================================================== */

    const banks = BOOTSTRAP.banks;


    const STATUS_LABELS = {
        matched: "Rapproché",
        amount_mismatch: "Écart de montant",
        bank_only: "Banque uniquement",
        system_only: "AcademicPay uniquement"
    };


    const STATUS_DESCRIPTIONS = {
        matched:
            "Cette transaction a été retrouvée à l'identique des deux côtés.",

        amount_mismatch:
            "Le montant figurant sur l'extrait bancaire diffère du montant enregistré dans AcademicPay.",

        bank_only:
            "La transaction existe dans l'extrait bancaire mais aucun paiement correspondant n'a été retrouvé dans AcademicPay.",

        system_only:
            "Le paiement existe dans AcademicPay mais aucune transaction bancaire correspondante n'a été retrouvée."
    };


    function bankInitials(name) {

        const words = String(name ?? "")
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (words.length === 0) {
            return "—";
        }

        if (words.length === 1) {
            return words[0].slice(0, 2).toUpperCase();
        }

        return (
            words[0].charAt(0) +
            words[1].charAt(0)
        ).toUpperCase();
    }


    /* ======================================================
       4. UTILITAIRES
    ====================================================== */

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
        return new Intl.NumberFormat(
            "fr-FR",
            { maximumFractionDigits: 0 }
        ).format(parseMoney(value)) + " $";
    }


    function formatNumber(value) {
        return new Intl.NumberFormat("fr-FR").format(Number(value) || 0);
    }


    function formatPercentage(value, digits = 1) {
        const number = Number(value) || 0;

        return number.toLocaleString(
            "fr-FR",
            {
                minimumFractionDigits: digits,
                maximumFractionDigits: digits
            }
        ) + " %";
    }


    function formatDate(value) {

        if (!value) {
            return "—";
        }

        return new Intl.DateTimeFormat(
            "fr-FR",
            { day: "2-digit", month: "2-digit", year: "numeric" }
        ).format(new Date(value + "T12:00:00"));
    }


    function getToday() {
        const today = new Date();
        return new Date(
            today.getFullYear(), today.getMonth(), today.getDate(),
            12, 0, 0
        );
    }


    function isDateInsidePeriod(date, period) {

        if (!period) {
            return true;
        }

        if (!date) {
            return false;
        }

        const today = getToday();

        if (period === "today") {
            return (
                date.getFullYear() === today.getFullYear() &&
                date.getMonth() === today.getMonth() &&
                date.getDate() === today.getDate()
            );
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

            const now = getToday();
            const year = now.getMonth() >= 6
                ? now.getFullYear()
                : now.getFullYear() - 1;

            let start;
            let end;

            if (now.getMonth() >= 6) {
                start = new Date(year, 6, 1, 0, 0, 0);
                end = new Date(year, 11, 31, 23, 59, 59);
            } else {
                start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
                end = new Date(now.getFullYear(), 5, 30, 23, 59, 59);
            }

            return date >= start && date <= end;
        }

        return true;
    }


    function setText(id, value) {
        const element = $(id);
        if (element) {
            element.textContent = value;
        }
    }


    function getModal(id) {
        const element = $(id);
        if (!element || typeof bootstrap === "undefined") {
            return null;
        }
        return bootstrap.Modal.getOrCreateInstance(element);
    }


    function showToast(message) {
        const toast = $("financeToast");
        const text = $("toastMessage");
        if (!toast || !text) {
            return;
        }
        text.textContent = message;
        if (typeof bootstrap !== "undefined") {
            bootstrap.Toast.getOrCreateInstance(toast, { delay: 2300 }).show();
        }
    }


    /* ======================================================
       5. ÉTAT
    ====================================================== */

    function adaptItem(raw) {

        return {
            id: raw.id,
            date: raw.date,
            dateObject: new Date(raw.date + "T12:00:00"),
            reference: raw.reference,
            bank: raw.bank.code,
            bankName: raw.bank.name,
            bankAmount: Number(raw.bankAmount),
            systemAmount: Number(raw.systemAmount),
            difference: Number(raw.difference),
            student: raw.student,
            matricule: raw.matricule,
            status: raw.status,
            statusLabel: raw.statusLabel,
            claimId: raw.claimId
        };
    }


    const items = BOOTSTRAP.items.map(adaptItem);

    let selectedTransaction = null;
    let selectedBank = null;

    let reconciliationChart = null;


    /* ======================================================
       6. DOM
    ====================================================== */

    const academicYearFilter = $("academicYearFilter");
    const reconciliationSearch = $("reconciliationSearch");
    const clearReconciliationSearch = $("clearReconciliationSearch");
    const bankFilter = $("bankFilter");
    const periodFilter = $("periodFilter");
    const reconciliationStatusFilter = $("reconciliationStatusFilter");
    const resetReconciliationFilters = $("resetReconciliationFilters");
    const reconciliationEmptyReset = $("reconciliationEmptyReset");
    const bankFilterReset = $("bankFilterReset");

    const reconciliationTableBody = $("reconciliationTableBody");
    const reconciliationTableWrapper = $("reconciliationTableWrapper");
    const reconciliationEmptyState = $("reconciliationEmptyState");
    const transactionResultCount = $("transactionResultCount");
    const bankResultCount = $("bankResultCount");

    const bankReconciliationList = $("bankReconciliationList");

    const totalBankAmount = $("totalBankAmount");
    const totalSystemAmount = $("totalSystemAmount");
    const totalDifference = $("totalDifference");
    const coverageRate = $("coverageRate");
    const globalCoverage = $("globalCoverage");
    const matchedCount = $("matchedCount");
    const anomalyCount = $("anomalyCount");
    const bankCount = $("bankCount");

    const exportCsvButton = $("exportCsvButton");
    const exportPdfButton = $("exportPdfButton");

    const transactionDetailModalEl = $("transactionDetailModal");
    const bankDetailModalEl = $("bankDetailModal");

    const modalBankReference = $("modalBankReference");
    const modalBankName = $("modalBankName");
    const modalBankDate = $("modalBankDate");
    const modalBankAmount = $("modalBankAmount");
    const modalStudentName = $("modalStudentName");
    const modalStudentMatricule = $("modalStudentMatricule");
    const modalSystemReference = $("modalSystemReference");
    const modalSystemAmount = $("modalSystemAmount");
    const modalDiagnostic = $("modalDiagnostic");
    const modalDiagnosticDescription = $("modalDiagnosticDescription");
    const modalDifference = $("modalDifference");
    const modalDifferenceBox = $("modalDifferenceBox");
    const openAnomalyButton = $("openAnomalyButton");

    const bankDetailName = $("bankDetailName");
    const bankDetailStatement = $("bankDetailStatement");
    const bankDetailSystem = $("bankDetailSystem");
    const bankDetailDifference = $("bankDetailDifference");
    const bankDetailCoverage = $("bankDetailCoverage");
    const bankDetailTransactions = $("bankDetailTransactions");
    const bankDetailAnomalies = $("bankDetailAnomalies");
    const filterBankTransactionsButton = $("filterBankTransactionsButton");

    const themeButton = $("themeButton");


    /* ======================================================
       7. ANNÉE ACADÉMIQUE

       Le rapprochement est calculé côté serveur pour l'année
       académique active. Changer d'année recharge donc la page
       avec le bon paramètre plutôt que de refiltrer côté client.
    ====================================================== */

    academicYearFilter?.addEventListener(
        "change",
        () => {

            const url = new URL(window.location.href);

            url.searchParams.set(
                "academic_year",
                academicYearFilter.value
            );

            window.location.href = url.toString();
        }
    );


    /* ======================================================
       8. CARTES BANQUE (générées depuis bankSummary réel)
    ====================================================== */

    function renderBankCards() {

        if (!bankReconciliationList) {
            return;
        }

        bankReconciliationList.innerHTML = "";

        const selected = bankFilter?.value || "";
        let visible = 0;

        BOOTSTRAP.bankSummary.forEach(bank => {

            const show = !selected || selected === bank.code;

            if (!show) {
                return;
            }

            visible += 1;

            const anomalies = bank.anomalies;
            const statusClass =
                anomalies === 0 ? "success" :
                anomalies <= 5 ? "warning" : "danger";

            const article = document.createElement("article");
            article.className = "bank-reconciliation-item";
            article.dataset.bankCard = bank.code;

            article.innerHTML = `
                <div class="bank-cell-info">
                    <div class="bank-logo">${bankInitials(bank.name)}</div>
                    <div>
                        <strong>${bank.name}</strong>
                        <span>Banque partenaire</span>
                    </div>
                </div>
                <div class="bank-reconciliation-metric">
                    <span>Extraits bancaires</span>
                    <strong>${formatMoney(bank.bankAmount)}</strong>
                </div>
                <div class="bank-reconciliation-metric">
                    <span>AcademicPay</span>
                    <strong>${formatMoney(bank.systemAmount)}</strong>
                </div>
                <div class="bank-reconciliation-metric">
                    <span>Écart</span>
                    <strong>${formatMoney(bank.difference)}</strong>
                </div>
                <div class="coverage-cell">
                    <div class="coverage-cell-header">
                        <span>Couverture</span>
                        <strong>${formatPercentage(bank.coverage)}</strong>
                    </div>
                    <div class="coverage-progress">
                        <span style="width: ${Math.min(Number(bank.coverage), 100)}%;"></span>
                    </div>
                </div>
                <div class="bank-reconciliation-status">
                    <span class="reconciliation-status ${statusClass}">
                        <i class="bi bi-${anomalies === 0 ? "check-circle" : "exclamation-circle"}"></i>
                        ${anomalies} anomalie${anomalies > 1 ? "s" : ""}
                    </span>
                </div>
                <button
                    type="button"
                    class="bank-view-button"
                    data-bank-view="${bank.code}"
                    title="Voir le détail ${bank.name}"
                    aria-label="Voir le détail ${bank.name}"
                >
                    <i class="bi bi-eye"></i>
                </button>
            `;

            bankReconciliationList.appendChild(article);
        });

        if (bankResultCount) {
            bankResultCount.textContent = String(visible);
        }

        updateBankResetButton();
    }


    function updateBankResetButton() {
        if (!bankFilterReset) {
            return;
        }
        bankFilterReset.hidden = !bankFilter?.value;
    }


    /* ======================================================
       9. FILTRAGE + RENDU DU TABLEAU
    ====================================================== */

    function itemMatchesFilters(item) {

        const search = normalizeText(reconciliationSearch?.value);
        const selectedBank = bankFilter?.value || "";
        const selectedPeriod = periodFilter?.value || "";
        const selectedStatus = reconciliationStatusFilter?.value || "";

        if (selectedBank && item.bank !== selectedBank) {
            return false;
        }

        if (selectedStatus && item.status !== selectedStatus) {
            return false;
        }

        if (selectedPeriod && !isDateInsidePeriod(item.dateObject, selectedPeriod)) {
            return false;
        }

        if (search) {

            const haystack = normalizeText([
                item.reference,
                item.bankName,
                item.student,
                item.matricule,
                STATUS_LABELS[item.status] || ""
            ].join(" "));

            if (!haystack.includes(search)) {
                return false;
            }
        }

        return true;
    }


    function applyFilters() {

        const filtered = items.filter(itemMatchesFilters);

        renderTable(filtered);
        renderBankCards();
        updateClearSearchButton();
    }


    function renderTable(rows) {

        if (!reconciliationTableBody) {
            return;
        }

        reconciliationTableBody.innerHTML = "";

        rows.forEach(item => {

            const tr = document.createElement("tr");
            tr.dataset.id = item.id;

            const diagnosticClass =
                item.status === "matched" ? "success" :
                item.status === "bank_only" ? "danger" : "warning";

            tr.innerHTML = `
                <td>${formatDate(item.date)}</td>
                <td><span class="transaction-reference">${item.reference}</span></td>
                <td>${item.bankName}</td>
                <td class="reconciliation-money">${item.bankAmount > 0 ? formatMoney(item.bankAmount) : "—"}</td>
                <td>
                    ${
                        item.student
                            ? `<div class="reconciliation-student-info">
                                   <strong>${item.student}</strong>
                                   <span>${item.matricule}</span>
                               </div>`
                            : `<span class="muted-value">Non identifié</span>`
                    }
                </td>
                <td class="reconciliation-money">${item.systemAmount > 0 ? formatMoney(item.systemAmount) : "—"}</td>
                <td class="reconciliation-money difference">${formatMoney(item.difference)}</td>
                <td>
                    <span class="diagnostic-badge ${diagnosticClass}">
                        ${STATUS_LABELS[item.status] || item.statusLabel}
                    </span>
                </td>
                <td>
                    <button
                        type="button"
                        class="reconciliation-view-button"
                        title="Examiner"
                        aria-label="Examiner ${item.reference}"
                    >
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            `;

            reconciliationTableBody.appendChild(tr);
        });

        if (transactionResultCount) {
            transactionResultCount.textContent = String(rows.length);
        }

        const hasResults = rows.length > 0;

        if (reconciliationTableWrapper) {
            reconciliationTableWrapper.hidden = !hasResults;
        }

        if (reconciliationEmptyState) {
            reconciliationEmptyState.hidden = hasResults;
        }
    }


    function updateClearSearchButton() {
        if (!clearReconciliationSearch) {
            return;
        }
        const hasValue = Boolean(reconciliationSearch?.value?.trim());
        clearReconciliationSearch.style.display = hasValue ? "flex" : "none";
    }


    /* ======================================================
       10. KPI GLOBAUX (déjà calculés côté serveur)
    ====================================================== */

    function renderKPI() {

        const kpi = BOOTSTRAP.kpi;

        setText("totalBankAmount", formatMoney(kpi.totalBankAmount));
        setText("totalSystemAmount", formatMoney(kpi.totalSystemAmount));
        setText("totalDifference", formatMoney(kpi.totalDifference));
        setText("coverageRate", formatPercentage(kpi.coverageRate));

        if (globalCoverage) {
            globalCoverage.textContent =
                Number(kpi.coverageRate).toLocaleString(
                    "fr-FR",
                    { minimumFractionDigits: 1, maximumFractionDigits: 1 }
                );
        }

        setText("matchedCount", formatNumber(kpi.matchedCount));
        setText("anomalyCount", formatNumber(kpi.anomalyCount));
        setText("bankCount", String(kpi.bankCount));
    }


    /* ======================================================
       11. GRAPHIQUE (Chart.js, alimenté par bankSummary réel)
    ====================================================== */

    function getCssVariable(name) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim();
    }


    function getChartData() {

        const summary = BOOTSTRAP.bankSummary;

        return {
            labels: summary.map(bank => bank.name),
            statement: summary.map(bank => Math.round(Number(bank.bankAmount))),
            system: summary.map(bank => Math.round(Number(bank.systemAmount)))
        };
    }


    function createChart() {

        const canvas = $("reconciliationChart");

        if (!canvas || typeof Chart === "undefined") {
            return;
        }

        const data = getChartData();

        const accent = getCssVariable("--accent") || "#84cc16";
        const muted = getCssVariable("--muted") || "#777";
        const border = getCssVariable("--border") || "rgba(128,128,128,.2)";
        const text = getCssVariable("--text") || "#ddd";

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
                                    return (value / 1000000).toLocaleString(
                                        "fr-FR", { maximumFractionDigits: 1 }
                                    ) + " M";
                                }
                                if (Math.abs(value) >= 1000) {
                                    return (value / 1000).toLocaleString(
                                        "fr-FR", { maximumFractionDigits: 0 }
                                    ) + " k";
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


    function refreshChartTheme() {

        if (!reconciliationChart) {
            return;
        }

        const accent = getCssVariable("--accent");
        const muted = getCssVariable("--muted");
        const border = getCssVariable("--border");
        const text = getCssVariable("--text");

        reconciliationChart.data.datasets[0].backgroundColor = accent;
        reconciliationChart.data.datasets[1].backgroundColor = muted;
        reconciliationChart.options.scales.x.ticks.color = text;
        reconciliationChart.options.scales.x.border.color = border;
        reconciliationChart.options.scales.y.ticks.color = text;
        reconciliationChart.options.scales.y.grid.color = border;

        reconciliationChart.update();
    }


    /* ======================================================
       12. MODALE TRANSACTION (réutilise les données déjà chargées)
    ====================================================== */

    function openTransactionModal(itemId) {

        const item = items.find(entry => entry.id === itemId);

        if (!item) {
            return;
        }

        selectedTransaction = item;

        setText("modalBankReference", item.reference || "—");
        setText("modalBankName", item.bankName);
        setText("modalBankDate", formatDate(item.date));

        setText(
            "modalBankAmount",
            item.bankAmount > 0 ? formatMoney(item.bankAmount) : "—"
        );

        setText("modalStudentName", item.student || "Non identifié");
        setText("modalStudentMatricule", item.matricule || "—");

        setText(
            "modalSystemReference",
            item.systemAmount > 0 ? item.reference : "—"
        );

        setText(
            "modalSystemAmount",
            item.systemAmount > 0 ? formatMoney(item.systemAmount) : "—"
        );

        setText("modalDiagnostic", STATUS_LABELS[item.status] || "À examiner");

        setText(
            "modalDiagnosticDescription",
            STATUS_DESCRIPTIONS[item.status] ||
            "Cette transaction nécessite une vérification."
        );

        setText("modalDifference", formatMoney(item.difference));

        if (modalDifferenceBox) {
            modalDifferenceBox.hidden = item.difference === 0;
        }

        getModal("transactionDetailModal")?.show();
    }


    reconciliationTableBody?.addEventListener("click", event => {

        const button = event.target.closest(".reconciliation-view-button");

        if (!button) {
            return;
        }

        const row = button.closest("tr[data-id]");

        if (row) {
            openTransactionModal(row.dataset.id);
        }
    });


    /* ======================================================
       13. MODALE BANQUE
    ====================================================== */

    function openBankModal(bankCode) {

        const bank = BOOTSTRAP.bankSummary.find(entry => entry.code === bankCode);

        if (!bank) {
            return;
        }

        selectedBank = bankCode;

        setText("bankDetailName", bank.name);
        setText("bankDetailStatement", formatMoney(bank.bankAmount));
        setText("bankDetailSystem", formatMoney(bank.systemAmount));
        setText("bankDetailDifference", formatMoney(bank.difference));
        setText("bankDetailCoverage", formatPercentage(bank.coverage));
        setText("bankDetailTransactions", formatNumber(bank.transactions));
        setText("bankDetailAnomalies", formatNumber(bank.anomalies));

        getModal("bankDetailModal")?.show();
    }


    bankReconciliationList?.addEventListener("click", event => {

        const button = event.target.closest("[data-bank-view]");

        if (button) {
            openBankModal(button.dataset.bankView);
        }
    });


    filterBankTransactionsButton?.addEventListener("click", () => {

        if (!selectedBank) {
            return;
        }

        if (bankFilter) {
            bankFilter.value = selectedBank;
        }

        applyFilters();

        getModal("bankDetailModal")?.hide();
    });


    /* ======================================================
       14. EXAMINER ANOMALIE
    ====================================================== */

    openAnomalyButton?.addEventListener("click", () => {

        if (!selectedTransaction || !ANOMALIES_URL) {
            return;
        }

        const params = new URLSearchParams();
        params.set("transaction", selectedTransaction.id);
        params.set("reference", selectedTransaction.reference);

        window.location.href = `${ANOMALIES_URL}?${params.toString()}`;
    });


    /* ======================================================
       15. RECHERCHE / FILTRES / RESET
    ====================================================== */

    reconciliationSearch?.addEventListener("input", applyFilters);

    clearReconciliationSearch?.addEventListener("click", () => {
        if (reconciliationSearch) {
            reconciliationSearch.value = "";
            reconciliationSearch.focus();
        }
        applyFilters();
    });

    reconciliationSearch?.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            reconciliationSearch.value = "";
            applyFilters();
        }
    });

    bankFilter?.addEventListener("change", applyFilters);
    periodFilter?.addEventListener("change", applyFilters);
    reconciliationStatusFilter?.addEventListener("change", applyFilters);


    function resetAllFilters() {

        if (reconciliationSearch) reconciliationSearch.value = "";
        if (bankFilter) bankFilter.value = "";
        if (periodFilter) periodFilter.value = "";
        if (reconciliationStatusFilter) reconciliationStatusFilter.value = "";

        applyFilters();
    }


    resetReconciliationFilters?.addEventListener("click", resetAllFilters);
    reconciliationEmptyReset?.addEventListener("click", resetAllFilters);

    bankFilterReset?.addEventListener("click", () => {
        if (bankFilter) {
            bankFilter.value = "";
        }
        applyFilters();
    });


    /* ======================================================
       16. EXPORT CSV (client-side, données déjà filtrées)
    ====================================================== */

    function escapeCsv(value) {
        return '"' + String(value ?? "").replace(/"/g, '""') + '"';
    }


    function getVisibleItems() {
        return items.filter(itemMatchesFilters);
    }


    function exportCsv() {

        const visible = getVisibleItems();

        if (!visible.length) {
            showToast("Aucune transaction à exporter.");
            return;
        }

        const headers = [
            "Date", "Référence", "Banque", "Montant banque",
            "Étudiant", "Matricule", "Montant AcademicPay",
            "Écart", "Problème"
        ];

        const lines = [headers.map(escapeCsv).join(";")];

        visible.forEach(item => {
            lines.push([
                item.date,
                item.reference,
                item.bankName,
                item.bankAmount,
                item.student || "Non identifié",
                item.matricule,
                item.systemAmount,
                item.difference,
                STATUS_LABELS[item.status] || item.status
            ].map(escapeCsv).join(";"));
        });

        const csv = "\uFEFF" + lines.join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `rapprochement-${academicYearFilter?.value || "academicpay"}.csv`;

        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        showToast("Export CSV généré.");
    }


    exportCsvButton?.addEventListener("click", exportCsv);


    /* ======================================================
       17. EXPORT PDF
    ====================================================== */

    function getJsPDF() {
        return window.jspdf?.jsPDF || window.jsPDF || null;
    }


    function exportPdf() {

        const visible = getVisibleItems();

        if (!visible.length) {
            showToast("Aucune transaction à exporter.");
            return;
        }

        const JsPDFConstructor = getJsPDF();

        if (!JsPDFConstructor) {
            showToast("Le générateur PDF n'est pas disponible.");
            return;
        }

        const doc = new JsPDFConstructor({ orientation: "landscape" });

        doc.setFontSize(14);
        doc.text("Rapprochement global — AcademicPay", 14, 16);

        doc.setFontSize(10);
        doc.text(
            `Année académique : ${academicYearFilter?.value || "—"}`,
            14, 23
        );

        const rows = visible.map(item => [
            formatDate(item.date),
            item.reference,
            item.bankName,
            item.bankAmount > 0 ? formatMoney(item.bankAmount) : "—",
            item.student || "Non identifié",
            item.systemAmount > 0 ? formatMoney(item.systemAmount) : "—",
            formatMoney(item.difference),
            STATUS_LABELS[item.status] || item.status
        ]);

        doc.autoTable({
            startY: 28,
            head: [[
                "Date", "Référence", "Banque", "Montant banque",
                "Étudiant", "AcademicPay", "Écart", "Problème"
            ]],
            body: rows,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [40, 40, 40] }
        });

        doc.save(`rapprochement-${academicYearFilter?.value || "academicpay"}.pdf`);

        showToast("Export PDF généré.");
    }


    exportPdfButton?.addEventListener("click", exportPdf);


    /* ======================================================
       18. THÈME
    ====================================================== */

    const THEME_KEY = "academicpay-theme";


    function getPreferredTheme() {
        return localStorage.getItem(THEME_KEY) || "dark";
    }


    function applyTheme(theme) {

        document.documentElement.dataset.theme = theme;

        const icon = themeButton?.querySelector("i");

        if (icon) {
            icon.className = theme === "dark" ? "bi bi-sun" : "bi bi-moon-stars";
        }

        localStorage.setItem(THEME_KEY, theme);
    }


    function toggleTheme() {

        const current = document.documentElement.dataset.theme || "dark";
        const next = current === "dark" ? "light" : "dark";

        applyTheme(next);
        refreshChartTheme();
    }


    themeButton?.addEventListener("click", toggleTheme);


    /* ======================================================
       19. INITIALISATION
    ====================================================== */

    applyTheme(getPreferredTheme());
    renderKPI();
    applyFilters();
    createChart();

    console.info(
        `AcademicPay : ${banks.length} banques chargées, ` +
        `${items.length} lignes de rapprochement calculées.`
    );

});
