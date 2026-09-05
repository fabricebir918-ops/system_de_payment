"use strict";


/* ==========================================================
   ACADEMICPAY — AIDE & SUPPORT

   Responsabilités :
   - recherche dans la FAQ
   - ouverture du formulaire de support
   - validation du signalement
   - normalisation de la référence
   - compteur de caractères
   - soumission AJAX à Django
   - notification de succès

   Le thème est géré par dashbord.js.
========================================================== */


/* ==========================================================
   1. ÉLÉMENTS — FAQ
========================================================== */

const faqSearch =
    document.getElementById("faqSearch");

const faqItems =
    document.querySelectorAll(".faq-item");

const faqEmpty =
    document.getElementById("faqEmpty");


/* ==========================================================
   2. ÉLÉMENTS — OUVERTURE SUPPORT
========================================================== */

const openSupportForm =
    document.getElementById("openSupportForm");

const openSupportFormSecondary =
    document.getElementById("openSupportFormSecondary");

const supportModalElement =
    document.getElementById("supportModal");


/* ==========================================================
   3. ÉLÉMENTS — FORMULAIRE
========================================================== */

const supportForm =
    document.getElementById("supportForm");

const issueTypeInput =
    document.getElementById("issueType");

const supportReferenceInput =
    document.getElementById("supportReference");

const supportMessageInput =
    document.getElementById("supportMessage");

const supportCharacterCount =
    document.getElementById("supportCharacterCount");

const submitSupportButton =
    document.getElementById("submitSupportButton");


/* ==========================================================
   4. NOTIFICATION
========================================================== */

const supportToast =
    document.getElementById("supportToast");

let supportToastTimer = null;


/* ==========================================================
   5. CSRF TOKEN HELPER
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


/* ==========================================================
   6. INITIALISATION
========================================================== */

document.addEventListener(
    "DOMContentLoaded",
    initializeHelpPage
);


function initializeHelpPage() {

    configureFaqSearch();

    configureSupportButtons();

    configureSupportForm();

    configureReferenceInput();

    configureMessageCounter();

}


/* ==========================================================
   7. RECHERCHE FAQ
========================================================== */

function configureFaqSearch() {

    if (!faqSearch) {
        return;
    }


    faqSearch.addEventListener(
        "input",
        filterFaq
    );

}


/* ==========================================================
   8. FILTRER FAQ
========================================================== */

function filterFaq() {

    const query =
        normalizeSearchText(
            faqSearch.value
        );


    let visibleItems = 0;


    faqItems.forEach(
        function (item) {

            const searchableText =
                normalizeSearchText(
                    item.textContent +
                    (item.dataset.search || "")
                );


            const matches =
                !query ||
                searchableText.includes(query);


            item.classList.toggle(
                "faq-hidden",
                !matches
            );


            if (matches) {
                visibleItems++;
            }

        }
    );


    if (faqEmpty) {
        faqEmpty.classList.toggle(
            "d-none",
            visibleItems !== 0
        );
    }

}


/* ==========================================================
   9. NORMALISER TEXTE DE RECHERCHE
========================================================== */

function normalizeSearchText(text) {

    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

}


/* ==========================================================
   10. BOUTONS SUPPORT
========================================================== */

function configureSupportButtons() {

    const buttons = [
        openSupportForm,
        openSupportFormSecondary
    ];


    buttons.forEach(
        function (button) {

            if (!button) {
                return;
            }


            button.addEventListener(
                "click",
                showSupportModal
            );

        }
    );

}


/* ==========================================================
   11. OUVRIR LE MODAL
========================================================== */

function showSupportModal() {

    if (!supportModalElement) {
        return;
    }


    if (
        typeof bootstrap === "undefined" ||
        !bootstrap.Modal
    ) {

        console.error(
            "AcademicPay : Bootstrap Modal est indisponible."
        );

        return;

    }


    const modal =
        bootstrap.Modal.getOrCreateInstance(
            supportModalElement
        );


    modal.show();

}


/* ==========================================================
   12. CONFIGURATION FORMULAIRE
========================================================== */

function configureSupportForm() {

    if (!supportForm) {
        return;
    }


    supportForm.addEventListener(
        "submit",
        handleSupportSubmit
    );


    if (issueTypeInput) {

        issueTypeInput.addEventListener(
            "change",
            validateIssueType
        );

    }


    if (supportMessageInput) {

        supportMessageInput.addEventListener(
            "input",
            function () {

                updateMessageCounter();


                if (
                    hasSupportFieldError(
                        supportMessageInput
                    )
                ) {

                    validateSupportMessage();

                }

            }
        );


        supportMessageInput.addEventListener(
            "blur",
            validateSupportMessage
        );

    }


    if (supportModalElement) {

        supportModalElement.addEventListener(
            "hidden.bs.modal",
            resetSupportForm
        );

    }

}


/* ==========================================================
   13. RÉFÉRENCE DE TRANSACTION
========================================================== */

function configureReferenceInput() {

    if (!supportReferenceInput) {
        return;
    }


    supportReferenceInput.addEventListener(
        "input",
        function () {

            supportReferenceInput.value =
                supportReferenceInput.value
                    .toUpperCase();

        }
    );


    supportReferenceInput.addEventListener(
        "blur",
        function () {

            supportReferenceInput.value =
                normalizeReference(
                    supportReferenceInput.value
                );

        }
    );

}


/* ==========================================================
   14. NORMALISER RÉFÉRENCE
========================================================== */

function normalizeReference(reference) {

    return String(reference || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

}


/* ==========================================================
   15. COMPTEUR
========================================================== */

function configureMessageCounter() {

    updateMessageCounter();

}


/* ==========================================================
   16. METTRE À JOUR COMPTEUR
========================================================== */

function updateMessageCounter() {

    if (
        !supportMessageInput ||
        !supportCharacterCount
    ) {

        return;

    }


    const length =
        supportMessageInput.value.length;


    supportCharacterCount.textContent =
        `${length} / 500`;

}


/* ==========================================================
   17. VALIDATION TYPE
========================================================== */

function validateIssueType() {

    if (!issueTypeInput) {
        return false;
    }


    if (!issueTypeInput.value) {

        showSupportError(
            issueTypeInput,
            "issueTypeError",
            "Veuillez sélectionner le type de problème."
        );

        return false;

    }


    clearSupportError(
        issueTypeInput,
        "issueTypeError"
    );


    return true;

}


/* ==========================================================
   18. VALIDATION MESSAGE
========================================================== */

function validateSupportMessage() {

    if (!supportMessageInput) {
        return false;
    }


    const message =
        supportMessageInput.value.trim();


    if (!message) {

        showSupportError(
            supportMessageInput,
            "supportMessageError",
            "Veuillez décrire le problème rencontré."
        );

        return false;

    }


    if (message.length < 10) {

        showSupportError(
            supportMessageInput,
            "supportMessageError",
            "Veuillez fournir un peu plus de détails."
        );

        return false;

    }


    if (message.length > 500) {

        showSupportError(
            supportMessageInput,
            "supportMessageError",
            "Le message ne peut pas dépasser 500 caractères."
        );

        return false;

    }


    clearSupportError(
        supportMessageInput,
        "supportMessageError"
    );


    return true;

}


/* ==========================================================
   19. VALIDATION GLOBALE
========================================================== */

function validateSupportForm() {

    const typeValid =
        validateIssueType();


    const messageValid =
        validateSupportMessage();


    return (
        typeValid &&
        messageValid
    );

}


/* ==========================================================
   20. SOUMISSION AJAX
========================================================== */

function handleSupportSubmit(event) {

    event.preventDefault();


    if (
        submitSupportButton &&
        submitSupportButton.disabled
    ) {

        return;

    }


    const valid =
        validateSupportForm();


    if (!valid) {

        focusFirstInvalidSupportField();

        return;

    }


    setSupportButtonLoading(true);


    /*
     * Envoi AJAX à Django.
     */

    const formData = new FormData(supportForm);

    const csrftoken = getCookie('csrftoken');


    fetch(supportForm.action, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrftoken,
        },
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        setSupportButtonLoading(false);

        if (data.success) {
            closeSupportModal();
            showSupportSuccess(data.ticket_id);
        } else {
            if (data.errors && data.errors.length > 0) {
                // Display first error on the form
                const error = data.errors[0];
                if (error.toLowerCase().includes('type')) {
                    showSupportError(issueTypeInput, 'issueTypeError', error);
                } else if (error.toLowerCase().includes('message') || error.toLowerCase().includes('détails')) {
                    showSupportError(supportMessageInput, 'supportMessageError', error);
                } else {
                    alert(error);
                }
            } else {
                alert("Une erreur est survenue. Veuillez réessayer.");
            }
        }
    })
    .catch(error => {
        console.error('Erreur:', error);
        setSupportButtonLoading(false);
        alert("Une erreur est survenue. Veuillez réessayer.");
    });

}


/* ==========================================================
   21. FERMER MODAL
========================================================== */

function closeSupportModal() {

    if (!supportModalElement) {
        return;
    }


    if (
        typeof bootstrap === "undefined" ||
        !bootstrap.Modal
    ) {

        return;

    }


    const modal =
        bootstrap.Modal.getOrCreateInstance(
            supportModalElement
        );


    modal.hide();

}


/* ==========================================================
   22. NOTIFICATION SUCCÈS
========================================================== */

function showSupportSuccess(ticketId) {

    if (!supportToast) {
        return;
    }


    // Update message with ticket ID
    const messageElement =
        supportToast.querySelector("span");


    if (messageElement && ticketId) {
        messageElement.textContent =
            `Votre demande (${ticketId}) a été transmise pour vérification.`;
    }


    supportToast.classList.add(
        "show"
    );


    if (supportToastTimer) {

        clearTimeout(
            supportToastTimer
        );

    }


    supportToastTimer =
        window.setTimeout(
            function () {

                supportToast.classList.remove(
                    "show"
                );

            },
            4000
        );

}


/* ==========================================================
   23. ÉTAT DU BOUTON
========================================================== */

function setSupportButtonLoading(loading) {

    if (!submitSupportButton) {
        return;
    }


    if (loading) {

        if (
            !submitSupportButton
                .dataset
                .originalHtml
        ) {

            submitSupportButton
                .dataset
                .originalHtml =
                submitSupportButton.innerHTML;

        }


        submitSupportButton.disabled =
            true;


        submitSupportButton.innerHTML = `
            <span
                class="spinner-border spinner-border-sm"
                aria-hidden="true"
            ></span>

            Envoi...
        `;


        return;

    }


    submitSupportButton.disabled =
        false;


    if (
        submitSupportButton
            .dataset
            .originalHtml
    ) {

        submitSupportButton.innerHTML =
            submitSupportButton
                .dataset
                .originalHtml;


        delete submitSupportButton
            .dataset
            .originalHtml;

    }

}


/* ==========================================================
   24. AFFICHER ERREUR
========================================================== */

function showSupportError(
    input,
    errorId,
    message
) {

    if (!input) {
        return;
    }


    const field =
        input.closest(
            ".support-field"
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


    input.setAttribute(
        "aria-invalid",
        "true"
    );


    if (error) {

        error.textContent =
            message;


        error.classList.add(
            "visible"
        );

    }

}


/* ==========================================================
   25. SUPPRIMER ERREUR
========================================================== */

function clearSupportError(
    input,
    errorId
) {

    if (!input) {
        return;
    }


    const field =
        input.closest(
            ".support-field"
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


    input.removeAttribute(
        "aria-invalid"
    );


    if (error) {

        error.textContent = "";

        error.classList.remove(
            "visible"
        );

    }

}


/* ==========================================================
   26. VÉRIFIER SI ERREUR
========================================================== */

function hasSupportFieldError(input) {

    if (!input) {
        return false;
    }


    const field =
        input.closest(
            ".support-field"
        );


    return Boolean(
        field &&
        field.classList.contains(
            "has-error"
        )
    );

}


/* ==========================================================
   27. PREMIER CHAMP INVALIDE
========================================================== */

function focusFirstInvalidSupportField() {

    if (!supportForm) {
        return;
    }


    const invalid =
        supportForm.querySelector(
            '[aria-invalid="true"]'
        );


    if (!invalid) {
        return;
    }


    invalid.focus();

}


/* ==========================================================
   28. RÉINITIALISER FORMULAIRE
========================================================== */

function resetSupportForm() {

    if (!supportForm) {
        return;
    }


    supportForm.reset();


    supportForm
        .querySelectorAll(
            ".support-field"
        )
        .forEach(
            function (field) {

                field.classList.remove(
                    "has-error"
                );

            }
        );


    supportForm
        .querySelectorAll(
            '[aria-invalid="true"]'
        )
        .forEach(
            function (input) {

                input.removeAttribute(
                    "aria-invalid"
                );

            }
        );


    supportForm
        .querySelectorAll(
            ".support-error"
        )
        .forEach(
            function (error) {

                error.textContent = "";

                error.classList.remove(
                    "visible"
                );

            }
        );


    updateMessageCounter();

}