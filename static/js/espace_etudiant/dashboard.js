"use strict";


/* ==========================================================
   ACADEMICPAY — THÈME DASHBOARD
========================================================== */

const THEME_STORAGE_KEY = "academicpay-theme";

const themeToggle =
    document.getElementById("themeToggle");

const mobileThemeToggle =
    document.getElementById("mobileThemeToggle");


/* ==========================================================
   APPLIQUER LE THÈME
========================================================== */

function applyTheme(theme) {

    const lightMode =
        theme === "light";


    /*
     * C'est cette classe qui déclenche toutes
     * les règles :
     *
     * body.light-theme ...
     */

    document.body.classList.toggle(
        "light-theme",
        lightMode
    );


    try {

        localStorage.setItem(
            THEME_STORAGE_KEY,
            lightMode ? "light" : "dark"
        );

    } catch (error) {

        console.warn(
            "Impossible d'enregistrer le thème.",
            error
        );
    }


    updateThemeButtons(lightMode);
}


/* ==========================================================
   APPARENCE DES BOUTONS
========================================================== */

function updateThemeButtons(lightMode) {

    /*
     * Mode sombre :
     * soleil = passer au clair
     *
     * Mode clair :
     * lune = passer au sombre
     */

    const iconClass =
        lightMode
            ? "bi bi-moon-stars"
            : "bi bi-sun";


    const label =
        lightMode
            ? "Passer en mode sombre"
            : "Passer en mode clair";


    if (themeToggle) {

        const icon =
            themeToggle.querySelector("i");


        if (icon) {
            icon.className = iconClass;
        }


        themeToggle.title = label;

        themeToggle.setAttribute(
            "aria-label",
            label
        );
    }


    if (mobileThemeToggle) {

        const icon =
            mobileThemeToggle.querySelector("i");

        const text =
            mobileThemeToggle.querySelector("span");


        if (icon) {
            icon.className = iconClass;
        }


        if (text) {
            text.textContent = label;
        }


        mobileThemeToggle.setAttribute(
            "aria-label",
            label
        );
    }
}


/* ==========================================================
   BASCULER
========================================================== */

function toggleTheme() {

    const currentlyLight =
        document.body.classList.contains(
            "light-theme"
        );


    applyTheme(
        currentlyLight
            ? "dark"
            : "light"
    );
}


/* ==========================================================
   INITIALISATION
========================================================== */

function initializeTheme() {

    let savedTheme = null;


    try {

        savedTheme =
            localStorage.getItem(
                THEME_STORAGE_KEY
            );

    } catch (error) {

        console.warn(
            "Impossible de lire le thème.",
            error
        );
    }


    /*
     * AcademicPay démarre en sombre
     * si aucun choix n'a encore été enregistré.
     */

    applyTheme(
        savedTheme === "light"
            ? "light"
            : "dark"
    );
}


/* ==========================================================
   ÉVÉNEMENTS
========================================================== */

function initializeDashboard() {

    initializeTheme();


    if (themeToggle) {

        themeToggle.addEventListener(
            "click",
            toggleTheme
        );
    }


    if (mobileThemeToggle) {

        mobileThemeToggle.addEventListener(
            "click",
            toggleTheme
        );
    }
}


/* ==========================================================
   DÉMARRAGE
========================================================== */

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        initializeDashboard
    );

} else {

    initializeDashboard();
}