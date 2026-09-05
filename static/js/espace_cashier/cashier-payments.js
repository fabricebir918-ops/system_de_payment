document.addEventListener("DOMContentLoaded", function () {

    const searchInput =
        document.getElementById("paymentSearch");

    const statusFilter =
        document.getElementById("statusFilter");

    const periodFilter =
        document.getElementById("periodFilter");

    const resetButton =
        document.getElementById("resetFilters");

    const rows =
        document.querySelectorAll(".payment-row");

    const resultCount =
        document.getElementById("resultCount");

    const emptyState =
        document.getElementById("emptyState");


    function filterPayments() {

        const searchValue =
            searchInput.value
                .trim()
                .toLowerCase();

        const selectedStatus =
            statusFilter.value;

        const selectedPeriod =
            periodFilter.value;

        let visibleCount = 0;


        rows.forEach(function (row) {

            const searchableText =
                row.dataset.search.toLowerCase().trim();

            const rowStatus =
                row.dataset.status.trim();

            const rowPeriod =
                row.dataset.period.trim();


            /* Recherche */

            const matchesSearch =
                searchableText.includes(searchValue);


            /* Statut */

            const matchesStatus =
                selectedStatus === "all" ||
                rowStatus === selectedStatus;


            /* Période */

            let matchesPeriod = false;


            if (selectedPeriod === "all") {

                matchesPeriod = true;

            }

            else if (selectedPeriod === "today") {

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


            /* Affichage */

            if (
                matchesSearch &&
                matchesStatus &&
                matchesPeriod
            ) {

                row.hidden = false;

                visibleCount++;

            }

            else {

                row.hidden = true;

            }

        });


        /* Compteur */

        if (visibleCount === 1) {

            resultCount.textContent =
                "1 paiement affiché";

        }

        else {

            resultCount.textContent =
                visibleCount +
                " paiements affichés";

        }


        /* Aucun résultat */

        emptyState.hidden =
            visibleCount !== 0;

    }


    /* ======================================================
       ÉVÉNEMENTS
    ====================================================== */

    searchInput.addEventListener(
        "input",
        filterPayments
    );


    statusFilter.addEventListener(
        "change",
        filterPayments
    );


    periodFilter.addEventListener(
        "change",
        filterPayments
    );


    /* ======================================================
       RÉINITIALISATION
    ====================================================== */

    resetButton.addEventListener(
        "click",
        function () {

            searchInput.value = "";

            statusFilter.value = "all";

            periodFilter.value = "all";

            filterPayments();

            searchInput.focus();

        }
    );


    /* État initial */

    filterPayments();

});