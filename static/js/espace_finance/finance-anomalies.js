/* ==========================================================
   ACADEMICPAY — FINANCE / ANOMALIES
   finance-anomalies.js

   Données réelles injectées par Django (finance_anomalies) dans
   le bloc <script id="finance-anomalies-bootstrap"
   type="application/json"> du template finance-anomalies.html.

   "Enregistrer le traitement" et "Marquer comme résolue" envoient
   un vrai POST vers finance_anomaly_update (status + note),
   remplaçant les anciennes mutations locales uniquement.
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    "use strict";

    const $ = id => document.getElementById(id);


    /* ======================================================
       DONNÉES INJECTÉES PAR LE SERVEUR
       ====================================================== */

    function readBootstrapData() {

        const node = $("finance-anomalies-bootstrap");

        const empty = {
            academicYear: "",
            anomalies: [],
            banks: [],
            typeCounts: {
                difference: 0, unassigned: 0, missing: 0, duplicate: 0
            },
            kpi: { total: 0, pending: 0, processing: 0, resolved: 0 }
        };

        if (!node) {
            console.error(
                "AcademicPay : bloc de données " +
                "finance-anomalies-bootstrap introuvable."
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

    const ANOMALY_UPDATE_URL =
        document.body.dataset.anomalyUpdateUrl || "";


    /* ======================================================
       ÉLÉMENTS — FILTRES
       ====================================================== */

    const searchInput = $("anomalySearch");
    const bankFilter = $("bankFilter");
    const typeFilter = $("typeFilter");
    const statusFilter = $("statusFilter");
    const priorityFilter = $("priorityFilter");
    const resetFiltersButton = $("resetFilters");
    const typeCards = document.querySelectorAll(".anomaly-type-card");


    /* ======================================================
       TABLEAU
       ====================================================== */

    const tableBody = $("anomaliesTableBody");
    const resultCount = $("resultCount");
    const emptyState = $("emptyState");

    const tableResponsive = document.querySelector(
        ".anomalies-list-card .table-responsive"
    );


    /* ======================================================
       KPI
       ====================================================== */

    const totalAnomaliesKpi = $("totalAnomaliesKpi");
    const pendingAnomaliesKpi = $("pendingAnomaliesKpi");
    const processingAnomaliesKpi = $("processingAnomaliesKpi");
    const resolvedAnomaliesKpi = $("resolvedAnomaliesKpi");


    /* ======================================================
       TOAST
       ====================================================== */

    const toastElement = $("financeToast");
    const toastMessage = $("toastMessage");


    /* ======================================================
       MODALE
       ====================================================== */

    const modalElement = $("anomalyDetailModal");
    const modalStudent = $("modalStudent");
    const modalMatricule = $("modalMatricule");
    const modalReference = $("modalReference");
    const modalBank = $("modalBank");
    const modalDeclaredAmount = $("modalDeclaredAmount");
    const modalDate = $("modalDate");
    const modalBankReference = $("modalBankReference");
    const modalBankAmount = $("modalBankAmount");
    const modalAnomalyType = $("modalAnomalyType");
    const modalAmount = $("modalAmount");
    const modalDescription = $("modalDescription");
    const modalAnomalyStatus = $("modalAnomalyStatus");
    const modalAnomalyPriority = $("modalAnomalyPriority");
    const treatmentStatus = $("anomalyTreatmentStatus");
    const treatmentNote = $("anomalyTreatmentNote");
    const saveAnomalyButton = $("saveAnomalyButton");
    const resolveAnomalyButton = $("resolveAnomalyButton");


    /* ======================================================
       ÉTAT
       ====================================================== */

    let anomalies = BOOTSTRAP.anomalies.map(adaptAnomaly);
    let selectedAnomalyId = null;


    function adaptAnomaly(raw) {

        return {
            id: raw.id,
            student: raw.student,
            matricule: raw.matricule,
            reference: raw.reference,
            bank: raw.bank.code,
            bankName: raw.bank.name,
            type: raw.type,
            typeLabel: raw.typeLabel,
            amount: raw.amount,
            priority: raw.priority,
            priorityLabel: raw.priorityLabel,
            status: raw.status,
            date: raw.date,
            time: raw.time,
            description: raw.description,
            note: raw.note,
            claimId: raw.claimId,
            bankReference: raw.bankReference,
            bankAmount: raw.bankAmount
        };
    }


    function findAnomaly(id) {
        return anomalies.find(a => String(a.id) === String(id)) || null;
    }


    /* ======================================================
       LIBELLÉS
       ====================================================== */

    const statusNames = {
        pending: "À traiter",
        processing: "En cours",
        resolved: "Résolue"
    };

    const priorityNames = {
        high: "Élevée",
        medium: "Moyenne",
        low: "Faible"
    };

    const typeBadgeClass = {
        missing: "danger",
        difference: "warning",
        duplicate: "accent",
        other: "info"
    };


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


    function money(value) {
        const number = Number(value) || 0;
        return new Intl.NumberFormat(
            "fr-FR", { maximumFractionDigits: 0 }
        ).format(number) + " $";
    }


    function initials(name) {
        const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
        if (!words.length) return "—";
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
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

        bootstrap.Toast
            .getOrCreateInstance(toastElement, { delay: 2600 })
            .show();
    }


    /* ======================================================
       COMPTEUR DES RÉSULTATS
       ====================================================== */

    function updateResultCount(count) {

        if (resultCount) {
            resultCount.textContent =
                count === 1
                    ? "1 anomalie affichée"
                    : `${count} anomalies affichées`;
        }

        if (emptyState) {
            emptyState.hidden = count !== 0;
        }

        if (tableResponsive) {
            tableResponsive.style.display = count === 0 ? "none" : "";
        }
    }


    /* ======================================================
       FILTRAGE + RENDU
       ====================================================== */

    function matchesFilters(anomaly) {

        const searchTerm = normalizeText(searchInput?.value);
        const selectedBank = bankFilter?.value || "all";
        const selectedType = typeFilter?.value || "all";
        const selectedStatus = statusFilter?.value || "all";
        const selectedPriority = priorityFilter?.value || "all";

        if (selectedBank !== "all" && anomaly.bank !== selectedBank) {
            return false;
        }

        if (selectedType !== "all" && anomaly.type !== selectedType) {
            return false;
        }

        if (selectedStatus !== "all" && anomaly.status !== selectedStatus) {
            return false;
        }

        if (selectedPriority !== "all" && anomaly.priority !== selectedPriority) {
            return false;
        }

        if (searchTerm) {
            const haystack = normalizeText([
                anomaly.student, anomaly.matricule,
                anomaly.reference, anomaly.bankName
            ].join(" "));

            if (!haystack.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    }


    function applyFilters() {

        const filtered = anomalies.filter(matchesFilters);

        renderTable(filtered);
        updateResultCount(filtered.length);
        updateActiveTypeCard();
    }


    function renderTable(rows) {

        if (!tableBody) {
            return;
        }

        tableBody.innerHTML = "";

        rows.forEach(anomaly => {

            const tr = document.createElement("tr");
            tr.className = "anomaly-row";
            tr.dataset.id = anomaly.id;

            tr.innerHTML = `
                <td>
                    <div class="student-cell">
                        <span class="student-avatar">${initials(anomaly.student)}</span>
                        <div>
                            <strong>${anomaly.student}</strong>
                            <small>${anomaly.matricule}</small>
                        </div>
                    </div>
                </td>
                <td class="reference">${anomaly.reference}</td>
                <td>${anomaly.bankName}</td>
                <td>
                    <span class="anomaly-type-badge ${typeBadgeClass[anomaly.type] || "info"}">
                        ${anomaly.typeLabel}
                    </span>
                </td>
                <td>${money(anomaly.amount)}</td>
                <td>
                    <span class="priority-badge ${anomaly.priority}">
                        ${anomaly.priorityLabel}
                    </span>
                </td>
                <td>
                    <span class="anomaly-status ${anomaly.status}">
                        ${statusNames[anomaly.status] || anomaly.status}
                    </span>
                </td>
                <td>
                    ${anomaly.date}
                    <small>${anomaly.time}</small>
                </td>
                <td>
                    <button
                        type="button"
                        class="anomaly-view-button"
                        title="Examiner"
                        data-anomaly-id="${anomaly.id}"
                    >
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            `;

            tableBody.appendChild(tr);
        });
    }


    /* ======================================================
       RECHERCHE / FILTRES SELECT
       ====================================================== */

    searchInput?.addEventListener("input", applyFilters);

    [bankFilter, typeFilter, statusFilter, priorityFilter].forEach(filter => {
        filter?.addEventListener("change", applyFilters);
    });


    /* ======================================================
       CARTES DE TYPE
       ====================================================== */

    typeCards.forEach(card => {

        card.addEventListener("click", () => {

            if (!typeFilter) {
                return;
            }

            const selectedType = card.dataset.typeFilter;

            if (!selectedType) {
                return;
            }

            typeFilter.value =
                typeFilter.value === selectedType ? "all" : selectedType;

            applyFilters();

            document.querySelector(".anomalies-list-card")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    });


    function updateActiveTypeCard() {

        const selectedType = typeFilter?.value || "all";

        typeCards.forEach(card => {
            const cardType = card.dataset.typeFilter;
            card.classList.toggle(
                "active",
                selectedType !== "all" && selectedType === cardType
            );
        });
    }


    /* ======================================================
       RÉINITIALISATION DES FILTRES
       ====================================================== */

    function resetAllFilters() {

        if (searchInput) searchInput.value = "";
        if (bankFilter) bankFilter.value = "all";
        if (typeFilter) typeFilter.value = "all";
        if (statusFilter) statusFilter.value = "all";
        if (priorityFilter) priorityFilter.value = "all";

        applyFilters();
    }


    resetFiltersButton?.addEventListener("click", () => {
        resetAllFilters();
        showToast("Filtres réinitialisés.");
    });


    /* ======================================================
       KPI + COMPTEURS PAR TYPE (recalculés depuis l'état local,
       pour refléter les changements de statut en direct)
       ====================================================== */

    function updateKpis() {

        const total = anomalies.length;
        const pending = anomalies.filter(a => a.status === "pending").length;
        const processing = anomalies.filter(a => a.status === "processing").length;
        const resolved = anomalies.filter(a => a.status === "resolved").length;

        if (totalAnomaliesKpi) totalAnomaliesKpi.textContent = total;
        if (pendingAnomaliesKpi) pendingAnomaliesKpi.textContent = pending;
        if (processingAnomaliesKpi) processingAnomaliesKpi.textContent = processing;
        if (resolvedAnomaliesKpi) resolvedAnomaliesKpi.textContent = resolved;

        const notResolved = a => a.status !== "resolved";

        const difference = anomalies.filter(a => a.type === "difference" && notResolved(a)).length;
        const unassigned = anomalies.filter(a => a.type === "missing" && notResolved(a)).length;
        const duplicate = anomalies.filter(a => a.type === "duplicate" && notResolved(a)).length;

        setTypeCount("typeCountDifference", difference);
        setTypeCount("typeCountUnassigned", unassigned);
        setTypeCount("typeCountMissing", unassigned);
        setTypeCount("typeCountDuplicate", duplicate);
    }


    function setTypeCount(id, count) {
        const el = $(id);
        if (el) {
            el.textContent = count === 1 ? "1 anomalie" : `${count} anomalies`;
        }
    }


    /* ======================================================
       BOUTONS EXAMINER
       ====================================================== */

    tableBody?.addEventListener("click", event => {

        const button = event.target.closest(".anomaly-view-button");

        if (!button) {
            return;
        }

        openAnomaly(button.dataset.anomalyId);
    });


    /* ======================================================
       OUVRIR UNE ANOMALIE
       ====================================================== */

    function openAnomaly(anomalyId) {

        const anomaly = findAnomaly(anomalyId);

        if (!anomaly) {
            return;
        }

        selectedAnomalyId = anomaly.id;

        if (modalStudent) modalStudent.textContent = anomaly.student || "—";
        if (modalMatricule) modalMatricule.textContent = anomaly.matricule || "—";
        if (modalReference) modalReference.textContent = anomaly.reference || "—";
        if (modalBank) modalBank.textContent = anomaly.bankName || "—";

        if (modalDeclaredAmount) {
            modalDeclaredAmount.textContent = money(anomaly.amount);
        }

        if (modalDate) {
            modalDate.textContent = `${anomaly.date} à ${anomaly.time}`;
        }

        if (modalBankReference) {
            modalBankReference.textContent = anomaly.bankReference || "—";
        }

        if (modalBankAmount) {
            modalBankAmount.textContent =
                anomaly.bankAmount != null ? money(anomaly.bankAmount) : "—";
        }

        if (modalAnomalyType) modalAnomalyType.textContent = anomaly.typeLabel || "—";
        if (modalAmount) modalAmount.textContent = money(anomaly.amount);
        if (modalDescription) modalDescription.textContent = anomaly.description || "—";

        updateModalStatusBadge(anomaly.status);
        updateModalPriorityBadge(anomaly.priority);

        if (treatmentStatus) treatmentStatus.value = anomaly.status;
        if (treatmentNote) treatmentNote.value = anomaly.note || "";

        updateResolveButton();

        if (modalElement && typeof bootstrap !== "undefined") {
            bootstrap.Modal.getOrCreateInstance(modalElement).show();
        }
    }


    /* ======================================================
       BADGES MODALE
       ====================================================== */

    function updateModalStatusBadge(status) {
        if (!modalAnomalyStatus) return;
        modalAnomalyStatus.className = `anomaly-status ${status}`;
        modalAnomalyStatus.textContent = statusNames[status] || "—";
    }


    function updateModalPriorityBadge(priority) {
        if (!modalAnomalyPriority) return;
        modalAnomalyPriority.className = `priority-badge ${priority}`;
        modalAnomalyPriority.textContent = priorityNames[priority] || "—";
    }


    function updateRowStatus(anomalyId, status) {

        const row = tableBody?.querySelector(`tr[data-id="${anomalyId}"]`);
        const badge = row?.querySelector(".anomaly-status");

        if (badge) {
            badge.className = `anomaly-status ${status}`;
            badge.textContent = statusNames[status] || status;
        }
    }


    /* ======================================================
       ENVOI RÉEL VERS LE SERVEUR
       ====================================================== */

    function getCsrfToken() {
        const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
    }


    async function persistAnomalyUpdate(anomalyId, status, note) {

        if (!ANOMALY_UPDATE_URL) {
            showToast("Configuration manquante : impossible de contacter le serveur.");
            return false;
        }

        const formData = new FormData();
        formData.append("anomaly_id", anomalyId);
        formData.append("status", status);
        formData.append("note", note || "");

        try {

            const response = await fetch(ANOMALY_UPDATE_URL, {
                method: "POST",
                headers: {
                    "X-CSRFToken": getCsrfToken(),
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                const message =
                    (data.errors && data.errors.join(" ")) ||
                    "Une erreur est survenue lors de la mise à jour.";
                showToast(message);
                return false;
            }

            const anomaly = findAnomaly(anomalyId);

            if (anomaly) {
                anomaly.status = status;
                anomaly.note = note || "";
            }

            return true;

        } catch (error) {
            console.error("AcademicPay : échec de la mise à jour.", error);
            showToast("Impossible de contacter le serveur. Vérifiez votre connexion.");
            return false;
        }
    }


    /* ======================================================
       ENREGISTRER LE TRAITEMENT
       ====================================================== */

    saveAnomalyButton?.addEventListener("click", async () => {

        if (!selectedAnomalyId) {
            showToast("Aucune anomalie sélectionnée.");
            return;
        }

        const newStatus = treatmentStatus?.value || "pending";
        const note = treatmentNote?.value.trim() || "";

        saveAnomalyButton.disabled = true;

        const success = await persistAnomalyUpdate(
            selectedAnomalyId, newStatus, note
        );

        saveAnomalyButton.disabled = false;

        if (!success) {
            return;
        }

        updateRowStatus(selectedAnomalyId, newStatus);
        updateModalStatusBadge(newStatus);
        updateResolveButton();
        updateKpis();
        applyFilters();

        showToast("Traitement enregistré.");
    });


    /* ======================================================
       MARQUER COMME RÉSOLUE
       ====================================================== */

    resolveAnomalyButton?.addEventListener("click", async () => {

        if (!selectedAnomalyId) {
            showToast("Aucune anomalie sélectionnée.");
            return;
        }

        const note = treatmentNote?.value.trim() || "";

        resolveAnomalyButton.disabled = true;

        const success = await persistAnomalyUpdate(
            selectedAnomalyId, "resolved", note
        );

        resolveAnomalyButton.disabled = false;

        if (!success) {
            return;
        }

        if (treatmentStatus) {
            treatmentStatus.value = "resolved";
        }

        updateRowStatus(selectedAnomalyId, "resolved");
        updateModalStatusBadge("resolved");
        updateResolveButton();
        updateKpis();
        applyFilters();

        showToast("Anomalie marquée comme résolue.");
    });


    /* ======================================================
       BOUTON RÉSOUDRE
       ====================================================== */

    function updateResolveButton() {

        if (!resolveAnomalyButton) {
            return;
        }

        const resolved = treatmentStatus?.value === "resolved";

        resolveAnomalyButton.disabled = resolved;

        resolveAnomalyButton.innerHTML = resolved
            ? `<i class="bi bi-check2-circle"></i> Anomalie résolue`
            : `<i class="bi bi-check2-circle"></i> Marquer comme résolue`;
    }


    treatmentStatus?.addEventListener("change", updateResolveButton);


    /* ======================================================
       FERMETURE DE LA MODALE
       ====================================================== */

    modalElement?.addEventListener("hidden.bs.modal", () => {
        selectedAnomalyId = null;
        if (treatmentNote) {
            treatmentNote.value = "";
        }
    });


    /* ======================================================
       OUVERTURE DEPUIS UNE URL
       Exemple : finance-anomalies.html?reference=TRX8492051
       (utilisé notamment par le lien "Examiner l'anomalie" de
       la page Rapprochement global)
       ====================================================== */

    function openFromUrl() {

        const params = new URLSearchParams(window.location.search);
        const reference = params.get("reference");

        if (!reference) {
            return;
        }

        const target = anomalies.find(a => a.reference === reference);

        if (!target) {
            showToast("L'anomalie demandée n'a pas été trouvée.");
            return;
        }

        resetAllFilters();

        applyFilters();

        setTimeout(() => {

            const row = tableBody?.querySelector(
                `tr[data-id="${target.id}"]`
            );

            if (row) {
                row.classList.add("highlighted-anomaly");

                row.scrollIntoView({
                    behavior: "smooth", block: "center"
                });

                setTimeout(() => {
                    row.classList.remove("highlighted-anomaly");
                }, 4000);
            }

            openAnomaly(target.id);

        }, 200);
    }


    /* ======================================================
       THÈME
       ====================================================== */

    const themeButton = $("themeButton");
    const THEME_KEY = "academicpay-finance-theme";


    function initializeTheme() {

        const savedTheme = localStorage.getItem(THEME_KEY);

        if (savedTheme === "light") {
            document.body.classList.add("light-theme");
        } else {
            document.body.classList.remove("light-theme");
        }

        updateThemeIcon();
    }


    function updateThemeIcon() {

        if (!themeButton) {
            return;
        }

        const icon = themeButton.querySelector("i");

        if (!icon) {
            return;
        }

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

        localStorage.setItem(THEME_KEY, lightMode ? "light" : "dark");

        updateThemeIcon();
    });


    /* ======================================================
       ACCESSIBILITÉ DES CARTES
       ====================================================== */

    typeCards.forEach(card => {

        card.setAttribute("tabindex", "0");

        card.addEventListener("keydown", event => {

            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                card.click();
            }
        });
    });


    /* ======================================================
       INITIALISATION
       ====================================================== */

    initializeTheme();
    updateKpis();
    applyFilters();
    openFromUrl();

    console.info(
        `AcademicPay : ${BOOTSTRAP.banks.length} banques chargées, ` +
        `${anomalies.length} anomalies calculées.`
    );

});
