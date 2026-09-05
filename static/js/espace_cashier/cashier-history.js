document.addEventListener("DOMContentLoaded", () => {

    const searchInput =
        document.getElementById("historySearch");

    const actionFilter =
        document.getElementById("actionFilter");

    const periodFilter =
        document.getElementById("periodFilter");

    const resetButton =
        document.getElementById("resetFilters");

    const historyRows =
        document.querySelectorAll(".history-row");

    const resultCount =
        document.getElementById("resultCount");

    const emptyState =
        document.getElementById("emptyState");


    /* =====================================================
       NORMALISATION DU TEXTE
    ====================================================== */

    function normalizeText(text) {

        return text
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    }


    /* =====================================================
       FILTRAGE
    ====================================================== */

    function filterHistory() {

        const searchTerm =
            normalizeText(searchInput.value);

        const selectedAction =
            actionFilter.value;

        const selectedPeriod =
            periodFilter.value;

        let visibleCount = 0;


        historyRows.forEach((row) => {

            const rowText =
                normalizeText(row.textContent);

            // FIX: Added .trim() to remove whitespace from data attributes
            const rowAction =
                row.dataset.action.trim() || "";

            const rowPeriod =
                row.dataset.period.trim() || "";


            /* -----------------------------
               RECHERCHE
            ----------------------------- */

            const matchesSearch =
                searchTerm === "" ||
                rowText.includes(searchTerm);


            /* -----------------------------
               TYPE D'OPÉRATION
            ----------------------------- */

            const matchesAction =
                selectedAction === "all" ||
                rowAction === selectedAction;


            /* -----------------------------
               PÉRIODE
            ----------------------------- */

            let matchesPeriod = true;


            if (selectedPeriod === "today") {

                matchesPeriod =
                    rowPeriod === "today";

            }

            else if (selectedPeriod === "week") {

                matchesPeriod =
                    rowPeriod === "today" ||
                    rowPeriod === "week";

            }

            else if (selectedPeriod === "month") {

                matchesPeriod =
                    rowPeriod === "today" ||
                    rowPeriod === "week" ||
                    rowPeriod === "month";

            }


            /* -----------------------------
               AFFICHAGE
            ----------------------------- */

            const shouldDisplay =
                matchesSearch &&
                matchesAction &&
                matchesPeriod;


            row.hidden =
                !shouldDisplay;


            if (shouldDisplay) {
                visibleCount++;
            }

        });


        /* =================================================
           COMPTEUR
        ================================================= */

        resultCount.textContent =
            visibleCount === 1
                ? "1 opération affichée"
                : `${visibleCount} opérations affichées`;


        /* =================================================
           AUCUN RÉSULTAT
        ================================================= */

        emptyState.hidden =
            visibleCount !== 0;

    }


    /* =====================================================
       ÉVÉNEMENTS
    ====================================================== */

    searchInput.addEventListener(
        "input",
        filterHistory
    );


    actionFilter.addEventListener(
        "change",
        filterHistory
    );


    periodFilter.addEventListener(
        "change",
        filterHistory
    );


    /* =====================================================
       RESET
    ====================================================== */

    resetButton.addEventListener(
        "click",
        () => {

            searchInput.value = "";

            actionFilter.value = "all";

            periodFilter.value = "all";

            filterHistory();

            searchInput.focus();

        }
    );


    /* =====================================================
       INITIALISATION
    ====================================================== */

    filterHistory();

});