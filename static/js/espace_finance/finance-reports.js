/* ==========================================================
   ACADEMICPAY — FINANCE / RAPPORTS
   finance-reports.js

   Données réelles injectées par Django (finance_reports) dans le
   bloc <script id="finance-reports-bootstrap"
   type="application/json"> du template finance-reports.html.

   Toutes les données de l'année académique active sont chargées
   une seule fois ; les filtres banque/faculté/département/
   parcours/niveau/période s'appliquent ensuite côté client sur
   les données déjà en mémoire (banque + faculté modifient
   effectivement les totaux affichés ; département/parcours/
   niveau affinent le libellé du périmètre affiché, la donnée
   disponible côté serveur étant agrégée au niveau faculté).
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    "use strict";

    const $ = id => document.getElementById(id);


    /* ======================================================
       DONNÉES INJECTÉES PAR LE SERVEUR
    ====================================================== */

    function readBootstrapData() {

        const node = $("finance-reports-bootstrap");

        const empty = {
            report: {
                banks: {}, faculties: {},
                revenue: { labels: [], collected: [], expected: [] },
                kpi: {
                    totalCollected: "0", totalExpected: "0",
                    totalTransactions: 0, totalMatched: 0,
                    openAnomalies: 0, missingReferences: 0,
                    amountMismatches: 0
                }
            },
            academicStructure: {
                faculties: [], departments: [], programs: [],
                academicPrograms: []
            }
        };

        if (!node) {
            console.error(
                "AcademicPay : bloc de données " +
                "finance-reports-bootstrap introuvable."
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
    const reportData = BOOTSTRAP.report;
    const academicStructure = BOOTSTRAP.academicStructure;


    /* ======================================================
       ÉLÉMENTS DOM
    ====================================================== */

    const academicYearFilter = $("academicYearFilter");
    const periodFilter = $("periodFilter");
    const bankFilter = $("bankFilter");
    const facultyFilter = $("facultyFilter");
    const departmentFilter = $("departmentFilter");
    const programFilter = $("programFilter");
    const levelFilter = $("levelFilter");
    const resetFiltersButton = $("resetReportFilters");
    const exportButton = $("exportReportButton");
    const printButton = $("printReportButton");
    const themeButton = $("themeButton");
    const bankPerformanceBody = $("bankPerformanceBody");
    const facultyReportBody = $("facultyReportBody");
    const bankReportLegend = $("bankReportLegend");
    const toastElement = $("financeToast");
    const toastMessage = $("toastMessage");
    const sidebarAnomalyCount = $("sidebarAnomalyCount");
    const activeReportContextText = $("activeReportContextText");


    /* ======================================================
       KPI
    ====================================================== */

    const totalCollectedKpi = $("totalCollectedKpi");
    const recoveryRateKpi = $("recoveryRateKpi");
    const reconciliationRateKpi = $("reconciliationRateKpi");
    const openAnomaliesKpi = $("openAnomaliesKpi");
    const reconciliationCircleRate = $("reconciliationCircleRate");
    const matchedTransactionsCount = $("matchedTransactionsCount");
    const unassignedTransactionsCount = $("unassignedTransactionsCount");
    const missingReferencesCount = $("missingReferencesCount");
    const amountMismatchCount = $("amountMismatchCount");


    /* ======================================================
       INSTANCES CHART.JS
    ====================================================== */

    let revenueChart = null;
    let bankDistributionChart = null;
    let facultyChart = null;


    /* ======================================================
       OUTILS
    ====================================================== */

    function formatMoney(value) {
        return Number(value || 0).toLocaleString(
            "fr-FR", { maximumFractionDigits: 0 }
        ) + " $";
    }

    function formatPercent(value) {
        return Number(value || 0).toLocaleString(
            "fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }
        ) + " %";
    }

    function getSelectedText(select) {
        if (!select) return "";
        const option = select.options[select.selectedIndex];
        return option ? option.text.trim() : "";
    }

    function getCssVariable(name) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(name).trim();
    }

    function getChartColors() {
        return {
            text: getCssVariable("--muted") || "#8f96a3",
            grid: getCssVariable("--border") || "rgba(255,255,255,.08)",
            accent: getCssVariable("--accent") || "#7f8cff",
            green: getCssVariable("--green") || "#6abf8a",
            surface: getCssVariable("--surface-2") || "#25272c",
            borderStrong: getCssVariable("--border-strong") || "#484b53",
            warning: "#d6a83e"
        };
    }

    const BANK_PALETTE_KEYS = ["accent", "green", "warning", "borderStrong"];

    function bankColor(index, colors) {
        const key = BANK_PALETTE_KEYS[index % BANK_PALETTE_KEYS.length];
        return colors[key];
    }

    function chartTooltipOptions() {
        const colors = getChartColors();
        return {
            backgroundColor: colors.surface,
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: colors.grid,
            borderWidth: 1,
            padding: 10,
            displayColors: false
        };
    }


    /* ======================================================
       TOAST
    ====================================================== */

    function showToast(message) {
        if (!toastElement || !toastMessage) return;
        toastMessage.textContent = message;
        if (typeof bootstrap === "undefined") return;
        bootstrap.Toast.getOrCreateInstance(toastElement, { delay: 2600 }).show();
    }


    /* ======================================================
       GESTION GÉNÉRIQUE DES SELECTS
    ====================================================== */

    function clearSelect(select, placeholder) {
        if (!select) return;
        select.innerHTML = "";
        const option = document.createElement("option");
        option.value = "";
        option.textContent = placeholder;
        select.appendChild(option);
    }

    function addSelectOption(select, value, label) {
        if (!select) return;
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    }


    /* ======================================================
       RÉFÉRENTIEL ACADÉMIQUE (structure plate fournie par
       Django — mêmes clés que la page Situations financières)
    ====================================================== */

    function departmentsForFaculty(facultyId) {
        return academicStructure.departments.filter(
            d => String(d.facultyId) === String(facultyId)
        );
    }

    function programsForDepartment(departmentId) {
        return academicStructure.programs.filter(
            p => String(p.departmentId) === String(departmentId)
        );
    }

    function academicProgramsForProgram(programId) {
        return academicStructure.academicPrograms.filter(
            ap => String(ap.programId) === String(programId)
        );
    }


    function populateDepartments() {

        clearSelect(departmentFilter, "Tous les départements");
        clearSelect(programFilter, "Tous les parcours");
        clearSelect(levelFilter, "Tous les niveaux");

        if (programFilter) programFilter.disabled = true;
        if (levelFilter) levelFilter.disabled = true;

        const facultyId = facultyFilter?.value || "";

        if (!facultyId) {
            if (departmentFilter) departmentFilter.disabled = true;
            return;
        }

        const departments = departmentsForFaculty(facultyId);

        departments.forEach(department => {
            addSelectOption(departmentFilter, department.id, department.name);
        });

        if (departmentFilter) {
            departmentFilter.disabled = departments.length === 0;
        }
    }


    function populatePrograms() {

        clearSelect(programFilter, "Tous les parcours");
        clearSelect(levelFilter, "Tous les niveaux");

        if (levelFilter) levelFilter.disabled = true;

        const departmentId = departmentFilter?.value || "";

        if (!departmentId) {
            if (programFilter) programFilter.disabled = true;
            return;
        }

        const programs = programsForDepartment(departmentId);

        programs.forEach(program => {
            addSelectOption(programFilter, program.id, program.name);
        });

        if (programFilter) {
            programFilter.disabled = programs.length === 0;
        }
    }


    function populateLevels() {

        clearSelect(levelFilter, "Tous les niveaux");

        const programId = programFilter?.value || "";

        if (!programId) {
            if (levelFilter) levelFilter.disabled = true;
            return;
        }

        const academicPrograms = academicProgramsForProgram(programId);

        academicPrograms.forEach(ap => {
            addSelectOption(
                levelFilter, ap.id, ap.levelDisplay || ap.level
            );
        });

        if (levelFilter) {
            levelFilter.disabled = academicPrograms.length === 0;
        }
    }


    facultyFilter?.addEventListener("change", () => {
        populateDepartments();
        applyFilters();
    });

    departmentFilter?.addEventListener("change", () => {
        populatePrograms();
        applyFilters();
    });

    programFilter?.addEventListener("change", () => {
        populateLevels();
        applyFilters();
    });

    levelFilter?.addEventListener("change", applyFilters);


    /* ======================================================
       TOOLTIP COMMUN CHART.JS
    ====================================================== */
    // (voir chartTooltipOptions ci-dessus)


    /* ======================================================
       GRAPHIQUE : ÉVOLUTION DES RECETTES
    ====================================================== */

    function createRevenueChart() {

        const canvas = $("revenueChart");

        if (!canvas || typeof Chart === "undefined") {
            return;
        }

        if (revenueChart) {
            revenueChart.destroy();
        }

        const colors = getChartColors();

        revenueChart = new Chart(canvas, {
            type: "line",
            data: {
                labels: reportData.revenue.labels,
                datasets: [
                    {
                        label: "Encaissé",
                        data: reportData.revenue.collected,
                        borderColor: colors.accent,
                        backgroundColor: colors.accent,
                        borderWidth: 2,
                        pointRadius: 2.5,
                        pointHoverRadius: 5,
                        pointBackgroundColor: colors.accent,
                        pointBorderWidth: 0,
                        tension: .35,
                        fill: false
                    },
                    {
                        label: "Attendu",
                        data: reportData.revenue.expected,
                        borderColor: colors.borderStrong,
                        backgroundColor: colors.borderStrong,
                        borderWidth: 1.5,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        tension: .35,
                        fill: false
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
                        ...chartTooltipOptions(),
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
                        ticks: { color: colors.text, font: { size: 10 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: colors.grid },
                        ticks: {
                            color: colors.text,
                            font: { size: 10 },
                            callback(value) {
                                if (Math.abs(value) >= 1000) {
                                    return (value / 1000).toLocaleString(
                                        "fr-FR", { maximumFractionDigits: 0 }
                                    ) + " k";
                                }
                                return value;
                            }
                        }
                    }
                }
            }
        });
    }


    /* ======================================================
       GRAPHIQUE : RÉPARTITION PAR BANQUE
    ====================================================== */

    function createBankDistributionChart() {

        const canvas = $("bankDistributionChart");

        if (!canvas || typeof Chart === "undefined") {
            return;
        }

        if (bankDistributionChart) {
            bankDistributionChart.destroy();
        }

        const colors = getChartColors();
        const selectedBank = bankFilter?.value || "";

        let banks = Object.entries(reportData.banks);

        if (selectedBank) {
            banks = banks.filter(([key]) => key === selectedBank);
        }

        bankDistributionChart = new Chart(canvas, {
            type: "doughnut",
            data: {
                labels: banks.map(([, bank]) => bank.name),
                datasets: [{
                    data: banks.map(([, bank]) => Number(bank.collected)),
                    backgroundColor: banks.map(
                        (_, index) => bankColor(index, colors)
                    ),
                    borderWidth: 0,
                    hoverOffset: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "72%",
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...chartTooltipOptions(),
                        callbacks: {
                            label(context) {
                                return context.label + " : " + formatMoney(context.parsed);
                            }
                        }
                    }
                }
            }
        });

        renderBankLegend(banks, colors);
    }


    function renderBankLegend(banks, colors) {

        if (!bankReportLegend) {
            return;
        }

        bankReportLegend.innerHTML = "";

        banks.forEach(([, bank], index) => {

            const item = document.createElement("div");

            item.innerHTML = `
                <span class="bank-report-dot" style="background:${bankColor(index, colors)}"></span>
                <div>
                    <strong>${bank.name}</strong>
                    <small>${formatMoney(bank.collected)}</small>
                </div>
            `;

            bankReportLegend.appendChild(item);
        });
    }


    /* ======================================================
       GRAPHIQUE : RECOUVREMENT PAR FACULTÉ
    ====================================================== */

    function createFacultyChart() {

        const canvas = $("facultyChart");

        if (!canvas || typeof Chart === "undefined") {
            return;
        }

        if (facultyChart) {
            facultyChart.destroy();
        }

        const colors = getChartColors();
        const selectedFaculty = facultyFilter?.value || "";

        let faculties = Object.entries(reportData.faculties);

        if (selectedFaculty) {
            faculties = faculties.filter(([key]) => key === selectedFaculty);
        }

        const rates = faculties.map(([, faculty]) => {
            const expected = Number(faculty.expected);
            const collected = Number(faculty.collected);
            return expected > 0 ? (collected / expected) * 100 : 0;
        });

        facultyChart = new Chart(canvas, {
            type: "bar",
            data: {
                labels: faculties.map(([, faculty]) => faculty.name),
                datasets: [{
                    data: rates,
                    backgroundColor: colors.accent,
                    borderRadius: 5,
                    borderSkipped: false,
                    maxBarThickness: 28
                }]
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...chartTooltipOptions(),
                        callbacks: {
                            label(context) {
                                return formatPercent(context.raw);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: colors.grid },
                        ticks: {
                            color: colors.text,
                            callback: value => value + "%"
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: colors.text, font: { size: 10 } }
                    }
                }
            }
        });
    }


    /* ======================================================
       FILTRAGE DES TABLEAUX
    ====================================================== */

    function renderBankPerformanceTable() {

        if (!bankPerformanceBody) {
            return;
        }

        bankPerformanceBody.innerHTML = "";

        const selectedBank = bankFilter?.value || "";

        Object.entries(reportData.banks).forEach(([code, bank]) => {

            if (selectedBank && code !== selectedBank) {
                return;
            }

            const difference = Number(bank.collected) - Number(bank.system);

            const tr = document.createElement("tr");
            tr.dataset.bank = code;

            tr.innerHTML = `
                <td>
                    <div class="report-bank">
                        <div class="report-bank-icon"><i class="bi bi-bank"></i></div>
                        <div>
                            <strong>${bank.name}</strong>
                            <small>Banque partenaire</small>
                        </div>
                    </div>
                </td>
                <td>${formatMoney(bank.collected)}</td>
                <td>${formatMoney(bank.system)}</td>
                <td><span class="report-difference">${formatMoney(difference)}</span></td>
                <td>${Number(bank.transactions).toLocaleString("fr-FR")}</td>
                <td>${bank.anomalies}</td>
                <td>
                    <div class="report-progress">
                        <div><span style="width: ${Math.min(Number(bank.reconciliation), 100)}%"></span></div>
                        <small>${formatPercent(bank.reconciliation)}</small>
                    </div>
                </td>
            `;

            bankPerformanceBody.appendChild(tr);
        });
    }


    function renderFacultyReportTable() {

        if (!facultyReportBody) {
            return;
        }

        facultyReportBody.innerHTML = "";

        const selectedFaculty = facultyFilter?.value || "";

        Object.entries(reportData.faculties).forEach(([id, faculty]) => {

            if (selectedFaculty && id !== selectedFaculty) {
                return;
            }

            const expected = Number(faculty.expected);
            const collected = Number(faculty.collected);
            const remaining = Math.max(expected - collected, 0);
            const rate = expected > 0 ? (collected / expected) * 100 : 0;

            const tr = document.createElement("tr");
            tr.dataset.faculty = id;

            tr.innerHTML = `
                <td><strong>${faculty.name}</strong></td>
                <td>${faculty.students.toLocaleString("fr-FR")}</td>
                <td>${formatMoney(expected)}</td>
                <td>${formatMoney(collected)}</td>
                <td>${formatMoney(remaining)}</td>
                <td>
                    <div class="report-progress">
                        <div><span style="width: ${Math.min(rate, 100)}%"></span></div>
                        <small>${formatPercent(rate)}</small>
                    </div>
                </td>
            `;

            facultyReportBody.appendChild(tr);
        });
    }


    /* ======================================================
       CALCUL DES KPI
    ====================================================== */

    function updateKpis() {

        const selectedBank = bankFilter?.value || "";
        const selectedFaculty = facultyFilter?.value || "";

        let collected = 0;
        let expected = 0;
        let reconciliationWeighted = 0;
        let transactions = 0;
        let anomalies = 0;

        Object.entries(reportData.banks).forEach(([key, bank]) => {

            if (selectedBank && key !== selectedBank) {
                return;
            }

            collected += Number(bank.collected);
            expected += Number(bank.expected);
            transactions += Number(bank.transactions);
            anomalies += Number(bank.anomalies);
            reconciliationWeighted += Number(bank.reconciliation) * Number(bank.transactions);
        });

        let recoveryRate = expected > 0 ? (collected / expected) * 100 : 0;

        if (selectedFaculty) {

            const faculty = reportData.faculties[selectedFaculty];

            if (faculty) {
                collected = Number(faculty.collected);
                expected = Number(faculty.expected);
                recoveryRate = expected > 0 ? (collected / expected) * 100 : 0;
            }
        }

        const reconciliationRate = transactions > 0
            ? reconciliationWeighted / transactions
            : 0;

        if (totalCollectedKpi) totalCollectedKpi.textContent = formatMoney(collected);
        if (recoveryRateKpi) recoveryRateKpi.textContent = formatPercent(recoveryRate);
        if (reconciliationRateKpi) reconciliationRateKpi.textContent = formatPercent(reconciliationRate);
        if (openAnomaliesKpi) openAnomaliesKpi.textContent = anomalies;

        if (reconciliationCircleRate) {
            reconciliationCircleRate.textContent = formatPercent(reconciliationRate);
        }

        const kpi = reportData.kpi;

        if (matchedTransactionsCount) {
            matchedTransactionsCount.textContent = kpi.totalMatched.toLocaleString("fr-FR");
        }

        if (unassignedTransactionsCount) {
            unassignedTransactionsCount.textContent =
                Math.max(kpi.totalTransactions - kpi.totalMatched, 0).toLocaleString("fr-FR");
        }

        if (missingReferencesCount) {
            missingReferencesCount.textContent = kpi.missingReferences.toLocaleString("fr-FR");
        }

        if (amountMismatchCount) {
            amountMismatchCount.textContent = kpi.amountMismatches.toLocaleString("fr-FR");
        }
    }


    /* ======================================================
       PÉRIMÈTRE DU RAPPORT (résumé des filtres actifs)
    ====================================================== */

    function updateActiveContext() {

        if (!activeReportContextText) {
            return;
        }

        const parts = [];

        if (facultyFilter?.value) parts.push(getSelectedText(facultyFilter));
        if (departmentFilter?.value) parts.push(getSelectedText(departmentFilter));
        if (programFilter?.value) parts.push(getSelectedText(programFilter));
        if (levelFilter?.value) parts.push(getSelectedText(levelFilter));
        if (bankFilter?.value) parts.push(getSelectedText(bankFilter));

        activeReportContextText.textContent =
            parts.length ? parts.join(" · ") : "Toutes les facultés";
    }


    /* ======================================================
       APPLIQUER LES FILTRES
    ====================================================== */

    function applyFilters() {

        renderBankPerformanceTable();
        renderFacultyReportTable();
        updateKpis();
        updateActiveContext();
        createBankDistributionChart();
        createFacultyChart();
    }


    /* ======================================================
       ANNÉE ACADÉMIQUE

       Toutes les données sont calculées côté serveur pour
       l'année académique active. Changer d'année recharge donc
       la page avec le bon paramètre.
    ====================================================== */

    academicYearFilter?.addEventListener("change", () => {

        const url = new URL(window.location.href);
        url.searchParams.set("academic_year", academicYearFilter.value);
        window.location.href = url.toString();
    });


    /* ======================================================
       PÉRIODE / BANQUE
    ====================================================== */

    periodFilter?.addEventListener("change", () => {
        // La période affine uniquement la courbe de recettes,
        // déjà calculée sur 11 mois glissants côté serveur ;
        // on se contente ici de rafraîchir l'affichage.
        applyFilters();
    });

    bankFilter?.addEventListener("change", applyFilters);


    /* ======================================================
       RÉINITIALISATION DES FILTRES
    ====================================================== */

    function resetAllFilters() {

        if (periodFilter) periodFilter.value = "year";
        if (bankFilter) bankFilter.value = "";
        if (facultyFilter) facultyFilter.value = "";

        clearSelect(departmentFilter, "Tous les départements");
        clearSelect(programFilter, "Tous les parcours");
        clearSelect(levelFilter, "Tous les niveaux");

        if (departmentFilter) departmentFilter.disabled = true;
        if (programFilter) programFilter.disabled = true;
        if (levelFilter) levelFilter.disabled = true;

        applyFilters();
    }


    resetFiltersButton?.addEventListener("click", () => {
        resetAllFilters();
        showToast("Filtres réinitialisés.");
    });


    /* ======================================================
       IMPRESSION
    ====================================================== */

    printButton?.addEventListener("click", () => {
        window.print();
    });


    /* ======================================================
       EXPORT CSV
    ====================================================== */

    function escapeCsv(value) {
        return '"' + String(value ?? "").replace(/"/g, '""') + '"';
    }

    function csvRow(cells) {
        return cells.map(escapeCsv).join(";");
    }

    exportButton?.addEventListener("click", () => {

        const rows = [];

        rows.push(["RAPPORT FINANCIER ACADEMICPAY"]);
        rows.push([]);

        rows.push(["CRITÈRES DU RAPPORT"]);
        rows.push(["Année académique", getSelectedText(academicYearFilter)]);
        rows.push(["Période", getSelectedText(periodFilter)]);
        rows.push(["Banque", getSelectedText(bankFilter) || "Toutes les banques"]);
        rows.push(["Faculté", getSelectedText(facultyFilter) || "Toutes les facultés"]);
        rows.push([
            "Département",
            departmentFilter?.value ? getSelectedText(departmentFilter) : "Tous les départements"
        ]);
        rows.push([
            "Parcours / Spécialisation",
            programFilter?.value ? getSelectedText(programFilter) : "Tous les parcours"
        ]);
        rows.push([
            "Niveau académique",
            levelFilter?.value ? getSelectedText(levelFilter) : "Tous les niveaux"
        ]);
        rows.push([]);

        rows.push(["INDICATEURS"]);
        rows.push(["Total encaissé", totalCollectedKpi?.textContent?.trim() || ""]);
        rows.push(["Taux de recouvrement", recoveryRateKpi?.textContent?.trim() || ""]);
        rows.push(["Taux de rapprochement", reconciliationRateKpi?.textContent?.trim() || ""]);
        rows.push(["Anomalies ouvertes", openAnomaliesKpi?.textContent?.trim() || ""]);
        rows.push([]);

        rows.push(["BANQUES"]);
        rows.push(["Banque", "Extrait bancaire", "AcademicPay", "Écart", "Transactions", "Anomalies", "Rapprochement"]);

        Object.entries(reportData.banks).forEach(([, bank]) => {
            rows.push([
                bank.name,
                formatMoney(bank.collected),
                formatMoney(bank.system),
                formatMoney(Number(bank.collected) - Number(bank.system)),
                bank.transactions,
                bank.anomalies,
                formatPercent(bank.reconciliation)
            ]);
        });

        rows.push([]);

        rows.push(["FACULTÉS"]);
        rows.push(["Faculté", "Étudiants", "Montant attendu", "Montant payé", "Reste", "Recouvrement"]);

        Object.entries(reportData.faculties).forEach(([, faculty]) => {
            const expected = Number(faculty.expected);
            const collected = Number(faculty.collected);
            const rate = expected > 0 ? (collected / expected) * 100 : 0;

            rows.push([
                faculty.name,
                faculty.students,
                formatMoney(expected),
                formatMoney(collected),
                formatMoney(Math.max(expected - collected, 0)),
                formatPercent(rate)
            ]);
        });

        const csv = "\uFEFF" + rows.map(csvRow).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `rapport-financier-${academicYearFilter?.value || "academicpay"}.csv`;

        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        showToast("Export CSV généré.");
    });


    /* ======================================================
       THÈME
    ====================================================== */

    function initializeTheme() {

        const savedTheme = localStorage.getItem("academicpay-finance-theme");

        if (savedTheme === "light") {
            document.body.classList.add("light-theme");
            document.documentElement.setAttribute("data-theme", "light");
        } else {
            document.body.classList.remove("light-theme");
            document.documentElement.setAttribute("data-theme", "dark");
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

    function refreshChartsForTheme() {
        createRevenueChart();
        createBankDistributionChart();
        createFacultyChart();
    }

    themeButton?.addEventListener("click", () => {

        document.body.classList.toggle("light-theme");

        const lightMode = document.body.classList.contains("light-theme");
        const theme = lightMode ? "light" : "dark";

        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("academicpay-finance-theme", theme);

        updateThemeIcon();

        requestAnimationFrame(refreshChartsForTheme);
    });


    /* ======================================================
       REDIMENSIONNEMENT DES GRAPHIQUES
    ====================================================== */

    let resizeTimeout = null;

    window.addEventListener("resize", () => {

        clearTimeout(resizeTimeout);

        resizeTimeout = setTimeout(() => {
            revenueChart?.resize();
            bankDistributionChart?.resize();
            facultyChart?.resize();
        }, 150);
    });


    /* ======================================================
       INITIALISATION DES FILTRES ACADÉMIQUES
    ====================================================== */

    if (departmentFilter) departmentFilter.disabled = true;
    if (programFilter) programFilter.disabled = true;
    if (levelFilter) levelFilter.disabled = true;


    /* ======================================================
       INITIALISATION GÉNÉRALE
    ====================================================== */

    initializeTheme();
    createRevenueChart();
    applyFilters();

    console.info(
        `AcademicPay : ${Object.keys(reportData.banks).length} banques, ` +
        `${Object.keys(reportData.faculties).length} facultés chargées.`
    );

});
