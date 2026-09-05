/* ==========================================================
   ACADEMICPAY — FINANCE / ANOMALIES
   ========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* ======================================================
       1. CSRF TOKEN HELPER
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
       2. ÉLÉMENTS — FILTRES
    ====================================================== */

    const searchInput =
        document.getElementById("anomalySearch");

    const bankFilter =
        document.getElementById("bankFilter");

    const typeFilter =
        document.getElementById("typeFilter");

    const statusFilter =
        document.getElementById("statusFilter");

    const priorityFilter =
        document.getElementById("priorityFilter");

    const resetFiltersButton =
        document.getElementById("resetFilters");

    const typeCards =
        document.querySelectorAll(".anomaly-type-card");


    /* ======================================================
       3. TABLEAU
    ====================================================== */

    const anomalyRows =
        Array.from(
            document.querySelectorAll(".anomaly-row")
        );

    const resultCount =
        document.getElementById("resultCount");

    const emptyState =
        document.getElementById("emptyState");

    const tableResponsive =
        document.querySelector(
            ".anomalies-list-card .table-responsive"
        );


    /* ======================================================
       4. KPI
    ====================================================== */

    const totalAnomaliesKpi =
        document.getElementById("totalAnomaliesKpi");

    const pendingAnomaliesKpi =
        document.getElementById("pendingAnomaliesKpi");

    const processingAnomaliesKpi =
        document.getElementById("processingAnomaliesKpi");

    const resolvedAnomaliesKpi =
        document.getElementById("resolvedAnomaliesKpi");

    const sidebarAnomalyCount =
        document.getElementById("sidebarAnomalyCount");

    const mobileAnomalyCount =
        document.getElementById("mobileAnomalyCount");


    /* ======================================================
       5. THÈME
    ====================================================== */

    const themeButton =
        document.getElementById("themeButton");


    /* ======================================================
       6. TOAST
    ====================================================== */

    const toastElement =
        document.getElementById("financeToast");

    const toastMessage =
        document.getElementById("toastMessage");


    /* ======================================================
       7. MODALE
    ====================================================== */

    const modalElement =
        document.getElementById("anomalyDetailModal");

    const modalStudent =
        document.getElementById("modalStudent");

    const modalMatricule =
        document.getElementById("modalMatricule");

    const modalReference =
        document.getElementById("modalReference");

    const modalBank =
        document.getElementById("modalBank");

    const modalDeclaredAmount =
        document.getElementById("modalDeclaredAmount");

    const modalDate =
        document.getElementById("modalDate");

    const modalBankReference =
        document.getElementById("modalBankReference");

    const modalBankAmount =
        document.getElementById("modalBankAmount");

    const modalAnomalyType =
        document.getElementById("modalAnomalyType");

    const modalAmount =
        document.getElementById("modalAmount");

    const modalDescription =
        document.getElementById("modalDescription");

    const modalAnomalyStatus =
        document.getElementById("modalAnomalyStatus");

    const modalAnomalyPriority =
        document.getElementById("modalAnomalyPriority");

    const treatmentStatus =
        document.getElementById("anomalyTreatmentStatus");

    const treatmentNote =
        document.getElementById("anomalyTreatmentNote");

    const saveAnomalyButton =
        document.getElementById("saveAnomalyButton");

    const resolveAnomalyButton =
        document.getElementById("resolveAnomalyButton");


    /* ======================================================
       8. ÉTAT
    ====================================================== */

    let selectedRow = null;
    let selectedAnomalyId = null;


    /* ======================================================
       9. LIBELLÉS
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


    /* ======================================================
       10. OUTILS
    ====================================================== */

    function normalizeText(value) {
        return String(value || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }


    /* ======================================================
       11. TOAST
    ====================================================== */

    function showToast(message) {
        if (!toastElement || !toastMessage) return;

        toastMessage.textContent = message;

        if (typeof bootstrap === "undefined") return;

        bootstrap.Toast
            .getOrCreateInstance(
                toastElement,
                { delay: 2600 }
            )
            .show();
    }


    /* ======================================================
       12. COMPTEUR DES RÉSULTATS
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
       13. FILTRAGE
    ====================================================== */

    function applyFilters() {
        const searchTerm = normalizeText(searchInput?.value);
        const selectedBank = bankFilter?.value || "all";
        const selectedType = typeFilter?.value || "all";
        const selectedStatus = statusFilter?.value || "all";
        const selectedPriority = priorityFilter?.value || "all";

        let visibleCount = 0;

        anomalyRows.forEach(row => {
            const rowText = normalizeText(row.textContent);

            const matchesSearch = searchTerm === "" || rowText.includes(searchTerm);
            const matchesBank = selectedBank === "all" || row.dataset.bank === selectedBank;
            const matchesType = selectedType === "all" || row.dataset.type === selectedType;
            const matchesStatus = selectedStatus === "all" || row.dataset.status === selectedStatus;
            const matchesPriority = selectedPriority === "all" || row.dataset.priority === selectedPriority;

            const shouldDisplay = matchesSearch && matchesBank && matchesType && matchesStatus && matchesPriority;

            row.hidden = !shouldDisplay;

            if (shouldDisplay) {
                visibleCount++;
            }
        });

        updateResultCount(visibleCount);
        updateActiveTypeCard();
    }


    /* ======================================================
       14. RECHERCHE
    ====================================================== */

    searchInput?.addEventListener("input", applyFilters);


    /* ======================================================
       15. FILTRES SELECT
    ====================================================== */

    [bankFilter, typeFilter, statusFilter, priorityFilter].forEach(filter => {
        filter?.addEventListener("change", applyFilters);
    });


    /* ======================================================
       16. CARTES DE TYPE
    ====================================================== */

    typeCards.forEach(card => {
        card.addEventListener("click", () => {
            if (!typeFilter) return;

            const selectedType = card.dataset.typeFilter;

            if (!selectedType) return;

            if (typeFilter.value === selectedType) {
                typeFilter.value = "all";
            } else {
                typeFilter.value = selectedType;
            }

            applyFilters();

            document.querySelector(".anomalies-list-card")?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        });
    });


    /* ======================================================
       17. CARTE TYPE ACTIVE
    ====================================================== */

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
       18. RÉINITIALISATION DES FILTRES
    ====================================================== */

    function resetAllFilters() {
        if (searchInput) searchInput.value = "";
        if (bankFilter) bankFilter.value = "all";
        if (typeFilter) typeFilter.value = "all";
        if (statusFilter) statusFilter.value = "all";
        if (priorityFilter) priorityFilter.value = "all";

        typeCards.forEach(card => card.classList.remove("active"));

        applyFilters();
        searchInput?.focus();
        showToast("Filtres réinitialisés.");
    }


    /* ======================================================
       19. BOUTON RÉINITIALISER
    ====================================================== */

    if (resetFiltersButton) {
        resetFiltersButton.addEventListener("click", (event) => {
            event.preventDefault();
            resetAllFilters();
        });
    }


    /* ======================================================
       20. KPI
    ====================================================== */

    function updateKpis() {
        const total = anomalyRows.length;
        const pending = anomalyRows.filter(row => row.dataset.status === "pending").length;
        const processing = anomalyRows.filter(row => row.dataset.status === "processing").length;
        const resolved = anomalyRows.filter(row => row.dataset.status === "resolved").length;

        if (totalAnomaliesKpi) totalAnomaliesKpi.textContent = total;
        if (pendingAnomaliesKpi) pendingAnomaliesKpi.textContent = pending;
        if (processingAnomaliesKpi) processingAnomaliesKpi.textContent = processing;
        if (resolvedAnomaliesKpi) resolvedAnomaliesKpi.textContent = resolved;

        const unresolved = pending + processing;

        if (sidebarAnomalyCount) sidebarAnomalyCount.textContent = unresolved;
        if (mobileAnomalyCount) mobileAnomalyCount.textContent = unresolved;
    }


    /* ======================================================
       21. BOUTONS EXAMINER
    ====================================================== */

    document.addEventListener("click", (event) => {
        const button = event.target.closest(".anomaly-view-button");
        if (!button) return;

        const row = button.closest(".anomaly-row");
        if (!row) return;

        openAnomaly(row, button);
    });


    /* ======================================================
       22. OUVRIR UNE ANOMALIE
    ====================================================== */

    function openAnomaly(row, button) {
        selectedRow = row;
        selectedAnomalyId = button.dataset.anomalyId || null;

        const student = button.dataset.student || "—";
        const matricule = button.dataset.matricule || "—";
        const reference = button.dataset.reference || "—";
        const bank = button.dataset.bank || "—";
        const typeLabel = button.dataset.typeLabel || "—";
        const amount = button.dataset.amount || "—";
        const declaredAmount = button.dataset.declaredAmount || "—";
        const bankReference = button.dataset.bankReference || "—";
        const bankAmount = button.dataset.bankAmount || "—";
        const date = button.dataset.date || "—";
        const description = button.dataset.description || "Aucune description fournie.";
        const status = row.dataset.status || "pending";
        const priority = row.dataset.priority || "medium";
        const note = button.dataset.note || "";

        // Student
        if (modalStudent) modalStudent.textContent = student;
        if (modalMatricule) modalMatricule.textContent = matricule;

        // Declaration
        if (modalReference) modalReference.textContent = reference;
        if (modalBank) modalBank.textContent = bank;
        if (modalDeclaredAmount) modalDeclaredAmount.textContent = declaredAmount;
        if (modalDate) modalDate.textContent = date;

        // Bank transaction
        if (modalBankReference) modalBankReference.textContent = bankReference;
        if (modalBankAmount) modalBankAmount.textContent = bankAmount;

        // Diagnostic
        if (modalAnomalyType) modalAnomalyType.textContent = typeLabel;
        if (modalAmount) modalAmount.textContent = amount;
        if (modalDescription) modalDescription.textContent = description;

        // Status / priority
        updateModalStatusBadge(status);
        updateModalPriorityBadge(priority);

        // Treatment
        if (treatmentStatus) treatmentStatus.value = status;
        if (treatmentNote) treatmentNote.value = note;

        updateResolveButton();

        if (modalElement && typeof bootstrap !== "undefined") {
            bootstrap.Modal.getOrCreateInstance(modalElement).show();
        }
    }


    /* ======================================================
       23. BADGE STATUT MODALE
    ====================================================== */

    function updateModalStatusBadge(status) {
        if (!modalAnomalyStatus) return;

        modalAnomalyStatus.className = `anomaly-status ${status}`;
        modalAnomalyStatus.textContent = statusNames[status] || "—";
    }


    /* ======================================================
       24. BADGE PRIORITÉ MODALE
    ====================================================== */

    function updateModalPriorityBadge(priority) {
        if (!modalAnomalyPriority) return;

        modalAnomalyPriority.className = `priority-badge ${priority}`;
        modalAnomalyPriority.textContent = priorityNames[priority] || "—";
    }


    /* ======================================================
       25. STATUT DANS LE TABLEAU
    ====================================================== */

    function updateRowStatus(row, status) {
        const badge = row.querySelector(".anomaly-status");
        if (!badge) return;

        badge.className = `anomaly-status ${status}`;
        badge.textContent = statusNames[status] || status;
    }


    /* ======================================================
       26. CHANGEMENT STATUT DANS MODALE
    ====================================================== */

    treatmentStatus?.addEventListener("change", updateResolveButton);


    /* ======================================================
       27. ENREGISTRER LE TRAITEMENT (AJAX)
    ====================================================== */

    saveAnomalyButton?.addEventListener("click", () => {
        if (!selectedRow) {
            showToast("Aucune anomalie sélectionnée.");
            return;
        }

        const newStatus = treatmentStatus?.value || selectedRow.dataset.status || "pending";
        const note = treatmentNote?.value.trim() || "";

        // Update local UI first
        selectedRow.dataset.status = newStatus;
        selectedRow.dataset.note = note;

        updateRowStatus(selectedRow, newStatus);
        updateModalStatusBadge(newStatus);
        updateResolveButton();

        // Send to server
        if (selectedAnomalyId) {
            updateAnomalyOnServer(selectedAnomalyId, newStatus, note);
        }

        updateKpis();
        applyFilters();

        showToast("Traitement enregistré.");
    });


    /* ======================================================
       28. MARQUER COMME RÉSOLUE (AJAX)
    ====================================================== */

    resolveAnomalyButton?.addEventListener("click", () => {
        if (!selectedRow) {
            showToast("Aucune anomalie sélectionnée.");
            return;
        }

        const note = treatmentNote?.value.trim() || "Anomalie résolue.";

        // Update local UI first
        selectedRow.dataset.status = "resolved";
        selectedRow.dataset.note = note;

        if (treatmentStatus) treatmentStatus.value = "resolved";

        updateRowStatus(selectedRow, "resolved");
        updateModalStatusBadge("resolved");
        updateResolveButton();

        // Send to server
        if (selectedAnomalyId) {
            updateAnomalyOnServer(selectedAnomalyId, "resolved", note);
        }

        updateKpis();
        applyFilters();

        showToast("Anomalie marquée comme résolue.");
    });


    /* ======================================================
       29. AJAX UPDATE ANOMALY
    ====================================================== */

    function updateAnomalyOnServer(anomalyId, status, note) {
        const formData = new FormData();
        formData.append('anomaly_id', anomalyId);
        formData.append('status', status);
        formData.append('note', note);

        const csrftoken = getCookie('csrftoken');

        fetch("/finance/anomalies/update/", {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': csrftoken,
            },
            body: formData,
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                if (data.errors && data.errors.length > 0) {
                    showToast("Erreur: " + data.errors[0]);
                } else {
                    showToast("Une erreur est survenue.");
                }
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast("Une erreur est survenue. Veuillez réessayer.");
        });
    }


    /* ======================================================
       30. BOUTON RÉSOUDRE
    ====================================================== */

    function updateResolveButton() {
        if (!resolveAnomalyButton) return;

        const resolved = treatmentStatus?.value === "resolved";

        resolveAnomalyButton.disabled = resolved;

        resolveAnomalyButton.innerHTML = resolved
            ? `<i class="bi bi-check2-circle"></i> Anomalie résolue`
            : `<i class="bi bi-check2-circle"></i> Marquer comme résolue`;
    }


    /* ======================================================
       31. FERMETURE DE LA MODALE
    ====================================================== */

    modalElement?.addEventListener("hidden.bs.modal", () => {
        selectedRow = null;
        selectedAnomalyId = null;
        if (treatmentNote) treatmentNote.value = "";
    });


    /* ======================================================
       32. THÈME
    ====================================================== */

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
        localStorage.setItem(THEME_KEY, lightMode ? "light" : "dark");
        updateThemeIcon();
    });


    /* ======================================================
       33. OUVERTURE DEPUIS UNE URL
    ====================================================== */

    function openFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const reference = params.get("reference");
        const searchParam = params.get("search");

        if (!reference && !searchParam) return;

        // If search param exists, set it in the search input
        if (searchParam && searchInput) {
            searchInput.value = searchParam;
        }

        if (!reference) {
            applyFilters();
            return;
        }

        const targetRow = anomalyRows.find(row => {
            const button = row.querySelector(".anomaly-view-button");
            return button?.dataset.reference === reference;
        });

        if (!targetRow) {
            showToast("L'anomalie demandée n'a pas été trouvée.");
            applyFilters();
            return;
        }

        // Reset filters
        if (bankFilter) bankFilter.value = "all";
        if (typeFilter) typeFilter.value = "all";
        if (statusFilter) statusFilter.value = "all";
        if (priorityFilter) priorityFilter.value = "all";

        applyFilters();

        // Highlight the row
        targetRow.classList.add("highlighted-anomaly");

        setTimeout(() => {
            targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 200);

        setTimeout(() => {
            const button = targetRow.querySelector(".anomaly-view-button");
            if (button) {
                openAnomaly(targetRow, button);
            }
        }, 500);

        setTimeout(() => {
            targetRow.classList.remove("highlighted-anomaly");
        }, 4000);
    }


    /* ======================================================
       34. ACCESSIBILITÉ DES CARTES
    ====================================================== */

    typeCards.forEach(card => {
        card.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            card.click();
        });
    });


    /* ======================================================
       35. INITIALISATION
    ====================================================== */

    initializeTheme();
    updateKpis();
    applyFilters();
    openFromUrl();

});