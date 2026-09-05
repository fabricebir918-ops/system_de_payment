document.addEventListener("DOMContentLoaded", () => {

    const searchInput =
        document.getElementById("anomalySearch");

    const typeFilter =
        document.getElementById("typeFilter");

    const priorityFilter =
        document.getElementById("priorityFilter");

    const resetButton =
        document.getElementById("resetFilters");

    const anomalyRows =
        document.querySelectorAll(".anomaly-row");

    const resultCount =
        document.getElementById("resultCount");

    const emptyState =
        document.getElementById("emptyState");


    function normalizeText(text) {

        return text
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    }


    function filterAnomalies() {

        const searchTerm =
            normalizeText(searchInput.value);

        const selectedType =
            typeFilter.value;

        const selectedPriority =
            priorityFilter.value;

        let visibleCount = 0;


        anomalyRows.forEach((row) => {

            const rowText =
                normalizeText(row.textContent);

            // FIX: Added .trim() to remove whitespace from data attributes
            const rowType =
                row.dataset.type.trim();

            const rowPriority =
                row.dataset.priority.trim();


            const matchesSearch =
                searchTerm === "" ||
                rowText.includes(searchTerm);


            const matchesType =
                selectedType === "all" ||
                rowType === selectedType;


            const matchesPriority =
                selectedPriority === "all" ||
                rowPriority === selectedPriority;


            const shouldDisplay =
                matchesSearch &&
                matchesType &&
                matchesPriority;


            row.hidden = !shouldDisplay;


            if (shouldDisplay) {
                visibleCount++;
            }

        });


        resultCount.textContent =
            visibleCount === 1
                ? "1 anomalie affichée"
                : `${visibleCount} anomalies affichées`;


        emptyState.hidden =
            visibleCount !== 0;

    }


    searchInput.addEventListener(
        "input",
        filterAnomalies
    );


    typeFilter.addEventListener(
        "change",
        filterAnomalies
    );


    priorityFilter.addEventListener(
        "change",
        filterAnomalies
    );


    resetButton.addEventListener(
        "click",
        () => {

            searchInput.value = "";

            typeFilter.value = "all";

            priorityFilter.value = "all";

            filterAnomalies();

            searchInput.focus();

        }
    );


    filterAnomalies();

});