/* ==========================================================
   ACADEMICPAY — FINANCE / EXTRAITS BANCAIRES
   finance-statements.js

   Données réelles injectées par Django (finance_statements) dans
   le bloc <script id="finance-statements-bootstrap"
   type="application/json"> du template finance-statements.html.

   L'import d'extrait POST vers finance_import_statement (multipart
   form-data : bank, academic_year, file) et crée réellement des
   lignes BankStatement + BankTransaction côté serveur.

   Le détail d'un extrait est rechargé depuis
   finance_statement_detail/<id>/ à l'ouverture de la modale.
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

        const node = $("finance-statements-bootstrap");

        const empty = {
            academicYear: "",
            statements: [],
            banks: [],
            bankAccounts: [],
            bankSummary: [],
            kpi: {
                statementCount: 0,
                operations: 0,
                totalAmount: "0",
                pendingReconciliation: 0
            }
        };

        if (!node) {
            console.error(
                "AcademicPay : bloc de données " +
                "finance-statements-bootstrap introuvable."
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

    const IMPORT_URL =
        document.body.dataset.importUrl || "";

    // Gabarit d'URL contenant l'ID factice "0" à remplacer par
    // l'identifiant réel de l'extrait (voir finance-statements.html).
    const STATEMENT_DETAIL_URL_TEMPLATE =
        document.body.dataset.statementDetailUrlTemplate || "";


    /* ======================================================
       3. RÉFÉRENTIEL (fourni par Django)
    ====================================================== */

    const banks = BOOTSTRAP.banks;
    const bankAccounts = BOOTSTRAP.bankAccounts;


    function getBankAccount(bankCode) {

        return bankAccounts.find(
            account => account.bankCode === bankCode
        ) || null;
    }


    function bankName(code) {

        return banks.find(
            bank => bank.code === code
        )?.name || code;
    }


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

    function normalize(value) {

        return String(value ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }


    function money(value) {

        return new Intl.NumberFormat(
            "fr-FR",
            {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }
        ).format(Number(value) || 0) + " $";
    }


    function formatDate(value) {

        if (!value) {
            return "—";
        }

        return new Intl.DateTimeFormat(
            "fr-FR",
            {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            }
        ).format(new Date(value + "T00:00:00"));
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
            bootstrap.Toast
                .getOrCreateInstance(toast, { delay: 2300 })
                .show();
        }
    }


    /* ======================================================
       5. ÉTAT
    ====================================================== */

    let statements = BOOTSTRAP.statements.map(adaptStatement);


    function adaptStatement(raw) {

        return {
            id: raw.id,
            file: raw.file,
            bank: raw.bank.code,
            bankName: raw.bank.name,
            account: raw.account,
            currency: raw.currency,
            startDate: raw.startDate,
            endDate: raw.endDate,
            operations: raw.operations,
            amount: Number(raw.amount),
            importedAt: raw.importedAt,
            status: raw.statusDisplay,
            statusCode: raw.status,
            importedBy: raw.importedBy,
            year: raw.academicYear,
            matched: raw.matched,
            unmatched: raw.unmatched,
            anomalies: raw.anomalies
        };
    }


    /* ======================================================
       6. DOM
    ====================================================== */

    const academicYearFilter = $("academicYearFilter");
    const searchInput = $("statementSearch");
    const bankFilter = $("statementBankFilter");
    const statusFilter = $("statementStatusFilter");

    const tableBody = $("statementTableBody");
    const emptyState = $("statementEmpty");

    const bankGrid = $("statementBankGrid");


    /* ======================================================
       7. ANNÉE ACADÉMIQUE

       Les extraits affichés sont calculés côté serveur pour
       l'année académique active. Changer d'année recharge donc
       la page avec le bon paramètre plutôt que de refiltrer
       côté client.
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
       8. CARTES BANQUE (générées depuis le référentiel réel)
    ====================================================== */

    function renderBankGrid() {

        if (!bankGrid) {
            return;
        }

        bankGrid.innerHTML = "";

        const summaryByCode = new Map(
            (BOOTSTRAP.bankSummary || []).map(
                item => [item.code, item]
            )
        );

        banks.forEach(bank => {

            const summary =
                summaryByCode.get(bank.code) || {
                    count: 0,
                    amount: "0"
                };

            const button = document.createElement("button");
            button.type = "button";
            button.className = "statement-bank-card";
            button.dataset.bank = bank.code;

            button.innerHTML = `
                <div class="statement-bank-logo">
                    ${bankInitials(bank.name)}
                </div>
                <div class="statement-bank-info">
                    <strong>${bank.name}</strong>
                    <span>${summary.count} extrait${summary.count > 1 ? "s" : ""}</span>
                </div>
                <div class="statement-bank-value">
                    <strong>${money(summary.amount)}</strong>
                    <span>Montant importé</span>
                </div>
                <i class="bi bi-chevron-right"></i>
            `;

            button.addEventListener("click", () => {

                if (bankFilter) {
                    bankFilter.value =
                        bankFilter.value === bank.code
                            ? ""
                            : bank.code;

                    applyFilters();
                }
            });

            bankGrid.appendChild(button);
        });
    }


    /* ======================================================
       9. RECHERCHE
    ====================================================== */

    searchInput?.addEventListener("input", applyFilters);

    $("clearStatementSearch")?.addEventListener(
        "click",
        () => {

            if (searchInput) {
                searchInput.value = "";
            }

            applyFilters();
        }
    );


    bankFilter?.addEventListener("change", applyFilters);
    statusFilter?.addEventListener("change", applyFilters);

    $("allStatementBanks")?.addEventListener(
        "click",
        () => {

            if (bankFilter) {
                bankFilter.value = "";
            }

            applyFilters();
        }
    );


    function resetFilters() {

        if (searchInput) {
            searchInput.value = "";
        }

        if (bankFilter) {
            bankFilter.value = "";
        }

        if (statusFilter) {
            statusFilter.value = "";
        }

        applyFilters();
    }


    $("resetStatementFilters")?.addEventListener(
        "click",
        () => {
            resetFilters();
            showToast("Filtres réinitialisés.");
        }
    );


    $("statementEmptyReset")?.addEventListener(
        "click",
        resetFilters
    );


    /* ======================================================
       10. FILTRAGE + RENDU DU TABLEAU
    ====================================================== */

    function applyFilters() {

        const query = normalize(searchInput?.value);
        const bank = bankFilter?.value || "";
        const status = statusFilter?.value || "";

        const filtered = statements.filter(statement => {

            if (bank && statement.bank !== bank) {
                return false;
            }

            if (status && statement.statusCode !== status) {
                return false;
            }

            if (query) {

                const haystack = normalize([
                    statement.file,
                    statement.bankName,
                    statement.account,
                    statement.importedBy
                ].join(" "));

                if (!haystack.includes(query)) {
                    return false;
                }
            }

            return true;
        });

        renderTable(filtered);
        renderKPI(filtered);
    }

    function renderTable(rows) {

        if (!tableBody) {
            return;
        }

        tableBody.innerHTML = "";

        if (emptyState) {
            emptyState.hidden = rows.length > 0;
        }

        rows.forEach(statement => {

            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>
                    <div class="statement-file-cell">
                        <i class="bi bi-file-earmark-spreadsheet"></i>
                        <span>${statement.file}</span>
                    </div>
                </td>
                <td>${statement.bankName}</td>
                <td>${formatDate(statement.startDate)} – ${formatDate(statement.endDate)}</td>
                <td>${statement.operations.toLocaleString("fr-FR")}</td>
                <td>${money(statement.amount)}</td>
                <td>${formatDate(statement.importedAt)}</td>
                <td>
                    <span class="statement-status-badge status-${statement.statusCode.toLowerCase()}">
                        ${statement.status}
                    </span>
                </td>
                <td>${statement.importedBy}</td>
                <td>
                    <button
                        type="button"
                        class="statement-detail-button"
                        data-statement-id="${statement.id}"
                        title="Voir le détail"
                    >
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            `;

            tableBody.appendChild(tr);
        });
    }


    function renderKPI(filteredRows) {

        // Les KPI reflètent toujours l'ensemble des extraits de
        // l'année académique active (déjà le seul filtre serveur),
        // indépendamment des filtres secondaires (banque, statut,
        // recherche) qui n'affectent que le tableau ci-dessous.
        const totalAmount = statements.reduce(
            (sum, s) => sum + s.amount, 0
        );

        const totalOperations = statements.reduce(
            (sum, s) => sum + s.operations, 0
        );

        const totalPending = statements.reduce(
            (sum, s) => sum + s.unmatched, 0
        );

        setText("statementCount", statements.length.toLocaleString("fr-FR"));
        setText("bankOperationCount", totalOperations.toLocaleString("fr-FR"));
        setText("bankTotalAmount", money(totalAmount));
        setText("pendingReconciliation", totalPending.toLocaleString("fr-FR"));
        setText("statementResultCount", filteredRows.length.toLocaleString("fr-FR"));
    }


    /* ======================================================
       11. IMPORTATION — SÉLECTION BANQUE / COMPTE
    ====================================================== */

    const uploadBank = $("uploadBank");
    const uploadAccount = $("uploadAccount");
    const uploadYear = $("uploadAcademicYear") || academicYearFilter;


    function updateUploadAccount() {

        if (!uploadAccount) {
            return;
        }

        const bankCode = uploadBank?.value || "";
        const account = getBankAccount(bankCode);

        uploadAccount.innerHTML = "";

        if (!account) {
            uploadAccount.disabled = true;

            const option = document.createElement("option");
            option.value = "";
            option.textContent = "Sélectionnez d'abord une banque";
            uploadAccount.appendChild(option);
            return;
        }

        uploadAccount.disabled = false;

        const option = document.createElement("option");
        option.value = account.accountNumber;
        option.textContent =
            `${account.accountNumber} (${account.currency})` +
            (account.label ? ` — ${account.label}` : "");
        uploadAccount.appendChild(option);
    }


    uploadBank?.addEventListener("change", updateUploadAccount);


    /* ======================================================
       12. DROPZONE / SÉLECTION DE FICHIER
    ====================================================== */

    const dropzone = $("statementDropzone");
    const fileInput = $("statementFile");
    const uploadError = $("statementUploadError");

    let selectedFile = null;


    function clearUploadError() {

        if (uploadError) {
            uploadError.hidden = true;
            uploadError.textContent = "";
        }
    }


    function showUploadError(message) {

        if (uploadError) {
            uploadError.hidden = false;
            uploadError.textContent = message;
        }
    }


    function formatFileSize(bytes) {

        if (!bytes && bytes !== 0) {
            return "—";
        }

        if (bytes < 1024) {
            return `${bytes} o`;
        }

        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} Ko`;
        }

        return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
    }


    function clearSelectedFile() {

        selectedFile = null;

        if (fileInput) {
            fileInput.value = "";
        }

        dropzone?.classList.remove("has-file");

        if (dropzone) {
            dropzone.hidden = false;
        }

        const selectedFileCard = $("selectedStatementFile");
        if (selectedFileCard) {
            selectedFileCard.hidden = true;
        }

        const fileNameEl = $("statementFileName");
        if (fileNameEl) {
            fileNameEl.textContent = "—";
        }

        const fileSizeEl = $("statementFileSize");
        if (fileSizeEl) {
            fileSizeEl.textContent = "—";
        }
    }


    function handleFileSelection(file) {

        clearUploadError();

        if (!file) {
            clearSelectedFile();
            return;
        }

        const allowedExtensions = [".csv", ".xls", ".xlsx"];
        const lowerName = file.name.toLowerCase();

        if (!allowedExtensions.some(ext => lowerName.endsWith(ext))) {
            showUploadError(
                "Format non pris en charge. Utilisez CSV, XLS ou XLSX."
            );
            clearSelectedFile();
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showUploadError(
                "Le fichier dépasse la taille maximale de 10 Mo."
            );
            clearSelectedFile();
            return;
        }

        selectedFile = file;
        dropzone?.classList.add("has-file");

        if (dropzone) {
            dropzone.hidden = true;
        }

        const selectedFileCard = $("selectedStatementFile");
        if (selectedFileCard) {
            selectedFileCard.hidden = false;
        }

        const fileNameEl = $("statementFileName");
        if (fileNameEl) {
            fileNameEl.textContent = file.name;
        }

        const fileSizeEl = $("statementFileSize");
        if (fileSizeEl) {
            fileSizeEl.textContent = formatFileSize(file.size);
        }
    }


    fileInput?.addEventListener("change", () => {
        handleFileSelection(fileInput.files?.[0] || null);
    });


    dropzone?.addEventListener("click", () => {
        fileInput?.click();
    });


    dropzone?.addEventListener("dragover", event => {
        event.preventDefault();
        dropzone.classList.add("dragover");
    });


    dropzone?.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
    });


    dropzone?.addEventListener("drop", event => {
        event.preventDefault();
        dropzone.classList.remove("dragover");

        const file = event.dataTransfer?.files?.[0];

        if (file && fileInput) {
            fileInput.files = event.dataTransfer.files;
        }

        handleFileSelection(file || null);
    });


    $("removeStatementFile")?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            clearSelectedFile();
        }
    );


    /* ======================================================
       13. SOUMISSION DE L'IMPORT (réel, POST vers Django)
    ====================================================== */

    function getCsrfToken() {

        const match = document.cookie.match(
            /(?:^|;\s*)csrftoken=([^;]+)/
        );

        return match ? decodeURIComponent(match[1]) : "";
    }


    const importButton =
        $("submitStatementUpload") ||
        $("importStatementButton") ||
        $("confirmStatementUpload");


    async function submitImport() {

        clearUploadError();

        const bankCode = uploadBank?.value || "";
        const academicYear =
            uploadYear?.value ||
            academicYearFilter?.value ||
            BOOTSTRAP.academicYear;

        if (!bankCode) {
            showUploadError("Veuillez sélectionner la banque.");
            return;
        }

        if (!selectedFile) {
            showUploadError("Veuillez sélectionner un fichier.");
            return;
        }

        if (!IMPORT_URL) {
            showUploadError(
                "Configuration manquante : impossible de contacter le serveur."
            );
            return;
        }

        const formData = new FormData();
        formData.append("bank", bankCode);
        formData.append("academic_year", academicYear);
        formData.append("file", selectedFile);

        if (importButton) {
            importButton.disabled = true;
            importButton.classList.add("is-loading");
        }

        try {

            const response = await fetch(IMPORT_URL, {
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
                    data.error ||
                    "Une erreur est survenue lors de l'importation.";

                showUploadError(message);
                return;
            }

            const newStatement = adaptStatement(data.statement);
            statements.unshift(newStatement);

            if (bankFilter) {
                bankFilter.value = "";
            }

            if (statusFilter) {
                statusFilter.value = "";
            }

            if (searchInput) {
                searchInput.value = "";
            }

            resetUploadForm();
            applyFilters();
            renderBankGrid();

            getModal("uploadStatementModal")?.hide();

            showToast(
                data.message ||
                "Extrait bancaire importé. Il est maintenant prêt pour le rapprochement."
            );

        } catch (error) {

            console.error("AcademicPay : échec de l'import.", error);
            showUploadError(
                "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez."
            );

        } finally {

            if (importButton) {
                importButton.disabled = false;
                importButton.classList.remove("is-loading");
            }
        }
    }


    importButton?.addEventListener("click", event => {
        event.preventDefault();
        submitImport();
    });


    /* ======================================================
       14. RÉINITIALISATION DU FORMULAIRE
    ====================================================== */

    function resetUploadForm() {

        if (uploadBank) {
            uploadBank.value = "";
        }

        updateUploadAccount();
        clearSelectedFile();
        clearUploadError();
    }


    const resetUploadButton =
        $("resetStatementUpload") ||
        $("resetStatementUploadButton") ||
        $("resetUploadStatement");


    resetUploadButton?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            resetUploadForm();
            showToast("Formulaire d'importation réinitialisé.");
        }
    );


    $("uploadStatementModal")?.addEventListener(
        "shown.bs.modal",
        () => {
            clearUploadError();
            updateUploadAccount();
        }
    );


    $("uploadStatementModal")?.addEventListener(
        "hidden.bs.modal",
        () => {
            resetUploadForm();
        }
    );


    /* ======================================================
       15. DÉTAIL D'UN EXTRAIT (rechargé depuis le serveur)
    ====================================================== */

    const RECONCILIATION_URL =
        document.body.dataset.reconciliationUrl || "#";


    tableBody?.addEventListener("click", event => {

        const button = event.target.closest(
            ".statement-detail-button"
        );

        if (!button) {
            return;
        }

        const id = Number(button.dataset.statementId);

        if (id) {
            openStatementDetail(id);
        }
    });


    async function openStatementDetail(statementId) {

        // Affichage immédiat avec les données déjà en mémoire,
        // puis rafraîchissement depuis le serveur si possible.
        const cached = statements.find(
            item => item.id === statementId
        );

        if (cached) {
            renderStatementDetail(cached);
        }

        if (!STATEMENT_DETAIL_URL_TEMPLATE) {
            return;
        }

        const detailUrl = STATEMENT_DETAIL_URL_TEMPLATE.replace(
            "0", statementId
        );

        try {

            const response = await fetch(detailUrl, {
                headers: { "X-Requested-With": "XMLHttpRequest" }
            });

            if (!response.ok) {
                return;
            }

            const data = await response.json();
            const fresh = adaptStatement(data);

            const index = statements.findIndex(
                item => item.id === statementId
            );

            if (index !== -1) {
                statements[index] = fresh;
            }

            renderStatementDetail(fresh);

        } catch (error) {
            console.error(
                "AcademicPay : échec du rafraîchissement du détail.",
                error
            );
        }
    }


    function renderStatementDetail(statement) {

        setText("detailStatementFile", statement.file);
        setText("detailStatementBank", statement.bankName);
        setText("detailStatementAccount", statement.account);
        setText("detailStatementCurrency", statement.currency);

        setText(
            "detailStatementPeriod",
            formatDate(statement.startDate) +
            " – " +
            formatDate(statement.endDate)
        );

        setText(
            "detailStatementOperations",
            statement.operations.toLocaleString("fr-FR")
        );

        setText("detailStatementAmount", money(statement.amount));
        setText("detailStatementStatus", statement.status);

        setText(
            "detailMatched",
            statement.matched.toLocaleString("fr-FR")
        );

        setText(
            "detailUnmatched",
            statement.unmatched.toLocaleString("fr-FR")
        );

        setText(
            "detailStatementAnomalies",
            statement.anomalies.toLocaleString("fr-FR")
        );

        const reconciliationLink = $("openStatementReconciliation");

        if (reconciliationLink) {
            reconciliationLink.href =
                RECONCILIATION_URL +
                "?statement=" + encodeURIComponent(statement.id) +
                "&bank=" + encodeURIComponent(statement.bank);
        }

        getModal("statementDetailModal")?.show();
    }


    /* ======================================================
       16. INITIALISATION
    ====================================================== */

    renderBankGrid();
    updateUploadAccount();
    applyFilters();

    console.info(
        `AcademicPay : ${banks.length} banques chargées, ` +
        `${statements.length} extraits calculés.`
    );

});
