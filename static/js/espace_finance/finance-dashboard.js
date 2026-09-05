/* ==========================================================
   ACADEMICPAY — FINANCE DASHBOARD
   finance-dashboard.js
========================================================== */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    /* ======================================================
       DONNÉES DE DÉMONSTRATION

       Ces données seront remplacées plus tard par les données
       provenant de Django / PostgreSQL.

       Les codes des facultés correspondent exactement au
       référentiel académique UCB utilisé par AcademicPay.
    ====================================================== */

    const dashboardData = JSON.parse(
    document.getElementById("dashboard-data").textContent
    );

    console.log(dashboardData);

    /* ======================================================
       ÉTAT DU DASHBOARD
    ====================================================== */

    let selectedChartPeriod = "1M";
    let incomeChart = null;


    /* ======================================================
       RACCOURCIS DOM
    ====================================================== */

    const $ = id => document.getElementById(id);


    /* ======================================================
       FORMATAGE
    ====================================================== */

    function money(value) {
        return new Intl.NumberFormat(
            "fr-FR",
            {
                maximumFractionDigits: 0
            }
        ).format(
            Math.round(value)
        ) + " $";
    }


    function percent(value) {
        return new Intl.NumberFormat(
            "fr-FR",
            {
                minimumFractionDigits: 0,
                maximumFractionDigits: 1
            }
        ).format(value) + "%";
    }


    function setText(id, value) {
        const element = $(id);

        if (element) {
            element.textContent = value;
        }
    }


    /* ======================================================
       TOAST
    ====================================================== */

    function showToast(message) {
        const toastElement = $("financeToast");
        const toastMessage = $("toastMessage");

        if (
            !toastElement ||
            !toastMessage ||
            typeof bootstrap === "undefined"
        ) {
            return;
        }

        toastMessage.textContent = message;

        bootstrap.Toast
            .getOrCreateInstance(
                toastElement,
                {
                    delay: 2600
                }
            )
            .show();
    }


    /* ======================================================
       THÈME
    ====================================================== */

    const themeButton = $("themeButton");

    const savedTheme =
        localStorage.getItem("academicpay-finance-theme") ||
        localStorage.getItem("academicPayFinanceTheme");


    if (savedTheme === "light") {
        document.body.classList.add("light-theme");
    }


    function updateThemeIcon() {
        const icon = themeButton?.querySelector("i");

        if (!icon) {
            return;
        }

        const light =
            document.body.classList.contains("light-theme");

        icon.className =
            light
                ? "bi bi-moon"
                : "bi bi-sun";

        themeButton.title =
            light
                ? "Activer le mode sombre"
                : "Activer le mode clair";
    }


    function chartColors() {
        const light =
            document.body.classList.contains("light-theme");

        return {
            text:
                light
                    ? "#666666"
                    : "#8b8f94",

            grid:
                light
                    ? "rgba(0, 0, 0, .07)"
                    : "rgba(255, 255, 255, .055)"
        };
    }


    function updateChartTheme() {
        if (!incomeChart) {
            return;
        }

        const colors = chartColors();

        incomeChart.options.scales.x.ticks.color =
            colors.text;

        incomeChart.options.scales.y.ticks.color =
            colors.text;

        incomeChart.options.scales.y.grid.color =
            colors.grid;

        incomeChart.update();
    }


    updateThemeIcon();


    themeButton?.addEventListener(
        "click",
        () => {
            document.body.classList.toggle(
                "light-theme"
            );

            const light =
                document.body.classList.contains(
                    "light-theme"
                );

            const theme =
                light
                    ? "light"
                    : "dark";

            localStorage.setItem(
                "academicpay-finance-theme",
                theme
            );

            localStorage.setItem(
                "academicPayFinanceTheme",
                theme
            );

            updateThemeIcon();
            updateChartTheme();

            showToast(
                light
                    ? "Thème clair activé."
                    : "Thème sombre activé."
            );
        }
    );


    /* ======================================================
       ÉVOLUTIONS
    ====================================================== */

    function renderEvolution(
        id,
        value,
        lowerIsBetter = false
    ) {
        const element = $(id);

        if (!element) {
            return;
        }

        const positive =
            lowerIsBetter
                ? value <= 0
                : value >= 0;

        element.classList.remove(
            "positive",
            "negative"
        );

        element.classList.add(
            positive
                ? "positive"
                : "negative"
        );

        const icon =
            value >= 0
                ? "bi-arrow-up-short"
                : "bi-arrow-down-short";

        element.innerHTML = `
            <i class="bi ${icon}"></i>
            ${Math.abs(value).toFixed(2)}%
        `;
    }


    /* ======================================================
       FACULTÉS UCB
    ====================================================== */

    function renderFaculties() {
        Object.values(
            dashboardData.faculties
        ).forEach(faculty => {

            /*
             * On cherche la faculté grâce à son code.
             *
             * Exemple :
             *
             * data-faculty="AGRO"
             * data-faculty="DROIT"
             *
             * On ne dépend donc plus de la position
             * de la ligne dans le HTML.
             */

            const row =
                document.querySelector(
                    `.faculty-row[data-faculty="${faculty.code}"]`
                );

            if (!row) {
                return;
            }

            const rate =
                faculty.expected > 0
                    ? (
                        faculty.collected /
                        faculty.expected
                    ) * 100
                    : 0;


            const name =
                row.querySelector(
                    ".faculty-heading span"
                );

            const percentage =
                row.querySelector(
                    ".faculty-heading strong"
                );

            const amount =
                row.querySelector(
                    ".faculty-amount"
                );

            const progress =
                row.querySelector(
                    ".faculty-progress span"
                );


            if (name) {
                name.textContent =
                    faculty.name;
            }


            if (percentage) {
                percentage.textContent =
                    Math.round(rate) + "%";
            }


            if (amount) {
                amount.textContent =
                    money(faculty.collected) +
                    " / " +
                    money(faculty.expected);
            }


            if (progress) {
                progress.style.width =
                    Math.min(
                        100,
                        Math.max(0, rate)
                    ) + "%";
            }
        });
    }


    /* ======================================================
       STATISTIQUES DU GRAPHIQUE
    ====================================================== */

    function updateChartStatistics(values) {
        if (
            !Array.isArray(values) ||
            !values.length
        ) {
            return;
        }

        const total =
            values.reduce(
                (sum, value) =>
                    sum + value,
                0
            );

        const average =
            total / values.length;

        const best =
            Math.max(...values);


        setText(
            "periodTotal",
            money(total)
        );

        setText(
            "periodAverage",
            money(average)
        );

        setText(
            "periodBest",
            money(best)
        );
    }


    /* ======================================================
       CRÉATION DU GRAPHIQUE
    ====================================================== */

    function createChart() {
        const canvas = $("incomeChart");

        if (
            !canvas ||
            typeof Chart === "undefined"
        ) {
            return;
        }

        const ctx =
            canvas.getContext("2d");

        const gradient =
            ctx.createLinearGradient(
                0,
                0,
                0,
                280
            );


        gradient.addColorStop(
            0,
            "rgba(185, 237, 46, .32)"
        );

        gradient.addColorStop(
            0.55,
            "rgba(185, 237, 46, .08)"
        );

        gradient.addColorStop(
            1,
            "rgba(185, 237, 46, 0)"
        );


        const colors =
            chartColors();

        const chartData =
            dashboardData
                .charts[
                    selectedChartPeriod
                ];


        incomeChart =
            new Chart(
                ctx,
                {
                    type: "line",

                    data: {
                        labels:
                            chartData.labels,

                        datasets: [
                            {
                                data:
                                    chartData.values,

                                borderColor:
                                    "#b9ed2e",

                                backgroundColor:
                                    gradient,

                                borderWidth:
                                    2,

                                fill:
                                    true,

                                tension:
                                    0.35,

                                pointRadius:
                                    0,

                                pointHoverRadius:
                                    5,

                                pointHoverBackgroundColor:
                                    "#b9ed2e",

                                pointHoverBorderColor:
                                    "#111",

                                pointHoverBorderWidth:
                                    2
                            }
                        ]
                    },

                    options: {
                        responsive:
                            true,

                        maintainAspectRatio:
                            false,

                        interaction: {
                            intersect:
                                false,

                            mode:
                                "index"
                        },

                        plugins: {
                            legend: {
                                display:
                                    false
                            },

                            tooltip: {
                                displayColors:
                                    false,

                                backgroundColor:
                                    "#202020",

                                borderColor:
                                    "rgba(185, 237, 46, .25)",

                                borderWidth:
                                    1,

                                titleColor:
                                    "#999",

                                bodyColor:
                                    "#b9ed2e",

                                padding:
                                    11,

                                callbacks: {
                                    label:
                                        context =>
                                            money(
                                                context.raw
                                            )
                                }
                            }
                        },

                        scales: {
                            x: {
                                border: {
                                    display:
                                        false
                                },

                                grid: {
                                    display:
                                        false
                                },

                                ticks: {
                                    color:
                                        colors.text,

                                    font: {
                                        size:
                                            11
                                    },

                                    maxRotation:
                                        0
                                }
                            },

                            y: {
                                border: {
                                    display:
                                        false
                                },

                                grid: {
                                    color:
                                        colors.grid
                                },

                                ticks: {
                                    color:
                                        colors.text,

                                    font: {
                                        size:
                                            11
                                    },

                                    callback:
                                        value => {
                                            if (
                                                value >=
                                                1000
                                            ) {
                                                return (
                                                    Math.round(
                                                        value /
                                                        1000
                                                    ) +
                                                    "k"
                                                );
                                            }

                                            return value;
                                        }
                                }
                            }
                        }
                    }
                }
            );


        updateChartStatistics(
            chartData.values
        );
    }


    /* ======================================================
       CHANGEMENT DE PÉRIODE DU GRAPHIQUE

       Ces boutons 1D / 1W / 1M / 3M / 1Y restent utiles :
       ils concernent uniquement le graphique.
    ====================================================== */

    function updateChart() {
        const chartData =
            dashboardData
                .charts[
                    selectedChartPeriod
                ];

        if (
            !chartData ||
            !incomeChart
        ) {
            return;
        }


        incomeChart.data.labels =
            chartData.labels;

        incomeChart
            .data
            .datasets[0]
            .data =
                chartData.values;

        incomeChart.update();


        updateChartStatistics(
            chartData.values
        );
    }


    document
        .querySelectorAll(
            "#chartPeriods button"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const period =
                        button.dataset.period;

                    if (
                        !period ||
                        !dashboardData
                            .charts[
                                period
                            ]
                    ) {
                        return;
                    }


                    selectedChartPeriod =
                        period;


                    document
                        .querySelectorAll(
                            "#chartPeriods button"
                        )
                        .forEach(item => {
                            item.classList.remove(
                                "active"
                            );
                        });


                    button.classList.add(
                        "active"
                    );


                    updateChart();
                }
            );
        });


    /* ======================================================
       ACTUALISATION DES DONNÉES DU DASHBOARD
    ====================================================== */

    function renderDashboard() {
        const data =
            dashboardData;


        /* --------------------------------------------------
           CALCULS
        -------------------------------------------------- */

        const remaining =
            Math.max(
                0,
                data.expected -
                data.collected
            );


        const recovery =
            data.expected > 0
                ? (
                    data.collected /
                    data.expected
                ) * 100
                : 0;


        /*
         * Écart bancaire conservé :
         *
         * montant bancaire
         *      -
         * montant enregistré dans AcademicPay
         */

        const gap =
            data.bank -
            data.collected;


        const gapRate =
            data.bank > 0
                ? (
                    Math.abs(gap) /
                    data.bank
                ) * 100
                : 0;


        /* --------------------------------------------------
           INDICATEURS CLÉS
        -------------------------------------------------- */

        setText(
            "todayIncome",
            money(data.today)
        );

        setText(
            "validatedPayments",
            data.validated
        );

        setText(
            "pendingAnomalies",
            data.anomalies
        );

        setText(
            "recoveryRate",
            percent(recovery)
        );

        setText(
            "globalBankGap",
            money(gap)
        );


        /* --------------------------------------------------
           KPI
        -------------------------------------------------- */

        setText(
            "expectedAmount",
            money(data.expected)
        );

        setText(
            "collectedAmount",
            money(data.collected)
        );

        setText(
            "remainingAmount",
            money(remaining)
        );

        setText(
            "anomalyKpi",
            data.anomalies
        );


        /* --------------------------------------------------
           ÉVOLUTIONS
        -------------------------------------------------- */

        renderEvolution(
            "todayIncomeEvolution",
            data.evolutions.todayIncome
        );

        renderEvolution(
            "validatedPaymentsEvolution",
            data.evolutions.validatedPayments
        );

        renderEvolution(
            "expectedAmountEvolution",
            data.evolutions.expectedAmount
        );

        renderEvolution(
            "collectedAmountEvolution",
            data.evolutions.collectedAmount
        );

        /*
         * Pour "à recouvrer", une diminution est positive.
         */

        renderEvolution(
            "remainingAmountEvolution",
            data.evolutions.remainingAmount,
            true
        );

        /*
         * Pour les anomalies également :
         * moins d'anomalies = amélioration.
         */

        renderEvolution(
            "anomalyEvolution",
            data.evolutions.anomalies,
            true
        );


        /* --------------------------------------------------
           RAPPROCHEMENT BANCAIRE
        -------------------------------------------------- */

        setText(
            "bankAmount",
            money(data.bank)
        );

        setText(
            "systemAmount",
            money(data.collected)
        );

        setText(
            "reconciliationGap",
            money(gap)
        );

        setText(
            "donutGap",
            money(gap)
        );

        setText(
            "donutGapRate",
            percent(gapRate)
        );


        /* --------------------------------------------------
           BADGES ANOMALIES
        -------------------------------------------------- */

        document
            .querySelectorAll(
                ".nav-badge, .mobile-badge"
            )
            .forEach(badge => {
                badge.textContent =
                    data.anomalies;
            });


        /* --------------------------------------------------
           FACULTÉS
        -------------------------------------------------- */

        renderFaculties();
    }


    /* ======================================================
       EXAMINER UNE ANOMALIE

       IMPORTANT :
       le bouton ne redirige pas directement.

       1. On récupère la ligne concernée.
       2. On remplit la modale.
       3. On ouvre la modale.
       4. Depuis la modale, l'utilisateur peut ensuite ouvrir
          le module Anomalies avec la référence correspondante.
    ====================================================== */

    document
        .querySelectorAll(
            ".anomaly-examine"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const row =
                        button.closest("tr");

                    if (!row) {
                        return;
                    }


                    const cells =
                        row.querySelectorAll("td");


                    const student =
                        cells[0]
                            ?.innerText
                            ?.trim()
                            ?.replace(
                                /\s+/g,
                                " "
                            ) ||
                        "—";


                    const reference =
                        button
                            .dataset
                            .reference ||
                        cells[1]
                            ?.innerText
                            ?.trim() ||
                        "—";


                    const problem =
                        cells[2]
                            ?.innerText
                            ?.trim()
                            ?.replace(
                                /\s+/g,
                                " "
                            ) ||
                        "—";


                    const date =
                        cells[3]
                            ?.innerText
                            ?.trim()
                            ?.replace(
                                /\s+/g,
                                " "
                            ) ||
                        "—";


                    /* Remplissage de la modale */

                    setText(
                        "anomalyStudent",
                        student
                    );

                    setText(
                        "anomalyReference",
                        reference
                    );

                    setText(
                        "anomalyProblem",
                        problem
                    );

                    setText(
                        "anomalyDate",
                        date
                    );


                    /*
                     * Préparation du lien permettant ensuite
                     * d'ouvrir l'anomalie précise dans le
                     * module complet.
                     */

                    const moduleLink =
                        $("openAnomalyModule");

                    if (moduleLink) {
                        moduleLink.href =
                            "finance-anomalies.html?reference=" +
                            encodeURIComponent(
                                reference
                            );
                    }


                    /* Ouverture de la modale */

                    const modalElement =
                        $("anomalyDetailModal");

                    if (
                        modalElement &&
                        typeof bootstrap !==
                        "undefined"
                    ) {
                        bootstrap.Modal
                            .getOrCreateInstance(
                                modalElement
                            )
                            .show();
                    }
                }
            );
        });


    /* ======================================================
       TOOLTIPS BOOTSTRAP
    ====================================================== */

    if (
        typeof bootstrap !==
        "undefined"
    ) {
        document
            .querySelectorAll(
                "[title]"
            )
            .forEach(element => {

                new bootstrap.Tooltip(
                    element
                );
            });
    }


    /* ======================================================
       INITIALISATION
    ====================================================== */

    createChart();

    renderDashboard();
});