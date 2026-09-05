"use strict";

/* ==========================================================
   ACADEMICPAY — MES PAIEMENTS
   ----------------------------------------------------------
   Fonctionnalités :

   1. Recherche par référence
   2. Filtre par statut
   3. Filtre par semestre
   4. Filtre par année académique
   5. Compteur dynamique
   6. Réinitialisation des filtres
   7. État "aucun résultat"
   8. Génération du reçu PDF

   IMPORTANT :
   La gestion du thème reste dans dashbord.js.
========================================================== */


/* ==========================================================
   1. INITIALISATION
========================================================== */

document.addEventListener(
    "DOMContentLoaded",
    initializePaymentsPage
);


function initializePaymentsPage() {

    initializeFilters();

    initializeReceiptButtons();

}


/* ==========================================================
   2. INITIALISATION DES FILTRES
========================================================== */

function initializeFilters() {

    const searchInput =
        document.getElementById("paymentSearch");

    const statusFilter =
        document.getElementById("statusFilter");

    const semesterFilter =
        document.getElementById("semesterFilter");

    const yearFilter =
        document.getElementById("yearFilter");

    const resetButton =
        document.getElementById("resetFilters");

    const emptyResetButton =
        document.getElementById("emptyResetFilters");


    if (
        !searchInput ||
        !statusFilter ||
        !semesterFilter ||
        !yearFilter
    ) {

        console.warn(
            "AcademicPay : certains filtres sont introuvables."
        );

        return;
    }


    searchInput.addEventListener(
        "input",
        applyFilters
    );

    statusFilter.addEventListener(
        "change",
        applyFilters
    );

    semesterFilter.addEventListener(
        "change",
        applyFilters
    );

    yearFilter.addEventListener(
        "change",
        applyFilters
    );


    if (resetButton) {
        resetButton.addEventListener(
            "click",
            resetFilters
        );
    }

    if (emptyResetButton) {
        emptyResetButton.addEventListener(
            "click",
            resetFilters
        );
    }

    applyFilters();

}


/* ==========================================================
   3. APPLIQUER LES FILTRES
========================================================== */

function applyFilters() {

    const searchInput =
        document.getElementById("paymentSearch");

    const statusFilter =
        document.getElementById("statusFilter");

    const semesterFilter =
        document.getElementById("semesterFilter");

    const yearFilter =
        document.getElementById("yearFilter");


    if (
        !searchInput ||
        !statusFilter ||
        !semesterFilter ||
        !yearFilter
    ) {
        return;
    }


    const searchValue =
        searchInput.value
            .trim()
            .toUpperCase()
            .replace("#", "");

    const selectedStatus =
        statusFilter.value;

    const selectedSemester =
        semesterFilter.value;

    const selectedYear =
        yearFilter.value;


    const rows =
        document.querySelectorAll(
            ".payment-table-row"
        );

    let visiblePayments = 0;


    rows.forEach(row => {

        // .trim() removes whitespace from data attributes
        const reference =
            (row.dataset.reference || "")
                .toUpperCase()
                .trim();

        const status =
            (row.dataset.status || "")
                .trim();

        const semester =
            (row.dataset.semester || "")
                .trim();

        const year =
            (row.dataset.year || "")
                .trim();


        const matchesSearch =
            searchValue === "" ||
            reference.includes(searchValue);

        const matchesStatus =
            selectedStatus === "all" ||
            status === selectedStatus;

        const matchesSemester =
            selectedSemester === "all" ||
            semester === selectedSemester;

        const matchesYear =
            selectedYear === "all" ||
            year === selectedYear;


        const shouldDisplay =
            matchesSearch &&
            matchesStatus &&
            matchesSemester &&
            matchesYear;


        if (shouldDisplay) {
            row.hidden = false;
            visiblePayments++;
        } else {
            row.hidden = true;
        }

    });


    updateResultCount(visiblePayments);
    updateEmptyState(visiblePayments);

}


/* ==========================================================
   4. COMPTEUR
========================================================== */

function updateResultCount(count) {

    const counter =
        document.getElementById(
            "paymentsResultCount"
        );

    if (!counter) {
        return;
    }

    if (count === 0) {
        counter.textContent = "Aucun paiement";
        return;
    }

    if (count === 1) {
        counter.textContent = "1 paiement";
        return;
    }

    counter.textContent = `${count} paiements`;

}


/* ==========================================================
   5. ÉTAT VIDE
========================================================== */

function updateEmptyState(count) {

    const tableWrapper =
        document.querySelector(
            ".payments-table-wrapper"
        );

    const emptyState =
        document.getElementById(
            "paymentsEmptyState"
        );

    if (!tableWrapper || !emptyState) {
        return;
    }

    if (count === 0) {
        tableWrapper.classList.add("d-none");
        emptyState.classList.remove("d-none");
    } else {
        tableWrapper.classList.remove("d-none");
        emptyState.classList.add("d-none");
    }

}


/* ==========================================================
   6. RÉINITIALISER LES FILTRES
========================================================== */

function resetFilters() {

    const searchInput =
        document.getElementById("paymentSearch");

    const statusFilter =
        document.getElementById("statusFilter");

    const semesterFilter =
        document.getElementById("semesterFilter");

    const yearFilter =
        document.getElementById("yearFilter");


    if (searchInput) {
        searchInput.value = "";
    }

    if (statusFilter) {
        statusFilter.value = "all";
    }

    if (semesterFilter) {
        semesterFilter.value = "all";
    }

    if (yearFilter) {
        yearFilter.value = "2025-2026";
    }

    applyFilters();

    if (searchInput) {
        searchInput.focus();
    }

}


/* ==========================================================
   7. BOUTONS PDF
========================================================== */

function initializeReceiptButtons() {

    const buttons =
        document.querySelectorAll(
            "[data-receipt]"
        );

    buttons.forEach(button => {
        button.addEventListener(
            "click",
            handleReceiptDownload
        );
    });

}


/* ==========================================================
   8. CLIC SUR "PDF"
========================================================== */

function handleReceiptDownload(event) {

    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const reference = button.dataset.receipt;

    if (!reference) {
        console.error("Référence du paiement absente.");
        return;
    }

    // Show loading state
    setReceiptButtonLoading(button, true);

    // Simulate PDF generation - in production, this would call the server
    setTimeout(() => {
        alert(`Téléchargement du reçu pour le paiement #${reference}`);
        setReceiptButtonLoading(button, false);
    }, 1000);

}


/* ==========================================================
   9. ÉTAT DU BOUTON PDF
========================================================== */

function setReceiptButtonLoading(button, loading) {

    if (!button) {
        return;
    }

    if (loading) {
        button.dataset.originalContent = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `
            <span
                class="spinner-border spinner-border-sm"
                aria-hidden="true"
            ></span>
            PDF
        `;
        return;
    }

    button.disabled = false;

    if (button.dataset.originalContent) {
        button.innerHTML = button.dataset.originalContent;
        delete button.dataset.originalContent;
    }

}