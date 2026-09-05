


/* ==========================================================
   ACADEMICPAY — FINANCE / HISTORIQUE
   Django version with dynamic data
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* ======================================================
       ÉLÉMENTS
    ====================================================== */

    const tableBody =
        document.getElementById("historyTableBody");

    const tableWrapper =
        document.querySelector(".history-table-wrapper");

    const searchInput =
        document.getElementById("historySearch");

    const clearSearchButton =
        document.getElementById("clearHistorySearch");

    const periodFilter =
        document.getElementById("historyPeriodFilter");

    const moduleFilter =
        document.getElementById("historyModuleFilter");

    const actionFilter =
        document.getElementById("historyActionFilter");

    const statusFilter =
        document.getElementById("historyStatusFilter");

    const actorFilter =
        document.getElementById("historyActorFilter");

    const resetFiltersButton =
        document.getElementById("resetHistoryFilters");

    const refreshButton =
        document.getElementById("refreshHistoryButton");

    const exportButton =
        document.getElementById("exportHistoryButton");

    const resultCount =
        document.getElementById("historyResultCount");

    const emptyState =
        document.getElementById("historyEmpty");

    const themeButton =
        document.getElementById("themeButton");


    /* ======================================================
       KPI
    ====================================================== */

    const totalOperationsKpi =
        document.getElementById("totalOperationsKpi");

    const successfulOperationsKpi =
        document.getElementById("successfulOperationsKpi");

    const warningOperationsKpi =
        document.getElementById("warningOperationsKpi");

    const failedOperationsKpi =
        document.getElementById("failedOperationsKpi");


    /* ======================================================
       MODALE
    ====================================================== */

    const modalElement =
        document.getElementById("historyDetailModal");

    const modalHistoryId =
        document.getElementById("modalHistoryId");

    const modalHistoryDate =
        document.getElementById("modalHistoryDate");

    const modalHistoryActor =
        document.getElementById("modalHistoryActor");

    const modalHistoryModule =
        document.getElementById("modalHistoryModule");

    const modalHistoryAction =
        document.getElementById("modalHistoryAction");

    const modalHistoryReference =
        document.getElementById("modalHistoryReference");

    const modalHistoryStatus =
        document.getElementById("modalHistoryStatus");

    const modalHistoryDescription =
        document.getElementById("modalHistoryDescription");


    /* ======================================================
       TOAST
    ====================================================== */

    const toastElement =
        document.getElementById("financeToast");

    const toastMessage =
        document.getElementById("toastMessage");


    /* ======================================================
       CSRF TOKEN HELPER
    ====================================================== */

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


    /* ======================================================
       LIBELLÉS
    ====================================================== */

    const actorNames = {
        finance: "Responsable financier",
        cashier: "Agent de caisse",
        student: "Étudiant",
        system: "Système"
    };

    const moduleNames = {
        payment: "Paiements",
        statement: "Extraits bancaires",
        schedule: "Échéancier",
        student: "Situation financière",
        reconciliation: "Rapprochement",
        anomaly: "Anomalies"
    };

    const actionNames = {
        create: "Création",
        import: "Importation",
        update: "Modification",
        validate: "Validation",
        reconcile: "Rapprochement",
        resolve: "Résolution",
        export: "Exportation"
    };

    const statusNames = {
        success: "Réussie",
        warning: "À vérifier",
        failed: "Échec"
    };


    /* ======================================================
       OUTILS
    ====================================================== */

    function getRows() {
        if (!tableBody) return [];
        return Array.from(tableBody.querySelectorAll("tr"));
    }

    function normalizeText(value) {
        return String(value || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    function parseDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDateTime(value) {
        const date = parseDate(value);
        if (!date) return "—";
        return date.toLocaleString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }


    /* ======================================================
       FILTRE DE PÉRIODE
    ====================================================== */

    function matchesPeriod(row) {
        const selectedPeriod = periodFilter?.value || "";
        if (!selectedPeriod) return true;

        const operationDate = parseDate(row.dataset.date);
        if (!operationDate) return false;

        const now = new Date();

        if (selectedPeriod === "today") {
            return operationDate.getFullYear() === now.getFullYear() &&
                   operationDate.getMonth() === now.getMonth() &&
                   operationDate.getDate() === now.getDate();
        }

        let numberOfDays = 0;
        if (selectedPeriod === "week") numberOfDays = 7;
        if (selectedPeriod === "month") numberOfDays = 30;

        if (!numberOfDays) return true;

        const startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - numberOfDays);

        return operationDate >= startDate;
    }


    /* ======================================================
       FILTRAGE
    ====================================================== */

    function applyFilters() {
        const search = normalizeText(searchInput?.value);
        const selectedModule = moduleFilter?.value || "";
        const selectedAction = actionFilter?.value || "";
        const selectedStatus = statusFilter?.value || "";
        const selectedActor = actorFilter?.value || "";

        let visibleCount = 0;

        getRows().forEach(row => {
            const searchableText = normalizeText([
                row.dataset.reference,
                row.dataset.description,
                actorNames[row.dataset.actor] || row.dataset.actor,
                moduleNames[row.dataset.module] || row.dataset.module,
                actionNames[row.dataset.action] || row.dataset.action,
                statusNames[row.dataset.status] || row.dataset.status,
                row.textContent
            ].join(" "));

            const matchesSearch = !search || searchableText.includes(search);
            const matchesModule = !selectedModule || row.dataset.module === selectedModule;
            const matchesAction = !selectedAction || row.dataset.action === selectedAction;
            const matchesStatus = !selectedStatus || row.dataset.status === selectedStatus;
            const matchesActor = !selectedActor || row.dataset.actor === selectedActor;

            const visible = matchesSearch && matchesModule && matchesAction && matchesStatus && matchesActor && matchesPeriod(row);

            row.hidden = !visible;
            if (visible) visibleCount++;
        });

        updateResultCount(visibleCount);
        updateClearSearchButton();
        updateKpis();
    }


    /* ======================================================
       COMPTEUR
    ====================================================== */

    function updateResultCount(count) {
        if (resultCount) {
            resultCount.textContent = `${count} opération${count !== 1 ? "s" : ""} affichée${count !== 1 ? "s" : ""}`;
        }

        if (count === 0) {
            if (tableWrapper) tableWrapper.style.display = "none";
            if (emptyState) emptyState.hidden = false;
        } else {
            if (tableWrapper) tableWrapper.style.display = "";
            if (emptyState) emptyState.hidden = true;
        }
    }


    /* ======================================================
       KPI
    ====================================================== */

    function updateKpis() {
        const visibleRows = getRows().filter(row => !row.hidden);

        const total = visibleRows.length;
        const success = visibleRows.filter(row => row.dataset.status === "success").length;
        const warning = visibleRows.filter(row => row.dataset.status === "warning").length;
        const failed = visibleRows.filter(row => row.dataset.status === "failed").length;

        if (totalOperationsKpi) totalOperationsKpi.textContent = total;
        if (successfulOperationsKpi) successfulOperationsKpi.textContent = success;
        if (warningOperationsKpi) warningOperationsKpi.textContent = warning;
        if (failedOperationsKpi) failedOperationsKpi.textContent = failed;
    }


    /* ======================================================
       RECHERCHE
    ====================================================== */

    searchInput?.addEventListener("input", applyFilters);

    clearSearchButton?.addEventListener("click", () => {
        searchInput.value = "";
        searchInput.focus();
        applyFilters();
    });

    function updateClearSearchButton() {
        if (!clearSearchButton) return;
        clearSearchButton.classList.toggle("visible", Boolean(searchInput?.value.trim()));
    }


    /* ======================================================
       FILTRES SELECT
    ====================================================== */

    [periodFilter, moduleFilter, actionFilter, statusFilter, actorFilter].forEach(filter => {
        filter?.addEventListener("change", applyFilters);
    });


    /* ======================================================
       RÉINITIALISATION
    ====================================================== */

    resetFiltersButton?.addEventListener("click", () => {
        if (periodFilter) periodFilter.value = "";
        if (moduleFilter) moduleFilter.value = "";
        if (actionFilter) actionFilter.value = "";
        if (statusFilter) statusFilter.value = "";
        if (actorFilter) actorFilter.value = "";
        if (searchInput) searchInput.value = "";
        applyFilters();
        showToast("Filtres réinitialisés.");
    });


    /* ======================================================
       ACTUALISER
    ====================================================== */

    refreshButton?.addEventListener("click", () => {
        refreshButton.disabled = true;
        const icon = refreshButton.querySelector("i");
        icon?.classList.add("history-refreshing");

        // Reload page to refresh data
        window.location.reload();
    });


    /* ======================================================
       OUVERTURE D'UN DÉTAIL
    ====================================================== */

    tableBody?.addEventListener("click", event => {
        const button = event.target.closest(".history-view-button");
        if (!button) return;
        const row = button.closest("tr");
        if (row) openHistoryDetail(row);
    });


    function openHistoryDetail(row) {
        const id = String(row.dataset.id || "").slice(-6).padStart(6, "0");

        if (modalHistoryId) modalHistoryId.textContent = `LOG-${id}`;
        if (modalHistoryDate) modalHistoryDate.textContent = formatDateTime(row.dataset.date);
        if (modalHistoryActor) modalHistoryActor.textContent = actorNames[row.dataset.actor] || "—";
        if (modalHistoryModule) modalHistoryModule.textContent = moduleNames[row.dataset.module] || "—";
        if (modalHistoryAction) modalHistoryAction.textContent = actionNames[row.dataset.action] || "—";
        if (modalHistoryReference) modalHistoryReference.textContent = row.dataset.reference || "—";
        if (modalHistoryStatus) modalHistoryStatus.textContent = statusNames[row.dataset.status] || "—";
        if (modalHistoryDescription) modalHistoryDescription.textContent = row.dataset.description || "Aucune description.";

        if (modalElement && typeof bootstrap !== "undefined") {
            bootstrap.Modal.getOrCreateInstance(modalElement).show();
        }
    }


    /* ======================================================
       EXPORT CSV
    ====================================================== */

    // Export is handled server-side via the anchor tag with href

    /* ======================================================
       TOAST
    ====================================================== */

    function showToast(message) {
        if (!toastElement || !toastMessage || typeof bootstrap === "undefined") return;
        toastMessage.textContent = message;
        bootstrap.Toast.getOrCreateInstance(toastElement, { delay: 2500 }).show();
    }


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
        const theme = document.body.classList.contains("light-theme") ? "light" : "dark";
        localStorage.setItem("academicpay-finance-theme", theme);
        updateThemeIcon();
    });


    /* ======================================================
       INITIALISATION
    ====================================================== */

    initializeTheme();
    updateClearSearchButton();
    applyFilters();

});