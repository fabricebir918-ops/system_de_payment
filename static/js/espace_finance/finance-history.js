/* ==========================================================
   ACADEMICPAY — FINANCE / HISTORIQUE
   finance-history.js

   Données réelles injectées par Django (finance_history) dans le
   bloc <script id="finance-history-bootstrap"
   type="application/json"> du template finance-history.html.

   Toutes les entrées du journal d'audit sont chargées une seule
   fois ; recherche et filtres s'appliquent entièrement côté
   client sur les données déjà en mémoire.
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    "use strict";

    const $ = id => document.getElementById(id);


    /* ======================================================
       DONNÉES INJECTÉES PAR LE SERVEUR
    ====================================================== */

    function readBootstrapData() {

        const node = $("finance-history-bootstrap");

        const empty = {
            academicYear: "",
            entries: [],
            kpi: { total: 0, successful: 0, warning: 0, failed: 0 }
        };

        if (!node) {
            console.error(
                "AcademicPay : bloc de données " +
                "finance-history-bootstrap introuvable."
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


    /* ======================================================
       ÉLÉMENTS
    ====================================================== */

    const tableBody = $("historyTableBody");
    const tableWrapper = document.querySelector(".history-table-wrapper");

    const searchInput = $("historySearch");
    const clearSearchButton = $("clearHistorySearch");

    const periodFilter = $("historyPeriodFilter");
    const moduleFilter = $("historyModuleFilter");
    const actionFilter = $("historyActionFilter");
    const statusFilter = $("historyStatusFilter");
    const actorFilter = $("historyActorFilter");
    const resetFiltersButton = $("resetHistoryFilters");

    const refreshButton = $("refreshHistoryButton");
    const exportButton = $("exportHistoryButton");

    const resultCount = $("historyResultCount");
    const emptyState = $("historyEmpty");

    const themeButton = $("themeButton");


    /* ======================================================
       KPI
    ====================================================== */

    const totalOperationsKpi = $("totalOperationsKpi");
    const successfulOperationsKpi = $("successfulOperationsKpi");
    const warningOperationsKpi = $("warningOperationsKpi");
    const failedOperationsKpi = $("failedOperationsKpi");


    /* ======================================================
       MODALE
    ====================================================== */

    const modalElement = $("historyDetailModal");
    const modalHistoryId = $("modalHistoryId");
    const modalHistoryDate = $("modalHistoryDate");
    const modalHistoryActor = $("modalHistoryActor");
    const modalHistoryModule = $("modalHistoryModule");
    const modalHistoryAction = $("modalHistoryAction");
    const modalHistoryReference = $("modalHistoryReference");
    const modalHistoryStatus = $("modalHistoryStatus");
    const modalHistoryDescription = $("modalHistoryDescription");


    /* ======================================================
       TOAST
    ====================================================== */

    const toastElement = $("financeToast");
    const toastMessage = $("toastMessage");


    /* ======================================================
       ÉTAT
    ====================================================== */

    const entries = BOOTSTRAP.entries.map(adaptEntry);


    function adaptEntry(raw) {

        return {
            id: raw.id,
            date: raw.date,
            dateObject: new Date(raw.date),
            actor: raw.actor,
            actorDisplay: raw.actorDisplay,
            module: raw.module,
            moduleDisplay: raw.moduleDisplay,
            moduleClass: raw.moduleClass,
            action: raw.action,
            actionDisplay: raw.actionDisplay,
            reference: raw.reference,
            description: raw.description,
            status: raw.status,
            statusDisplay: raw.statusDisplay,
            icon: raw.icon
        };
    }


    /* ======================================================
       OUTILS
    ====================================================== */

    function normalizeText(value) {
        return String(value || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
    }


    function formatDateTime(value) {

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return date.toLocaleString(
            "fr-FR",
            {
                day: "2-digit", month: "long", year: "numeric",
                hour: "2-digit", minute: "2-digit"
            }
        );
    }


    function formatDateShort(date) {

        return date.toLocaleDateString(
            "fr-FR", { day: "2-digit", month: "long", year: "numeric" }
        );
    }


    function formatTimeShort(date) {

        return date.toLocaleTimeString(
            "fr-FR", { hour: "2-digit", minute: "2-digit" }
        );
    }


    /* ======================================================
       TOAST
    ====================================================== */

    function showToast(message) {

        if (!toastElement || !toastMessage) {
            return;
        }

        toastMessage.textContent = message;

        if (typeof bootstrap === "undefined") {
            return;
        }

        bootstrap.Toast.getOrCreateInstance(toastElement, { delay: 2600 }).show();
    }


    /* ======================================================
       FILTRE DE PÉRIODE
    ====================================================== */

    function matchesPeriod(entry) {

        const selectedPeriod = periodFilter?.value || "";

        if (!selectedPeriod) {
            return true;
        }

        const operationDate = entry.dateObject;

        if (Number.isNaN(operationDate.getTime())) {
            return false;
        }

        const now = new Date();

        if (selectedPeriod === "today") {
            return (
                operationDate.getFullYear() === now.getFullYear() &&
                operationDate.getMonth() === now.getMonth() &&
                operationDate.getDate() === now.getDate()
            );
        }

        let numberOfDays = 0;

        if (selectedPeriod === "week") numberOfDays = 7;
        if (selectedPeriod === "month") numberOfDays = 30;

        if (!numberOfDays) {
            return true;
        }

        const startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - numberOfDays);

        return operationDate >= startDate;
    }


    /* ======================================================
       FILTRAGE
    ====================================================== */

    function matchesFilters(entry) {

        const search = normalizeText(searchInput?.value);
        const selectedModule = moduleFilter?.value || "";
        const selectedAction = actionFilter?.value || "";
        const selectedStatus = statusFilter?.value || "";
        const selectedActor = actorFilter?.value || "";

        if (selectedModule && entry.module !== selectedModule) {
            return false;
        }

        if (selectedAction && entry.action !== selectedAction) {
            return false;
        }

        if (selectedStatus && entry.status !== selectedStatus) {
            return false;
        }

        if (selectedActor && entry.actor !== selectedActor) {
            return false;
        }

        if (!matchesPeriod(entry)) {
            return false;
        }

        if (search) {

            const haystack = normalizeText([
                entry.reference, entry.description,
                entry.actorDisplay, entry.moduleDisplay,
                entry.actionDisplay, entry.statusDisplay
            ].join(" "));

            if (!haystack.includes(search)) {
                return false;
            }
        }

        return true;
    }


    function applyFilters() {

        const filtered = entries.filter(matchesFilters);

        renderTable(filtered);
        updateResultCount(filtered.length);
        updateClearSearchButton();
        updateKpis(filtered);
    }


    function renderTable(rows) {

        if (!tableBody) {
            return;
        }

        tableBody.innerHTML = "";

        rows.forEach(entry => {

            const tr = document.createElement("tr");
            tr.dataset.id = entry.id;

            tr.innerHTML = `
                <td>
                    <div class="history-date">
                        <strong>${formatDateShort(entry.dateObject)}</strong>
                        <small>${formatTimeShort(entry.dateObject)}</small>
                    </div>
                </td>
                <td>
                    <div class="history-actor">
                        <div class="history-avatar">${initials(entry.actorDisplay)}</div>
                        <div>
                            <strong>${entry.actorDisplay}</strong>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="history-module ${entry.moduleClass}">
                        <i class="bi ${entry.icon}"></i>
                        ${entry.moduleDisplay}
                    </span>
                </td>
                <td>${entry.actionDisplay}</td>
                <td class="history-reference">${entry.reference}</td>
                <td class="history-description">${entry.description}</td>
                <td>
                    <span class="history-status ${entry.status}">
                        ${entry.statusDisplay}
                    </span>
                </td>
                <td>
                    <button
                        type="button"
                        class="history-view-button"
                        title="Voir le détail"
                    >
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            `;

            tableBody.appendChild(tr);
        });
    }


    function initials(name) {
        const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
        if (!words.length) return "—";
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }


    /* ======================================================
       COMPTEUR
    ====================================================== */

    function updateResultCount(count) {

        if (resultCount) {
            resultCount.textContent =
                `${count} opération${count !== 1 ? "s" : ""} affichée${count !== 1 ? "s" : ""}`;
        }

        const hasResults = count > 0;

        if (tableWrapper) {
            tableWrapper.style.display = hasResults ? "" : "none";
        }

        if (emptyState) {
            emptyState.hidden = hasResults;
        }
    }


    function updateClearSearchButton() {
        if (!clearSearchButton) return;
        clearSearchButton.style.display =
            searchInput?.value?.trim() ? "flex" : "none";
    }


    /* ======================================================
       KPI (recalculés sur les lignes actuellement filtrées)
    ====================================================== */

    function updateKpis(filteredEntries) {

        const total = filteredEntries.length;
        const successful = filteredEntries.filter(e => e.status === "success").length;
        const warning = filteredEntries.filter(e => e.status === "warning").length;
        const failed = filteredEntries.filter(e => e.status === "failed").length;

        if (totalOperationsKpi) totalOperationsKpi.textContent = total;
        if (successfulOperationsKpi) successfulOperationsKpi.textContent = successful;
        if (warningOperationsKpi) warningOperationsKpi.textContent = warning;
        if (failedOperationsKpi) failedOperationsKpi.textContent = failed;
    }


    /* ======================================================
       RECHERCHE
    ====================================================== */

    searchInput?.addEventListener("input", applyFilters);

    clearSearchButton?.addEventListener("click", () => {
        if (searchInput) {
            searchInput.value = "";
            searchInput.focus();
        }
        applyFilters();
    });


    /* ======================================================
       FILTRES SELECT
    ====================================================== */

    [periodFilter, moduleFilter, actionFilter, statusFilter, actorFilter]
        .forEach(filter => filter?.addEventListener("change", applyFilters));


    /* ======================================================
       RÉINITIALISATION
    ====================================================== */

    resetFiltersButton?.addEventListener("click", () => {

        if (searchInput) searchInput.value = "";
        if (periodFilter) periodFilter.value = "";
        if (moduleFilter) moduleFilter.value = "";
        if (actionFilter) actionFilter.value = "";
        if (statusFilter) statusFilter.value = "";
        if (actorFilter) actorFilter.value = "";

        applyFilters();

        showToast("Filtres réinitialisés.");
    });


    /* ======================================================
       ACTUALISER (recharge la page pour une donnée fraîche)
    ====================================================== */

    refreshButton?.addEventListener("click", () => {

        refreshButton.disabled = true;

        const icon = refreshButton.querySelector("i");
        icon?.classList.add("history-refreshing");

        window.location.reload();
    });


    /* ======================================================
       OUVERTURE D'UN DÉTAIL
    ====================================================== */

    tableBody?.addEventListener("click", event => {

        const button = event.target.closest(".history-view-button");

        if (!button) {
            return;
        }

        const row = button.closest("tr[data-id]");

        if (row) {
            openHistoryDetail(row.dataset.id);
        }
    });


    function openHistoryDetail(id) {

        const entry = entries.find(item => item.id === id);

        if (!entry) {
            return;
        }

        if (modalHistoryId) modalHistoryId.textContent = entry.id;
        if (modalHistoryDate) modalHistoryDate.textContent = formatDateTime(entry.date);
        if (modalHistoryActor) modalHistoryActor.textContent = entry.actorDisplay || "—";
        if (modalHistoryModule) modalHistoryModule.textContent = entry.moduleDisplay || "—";
        if (modalHistoryAction) modalHistoryAction.textContent = entry.actionDisplay || "—";
        if (modalHistoryReference) modalHistoryReference.textContent = entry.reference || "—";
        if (modalHistoryStatus) modalHistoryStatus.textContent = entry.statusDisplay || "—";

        if (modalHistoryDescription) {
            modalHistoryDescription.textContent =
                entry.description || "Aucune description.";
        }

        if (modalElement && typeof bootstrap !== "undefined") {
            bootstrap.Modal.getOrCreateInstance(modalElement).show();
        }
    }


    /* ======================================================
       EXPORT CSV (données actuellement filtrées / visibles)
    ====================================================== */

    function escapeCsv(value) {
        return '"' + String(value ?? "").replace(/"/g, '""') + '"';
    }


    exportButton?.addEventListener("click", () => {

        const visible = entries.filter(matchesFilters);

        if (!visible.length) {
            showToast("Aucune opération à exporter.");
            return;
        }

        const rows = [[
            "Identifiant", "Date et heure", "Acteur", "Module",
            "Action", "Référence", "Description", "Résultat"
        ]];

        visible.forEach(entry => {
            rows.push([
                entry.id,
                formatDateTime(entry.date),
                entry.actorDisplay,
                entry.moduleDisplay,
                entry.actionDisplay,
                entry.reference,
                entry.description,
                entry.statusDisplay
            ]);
        });

        const csv = "\uFEFF" + rows.map(
            row => row.map(escapeCsv).join(";")
        ).join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `historique-financier-${BOOTSTRAP.academicYear || "academicpay"}.csv`;

        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        showToast(
            `${visible.length} opération${visible.length !== 1 ? "s" : ""} exportée${visible.length !== 1 ? "s" : ""}.`
        );
    });


    /* ======================================================
       THÈME
    ====================================================== */

    function initializeTheme() {

        const savedTheme = localStorage.getItem("academicpay-finance-theme");

        if (savedTheme === "light") {
            document.body.classList.add("light-theme");
        } else {
            document.body.classList.remove("light-theme");
        }

        updateThemeIcon();
    }

    function updateThemeIcon() {

        if (!themeButton) return;

        const icon = themeButton.querySelector("i");
        if (!icon) return;

        const lightMode = document.body.classList.contains("light-theme");

        if (lightMode) {
            icon.className = "bi bi-moon";
            themeButton.title = "Activer le mode sombre";
        } else {
            icon.className = "bi bi-sun";
            themeButton.title = "Activer le mode clair";
        }
    }

    themeButton?.addEventListener("click", () => {

        document.body.classList.toggle("light-theme");

        const lightMode = document.body.classList.contains("light-theme");

        localStorage.setItem(
            "academicpay-finance-theme", lightMode ? "light" : "dark"
        );

        updateThemeIcon();
    });


    /* ======================================================
       INITIALISATION
    ====================================================== */

    initializeTheme();
    applyFilters();

    console.info(
        `AcademicPay : ${entries.length} opérations chargées.`
    );

});
