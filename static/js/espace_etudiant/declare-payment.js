"use strict";


/* ==========================================================
   ACADEMICPAY — DÉCLARER UN PAIEMENT
   ----------------------------------------------------------
   Responsabilités :
   - validation du formulaire
   - normalisation de la référence
   - contrôle de la date
   - contrôle du montant
   - affichage des erreurs
   - prévention des doubles soumissions
   - soumission AJAX à Django
   - confirmation de déclaration

   IMPORTANT :
   Le thème reste géré exclusivement par dashbord.js.
========================================================== */


/* ==========================================================
   1. ÉLÉMENTS DU FORMULAIRE
========================================================== */

const declarationForm =
    document.getElementById("paymentDeclarationForm");

const bankInput =
    document.getElementById("bank");

const referenceInput =
    document.getElementById("transactionReference");

const amountInput =
    document.getElementById("amount");

const paymentDateInput =
    document.getElementById("paymentDate");

const academicYearInput =
    document.getElementById("academicYear");

const semesterInput =
    document.getElementById("semester");

const confirmationInput =
    document.getElementById("confirmation");

const submitButton =
    document.getElementById("submitPaymentButton");


/* ==========================================================
   2. INITIALISATION
========================================================== */

document.addEventListener(
    "DOMContentLoaded",
    initializeDeclarationPage
);


function initializeDeclarationPage() {

    if (!declarationForm) {

        console.warn(
            "AcademicPay : formulaire de déclaration introuvable."
        );

        return;
    }


    /*
     * Interdire les dates futures.
     */

    configurePaymentDate();


    /*
     * Normalisation de la référence.
     */

    configureReferenceInput();


    /*
     * Validation en temps réel.
     */

    configureRealtimeValidation();


    /*
     * Soumission.
     */

    declarationForm.addEventListener(
        "submit",
        handleDeclarationSubmit
    );

}


/* ==========================================================
   3. CONFIGURATION DE LA DATE
========================================================== */

function configurePaymentDate() {

    if (!paymentDateInput) {
        return;
    }


    const today =
        getTodayDateString();


    /*
     * Empêche de sélectionner demain
     * ou une date ultérieure.
     */

    paymentDateInput.max = today;

}


/* ==========================================================
   4. OBTENIR LA DATE DU JOUR
========================================================== */

function getTodayDateString() {

    const now =
        new Date();


    const year =
        now.getFullYear();


    const month =
        String(
            now.getMonth() + 1
        ).padStart(2, "0");


    const day =
        String(
            now.getDate()
        ).padStart(2, "0");


    return `${year}-${month}-${day}`;

}


/* ==========================================================
   5. CONFIGURATION RÉFÉRENCE
========================================================== */

function configureReferenceInput() {

    if (!referenceInput) {
        return;
    }


    /*
     * Pendant la saisie :
     *
     * - passage en majuscules
     * - suppression des espaces
     *   au début et à la fin
     */

    referenceInput.addEventListener(
        "input",
        function () {

            const cursorPosition =
                referenceInput.selectionStart;


            referenceInput.value =
                referenceInput.value
                    .toUpperCase();


            /*
             * Si une erreur était affichée,
             * on revalide.
             */

            if (
                referenceInput
                    .closest(".form-field")
                    ?.classList
                    .contains("has-error")
            ) {

                validateReference();

            }


            /*
             * On tente de conserver
             * la position du curseur.
             */

            try {

                referenceInput.setSelectionRange(
                    cursorPosition,
                    cursorPosition
                );

            } catch (error) {

                /*
                 * Certains navigateurs peuvent
                 * ne pas permettre cette opération.
                 */

            }

        }
    );


    /*
     * Au moment de quitter le champ,
     * nettoyage définitif.
     */

    referenceInput.addEventListener(
        "blur",
        function () {

            referenceInput.value =
                normalizeReference(
                    referenceInput.value
                );


            validateReference();

        }
    );

}


/* ==========================================================
   6. NORMALISER UNE RÉFÉRENCE
========================================================== */

function normalizeReference(reference) {

    return String(reference || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

}


/* ==========================================================
   7. VALIDATION EN TEMPS RÉEL
========================================================== */

function configureRealtimeValidation() {

    /*
     * Banque
     */

    if (bankInput) {

        bankInput.addEventListener(
            "change",
            validateBank
        );

    }


    /*
     * Montant
     */

    if (amountInput) {

        amountInput.addEventListener(
            "input",
            function () {

                if (
                    amountInput
                        .closest(".form-field")
                        ?.classList
                        .contains("has-error")
                ) {

                    validateAmount();

                }

            }
        );


        amountInput.addEventListener(
            "blur",
            validateAmount
        );

    }


    /*
     * Date
     */

    if (paymentDateInput) {

        paymentDateInput.addEventListener(
            "change",
            validatePaymentDate
        );

    }


    /*
     * Année académique
     */

    if (academicYearInput) {

        academicYearInput.addEventListener(
            "change",
            validateAcademicYear
        );

    }


    /*
     * Semestre
     */

    if (semesterInput) {

        semesterInput.addEventListener(
            "change",
            validateSemester
        );

    }


    /*
     * Confirmation
     */

    if (confirmationInput) {

        confirmationInput.addEventListener(
            "change",
            validateConfirmation
        );

    }

}


/* ==========================================================
   8. VALIDATION BANQUE
========================================================== */

function validateBank() {

    if (!bankInput) {
        return false;
    }


    if (!bankInput.value) {

        showFieldError(
            bankInput,
            "bankError",
            "Veuillez sélectionner la banque."
        );

        return false;

    }


    clearFieldError(
        bankInput,
        "bankError"
    );


    return true;

}


/* ==========================================================
   9. VALIDATION RÉFÉRENCE
========================================================== */

function validateReference() {

    if (!referenceInput) {
        return false;
    }


    const reference =
        normalizeReference(
            referenceInput.value
        );


    /*
     * On remet immédiatement la
     * valeur normalisée dans le champ.
     */

    referenceInput.value =
        reference;


    if (!reference) {

        showFieldError(
            referenceInput,
            "transactionReferenceError",
            "Veuillez saisir la référence de transaction."
        );

        return false;

    }


    /*
     * Une référence extrêmement courte
     * est probablement une erreur de saisie.
     */

    if (reference.length < 5) {

        showFieldError(
            referenceInput,
            "transactionReferenceError",
            "La référence de transaction semble trop courte."
        );

        return false;

    }


    /*
     * Caractères raisonnablement acceptés :
     *
     * lettres
     * chiffres
     * tiret
     * slash
     */

    const validPattern =
        /^[A-Z0-9\-\/]+$/;


    if (!validPattern.test(reference)) {

        showFieldError(
            referenceInput,
            "transactionReferenceError",
            "La référence contient des caractères non autorisés."
        );

        return false;

    }


    clearFieldError(
        referenceInput,
        "transactionReferenceError"
    );


    return true;

}


/* ==========================================================
   10. VALIDATION MONTANT
========================================================== */

function validateAmount() {

    if (!amountInput) {
        return false;
    }


    const amount =
        Number(amountInput.value);


    if (
        amountInput.value.trim() === "" ||
        !Number.isFinite(amount)
    ) {

        showFieldError(
            amountInput,
            "amountError",
            "Veuillez saisir le montant payé."
        );

        return false;

    }


    if (amount <= 0) {

        showFieldError(
            amountInput,
            "amountError",
            "Le montant doit être supérieur à zéro."
        );

        return false;

    }


    if (amount > 100000) {

        showFieldError(
            amountInput,
            "amountError",
            "Veuillez vérifier le montant saisi."
        );

        return false;

    }


    clearFieldError(
        amountInput,
        "amountError"
    );


    return true;

}


/* ==========================================================
   11. VALIDATION DATE
========================================================== */

function validatePaymentDate() {

    if (!paymentDateInput) {
        return false;
    }


    const value =
        paymentDateInput.value;


    if (!value) {

        showFieldError(
            paymentDateInput,
            "paymentDateError",
            "Veuillez sélectionner la date du paiement."
        );

        return false;

    }


    const selectedDate =
        new Date(
            `${value}T00:00:00`
        );


    if (
        Number.isNaN(
            selectedDate.getTime()
        )
    ) {

        showFieldError(
            paymentDateInput,
            "paymentDateError",
            "La date sélectionnée n'est pas valide."
        );

        return false;

    }


    const today =
        new Date();


    today.setHours(
        0,
        0,
        0,
        0
    );


    if (selectedDate > today) {

        showFieldError(
            paymentDateInput,
            "paymentDateError",
            "La date du paiement ne peut pas être dans le futur."
        );

        return false;

    }


    clearFieldError(
        paymentDateInput,
        "paymentDateError"
    );


    return true;

}


/* ==========================================================
   12. VALIDATION ANNÉE ACADÉMIQUE
========================================================== */

function validateAcademicYear() {

    if (!academicYearInput) {
        return false;
    }


    if (!academicYearInput.value) {

        showFieldError(
            academicYearInput,
            "academicYearError",
            "Veuillez sélectionner l'année académique."
        );

        return false;

    }


    clearFieldError(
        academicYearInput,
        "academicYearError"
    );


    return true;

}


/* ==========================================================
   13. VALIDATION SEMESTRE
========================================================== */

function validateSemester() {

    if (!semesterInput) {
        return false;
    }


    if (!semesterInput.value) {

        showFieldError(
            semesterInput,
            "semesterError",
            "Veuillez sélectionner le semestre concerné."
        );

        return false;

    }


    clearFieldError(
        semesterInput,
        "semesterError"
    );


    return true;

}


/* ==========================================================
   14. VALIDATION CONFIRMATION
========================================================== */

function validateConfirmation() {

    if (!confirmationInput) {
        return false;
    }


    const error =
        document.getElementById(
            "confirmationError"
        );


    if (!confirmationInput.checked) {

        if (error) {

            error.textContent =
                "Vous devez confirmer l'exactitude des informations.";

            error.classList.add(
                "visible"
            );

        }


        return false;

    }


    if (error) {

        error.textContent = "";

        error.classList.remove(
            "visible"
        );

    }


    return true;

}


/* ==========================================================
   15. VALIDER LE FORMULAIRE COMPLET
========================================================== */

function validateDeclarationForm() {

    /*
     * On exécute toutes les validations
     * séparément afin que toutes les erreurs
     * apparaissent en même temps.
     */

    const bankValid =
        validateBank();


    const referenceValid =
        validateReference();


    const amountValid =
        validateAmount();


    const dateValid =
        validatePaymentDate();


    const academicYearValid =
        validateAcademicYear();


    const semesterValid =
        validateSemester();


    const confirmationValid =
        validateConfirmation();


    return (
        bankValid &&
        referenceValid &&
        amountValid &&
        dateValid &&
        academicYearValid &&
        semesterValid &&
        confirmationValid
    );

}


/* ==========================================================
   16. SOUMISSION AJAX
========================================================== */

function handleDeclarationSubmit(event) {

    event.preventDefault();


    /*
     * Empêche un double clic pendant
     * une soumission déjà en cours.
     */

    if (
        submitButton &&
        submitButton.disabled
    ) {

        return;

    }


    /*
     * Validation.
     */

    const valid =
        validateDeclarationForm();


    if (!valid) {

        focusFirstInvalidField();

        return;

    }


    /*
     * Construction des données.
     */

    const formData = new FormData(declarationForm);

    // Add CSRF token
    const csrftoken = getCookie('csrftoken');


    /*
     * État du bouton.
     */

    setSubmitLoading(true);


    /*
     * Envoi à Django.
     */

    fetch(declarationForm.action, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrftoken,
        },
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        setSubmitLoading(false);

        if (data.success) {
            // Show success overlay
            showDeclarationSuccess(data.reference);
        } else {
            // Show errors
            if (data.errors && data.errors.length > 0) {
                // Display first error in a general alert
                alert(data.errors[0]);
                // Or you can display them in the form
                data.errors.forEach(error => {
                    // Try to match error to a field
                    if (error.toLowerCase().includes('banque')) {
                        showFieldError(bankInput, 'bankError', error);
                    } else if (error.toLowerCase().includes('référence')) {
                        showFieldError(referenceInput, 'transactionReferenceError', error);
                    } else if (error.toLowerCase().includes('montant')) {
                        showFieldError(amountInput, 'amountError', error);
                    } else if (error.toLowerCase().includes('date')) {
                        showFieldError(paymentDateInput, 'paymentDateError', error);
                    } else if (error.toLowerCase().includes('semestre')) {
                        showFieldError(semesterInput, 'semesterError', error);
                    } else if (error.toLowerCase().includes('confirmation')) {
                        const confirmError = document.getElementById('confirmationError');
                        if (confirmError) {
                            confirmError.textContent = error;
                            confirmError.classList.add('visible');
                        }
                    }
                });
            }
        }
    })
    .catch(error => {
        console.error('Erreur:', error);
        setSubmitLoading(false);
        alert('Une erreur est survenue. Veuillez réessayer.');
    });

}


/* ==========================================================
   17. RÉCUPÉRER LES DONNÉES
========================================================== */

function getDeclarationData() {

    return {

        bank:
            bankInput.value,

        reference:
            normalizeReference(
                referenceInput.value
            ),

        amount:
            Number(
                amountInput.value
            ),

        paymentDate:
            paymentDateInput.value,

        academicYear:
            academicYearInput.value,

        semester:
            semesterInput.value,

        status:
            "pending",

        statusLabel:
            "En attente",

        declaredAt:
            new Date().toISOString()

    };

}


/* ==========================================================
   18. AFFICHER LE SUCCÈS
========================================================== */

function showDeclarationSuccess(reference) {

    const overlay =
        document.getElementById(
            "declarationSuccess"
        );


    const referenceDisplay =
        document.getElementById(
            "successReference"
        );


    if (referenceDisplay) {

        referenceDisplay.textContent =
            reference;

    }


    if (overlay) {

        overlay.classList.remove(
            "d-none"
        );

    }


    /*
     * Bloquer le scroll derrière
     * la confirmation.
     */

    document.body.style.overflow =
        "hidden";

}


/* ==========================================================
   19. ÉTAT DU BOUTON
========================================================== */

function setSubmitLoading(loading) {

    if (!submitButton) {
        return;
    }


    if (loading) {

        submitButton.dataset.originalContent =
            submitButton.innerHTML;


        submitButton.disabled =
            true;


        submitButton.innerHTML = `
            <span
                class="spinner-border spinner-border-sm"
                aria-hidden="true"
            ></span>

            Vérification...
        `;


        return;

    }


    submitButton.disabled =
        false;


    if (
        submitButton.dataset
            .originalContent
    ) {

        submitButton.innerHTML =
            submitButton.dataset
                .originalContent;


        delete submitButton.dataset
            .originalContent;

    }

}


/* ==========================================================
   20. AFFICHER UNE ERREUR
========================================================== */

function showFieldError(input, errorId, message) {

    if (!input) {
        return;
    }


    const field =
        input.closest(
            ".form-field"
        );


    const error =
        document.getElementById(
            errorId
        );


    if (field) {

        field.classList.add(
            "has-error"
        );

    }


    if (error) {

        error.textContent =
            message;


        error.classList.add(
            "visible"
        );

    }


    input.setAttribute(
        "aria-invalid",
        "true"
    );

}


/* ==========================================================
   21. SUPPRIMER UNE ERREUR
========================================================== */

function clearFieldError(input, errorId) {

    if (!input) {
        return;
    }


    const field =
        input.closest(
            ".form-field"
        );


    const error =
        document.getElementById(
            errorId
        );


    if (field) {

        field.classList.remove(
            "has-error"
        );

    }


    if (error) {

        error.textContent = "";

        error.classList.remove(
            "visible"
        );

    }


    input.removeAttribute(
        "aria-invalid"
    );

}


/* ==========================================================
   22. PREMIER CHAMP INVALIDE
========================================================== */

function focusFirstInvalidField() {

    const firstInvalid =
        declarationForm.querySelector(
            '[aria-invalid="true"]'
        );


    if (firstInvalid) {

        firstInvalid.focus();

        firstInvalid.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

        return;

    }


    /*
     * Cas particulier :
     * la checkbox de confirmation.
     */

    if (
        confirmationInput &&
        !confirmationInput.checked
    ) {

        confirmationInput.focus();

        confirmationInput.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

    }

}


/* ==========================================================
   23. CSRF TOKEN HELPER
========================================================== */

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