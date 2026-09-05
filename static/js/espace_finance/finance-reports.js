/* ==========================================================
   ACADEMICPAY — FINANCE / RAPPORTS
   finance-reports.js
   Django version with dynamic data
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* ======================================================
       ÉLÉMENTS DOM
    ====================================================== */

    const academicYearFilter =
        document.getElementById("academicYearFilter");

    const periodFilter =
        document.getElementById("periodFilter");

    const bankFilter =
        document.getElementById("bankFilter");

    const facultyFilter =
        document.getElementById("facultyFilter");

    const departmentFilter =
        document.getElementById("departmentFilter");

    const programFilter =
        document.getElementById("programFilter");

    const levelFilter =
        document.getElementById("levelFilter");

    const resetFiltersButton =
        document.getElementById("resetReportFilters");

    const exportButton =
        document.getElementById("exportReportButton");

    const printButton =
        document.getElementById("printReportButton");

    const themeButton =
        document.getElementById("themeButton");

    const bankPerformanceBody =
        document.getElementById("bankPerformanceBody");

    const facultyReportBody =
        document.getElementById("facultyReportBody");

    const toastElement =
        document.getElementById("financeToast");

    const toastMessage =
        document.getElementById("toastMessage");

    const sidebarAnomalyCount =
        document.getElementById("sidebarAnomalyCount");


    /* ======================================================
       KPI
    ====================================================== */

    const totalCollectedKpi =
        document.getElementById("totalCollectedKpi");

    const recoveryRateKpi =
        document.getElementById("recoveryRateKpi");

    const reconciliationRateKpi =
        document.getElementById("reconciliationRateKpi");

    const openAnomaliesKpi =
        document.getElementById("openAnomaliesKpi");


    /* ======================================================
       DATA FROM DJANGO
    ====================================================== */

    // Get data from Django
    let reportData = {
        banks: {},
        faculties: {},
        revenue: {
            labels: [],
            collected: [],
            expected: []
        }
    };

    try {
        const dataScript = document.getElementById('report-data');
        if (dataScript) {
            reportData = JSON.parse(dataScript.textContent);
        }
    } catch (e) {
        console.warn('Error parsing report data:', e);
    }

    console.log('Report Data:', reportData);


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
        return Number(value || 0)
            .toLocaleString("fr-FR", {
                maximumFractionDigits: 0
            }) + " $";
    }

    function formatPercent(value) {
        return Number(value || 0)
            .toLocaleString("fr-FR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1
            }) + " %";
    }

    function getSelectedText(select) {
        if (!select) return "";
        const option = select.options[select.selectedIndex];
        return option ? option.text.trim() : "";
    }

    function getCssVariable(name) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(name)
            .trim();
    }


    /* ======================================================
       CHART COLORS
    ====================================================== */

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


    /* ======================================================
       TOAST
    ====================================================== */

    function showToast(message) {
        if (!toastElement || !toastMessage || typeof bootstrap === "undefined") {
            return;
        }
        toastMessage.textContent = message;
        bootstrap.Toast.getOrCreateInstance(toastElement, { delay: 2500 }).show();
    }


    /* ======================================================
       TOOLTIP OPTIONS
    ====================================================== */

    function chartTooltipOptions() {
        return {
            backgroundColor: getCssVariable("--surface") || "#222428",
            titleColor: getCssVariable("--text") || "#ffffff",
            bodyColor: getCssVariable("--soft") || "#d6d7da",
            borderColor: getCssVariable("--border") || "rgba(255,255,255,.1)",
            borderWidth: 1,
            padding: 10,
            displayColors: true,
            cornerRadius: 7
        };
    }


    /* ======================================================
       GRAPHIQUE : ÉVOLUTION DES RECETTES
    ====================================================== */

    function createRevenueChart() {
        const canvas = document.getElementById("revenueChart");

        if (!canvas || typeof Chart === "undefined") return;

        if (revenueChart) {
            revenueChart.destroy();
        }

        const colors = getChartColors();

        revenueChart = new Chart(canvas, {
            type: "line",
            data: {
                labels: reportData.revenue.labels || [],
                datasets: [
                    {
                        label: "Encaissé",
                        data: reportData.revenue.collected || [],
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
                        data: reportData.revenue.expected || [],
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
                                return context.dataset.label + " : " + formatMoney(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        border: { display: false },
                        grid: { display: false },
                        ticks: {
                            color: colors.text,
                            font: { size: 9 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        border: { display: false },
                        grid: {
                            color: colors.grid,
                            drawTicks: false
                        },
                        ticks: {
                            color: colors.text,
                            padding: 8,
                            font: { size: 9 },
                            callback(value) {
                                if (value >= 1000) return (value / 1000) + "k";
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
        const canvas = document.getElementById("bankDistributionChart");

        if (!canvas || typeof Chart === "undefined") return;

        if (bankDistributionChart) {
            bankDistributionChart.destroy();
        }

        const colors = getChartColors();
        const banks = Object.values(reportData.banks || {});

        const backgroundColor = banks.map((bank, index) => {
            const colors_list = [colors.accent, colors.green, colors.warning];
            return colors_list[index % colors_list.length];
        });

        bankDistributionChart = new Chart(canvas, {
            type: "doughnut",
            data: {
                labels: banks.map(bank => bank.name),
                datasets: [{
                    data: banks.map(bank => bank.collected || 0),
                    backgroundColor: backgroundColor,
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
    }


    /* ======================================================
       GRAPHIQUE : RECOUVREMENT PAR FACULTÉ
    ====================================================== */

    function createFacultyChart() {
        const canvas = document.getElementById("facultyChart");

        if (!canvas || typeof Chart === "undefined") return;

        if (facultyChart) {
            facultyChart.destroy();
        }

        const colors = getChartColors();
        const faculties = Object.values(reportData.faculties || {});

        const rates = faculties.map(faculty => {
            if (!faculty.expected) return 0;
            return (faculty.collected / faculty.expected) * 100;
        });

        facultyChart = new Chart(canvas, {
            type: "bar",
            data: {
                labels: faculties.map(faculty => faculty.name),
                datasets: [{
                    label: "Recouvrement",
                    data: rates,
                    backgroundColor: colors.accent,
                    borderRadius: 5,
                    borderSkipped: false,
                    maxBarThickness: 36
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: "y",
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...chartTooltipOptions(),
                        callbacks: {
                            label(context) {
                                return "Recouvrement : " + formatPercent(context.parsed.x);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        border: { display: false },
                        grid: { color: colors.grid },
                        ticks: {
                            color: colors.text,
                            font: { size: 9 },
                            callback(value) { return value + " %"; }
                        }
                    },
                    y: {
                        border: { display: false },
                        grid: { display: false },
                        ticks: {
                            color: colors.text,
                            font: { size: 9 }
                        }
                    }
                }
            }
        });
    }


    /* ======================================================
       FILTRAGE DES TABLEAUX
    ====================================================== */

    function filterTables() {
        const selectedBank = bankFilter?.value || "";
        const selectedFaculty = facultyFilter?.value || "";

        // Banks
        if (bankPerformanceBody) {
            Array.from(bankPerformanceBody.querySelectorAll("tr")).forEach(row => {
                row.hidden = Boolean(selectedBank) && row.dataset.bank !== selectedBank;
            });
        }

        // Faculties
        if (facultyReportBody) {
            Array.from(facultyReportBody.querySelectorAll("tr")).forEach(row => {
                row.hidden = Boolean(selectedFaculty) && row.dataset.faculty !== selectedFaculty;
            });
        }
    }


    /* ======================================================
       CALCUL DES KPI
    ====================================================== */

    function updateKpis() {
        const selectedBank = bankFilter?.value || "";
        const selectedFaculty = facultyFilter?.value || "";

        // Get the KPI values from the DOM (they are set by Django)
        // The values are already rendered in the HTML
    }


    /* ======================================================
       APPLIQUER LES FILTRES
    ====================================================== */

    function applyFilters() {
        filterTables();
        updateKpis();

        // Recreate charts with filtered data
        // For now, we just use the data from Django
        // In a full implementation, you would refetch data
    }


    /* ======================================================
       RÉINITIALISATION DES FILTRES
    ====================================================== */

    resetFiltersButton?.addEventListener("click", () => {
        if (academicYearFilter) academicYearFilter.selectedIndex = 0;
        if (periodFilter) periodFilter.value = "year";
        if (bankFilter) bankFilter.value = "";
        if (facultyFilter) facultyFilter.value = "";

        // Reset dependent filters
        if (departmentFilter) {
            departmentFilter.innerHTML = '<option value="">Tous les départements</option>';
            departmentFilter.disabled = true;
        }
        if (programFilter) {
            programFilter.innerHTML = '<option value="">Tous les parcours</option>';
            programFilter.disabled = true;
        }
        if (levelFilter) {
            levelFilter.innerHTML = '<option value="">Tous les niveaux</option>';
            levelFilter.disabled = true;
        }

        applyFilters();
        showToast("Filtres réinitialisés.");
    });


    /* ======================================================
       FILTRE FACULTÉ - cascade
    ====================================================== */

    facultyFilter?.addEventListener("change", () => {
        if (facultyFilter.value) {
            showToast("Faculté : " + getSelectedText(facultyFilter));
        }
        applyFilters();
    });


    /* ======================================================
       BANQUE FILTER
    ====================================================== */

    bankFilter?.addEventListener("change", () => {
        if (bankFilter.value) {
            showToast("Banque : " + getSelectedText(bankFilter));
        } else {
            showToast("Toutes les banques.");
        }
        applyFilters();
    });


    /* ======================================================
       ANNÉE ACADÉMIQUE
    ====================================================== */

    academicYearFilter?.addEventListener("change", () => {
        showToast("Année académique : " + getSelectedText(academicYearFilter));
        // Reload page with new academic year
        window.location.search = `?academic_year=${academicYearFilter.value}`;
    });


    /* ======================================================
       PÉRIODE
    ====================================================== */

    periodFilter?.addEventListener("change", () => {
        showToast("Période : " + getSelectedText(periodFilter));
        // You could reload with period filter
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

    exportButton?.addEventListener("click", () => {
        const year = academicYearFilter?.value || "rapport";
        const url = `/finance/reports/export/?academic_year=${year}`;
        window.location.href = url;
        showToast("Rapport CSV généré.");
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

    let resizeTimer = null;

    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            revenueChart?.resize();
            bankDistributionChart?.resize();
            facultyChart?.resize();
        }, 120);
    });


    /* ======================================================
       INITIALISATION
    ====================================================== */

    function init() {
        initializeTheme();
        createRevenueChart();
        createBankDistributionChart();
        createFacultyChart();
        filterTables();
        updateKpis();

        console.info("AcademicPay : Finance Reports initialized with Django data.");
    }

    init();

});