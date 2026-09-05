"use strict";


/* ==========================================================
   ACADEMICPAY — PROFIL ÉTUDIANT
   ----------------------------------------------------------
   Gestion :
   - modification e-mail / téléphone
   - validation des coordonnées
   - affichage / masquage des mots de passe
   - changement de mot de passe
   - notifications (AJAX)
========================================================== */


/* ==========================================================
   1. ÉLÉMENTS — PROFIL
========================================================== */

const profileForm =
    document.getElementById("profileForm");

const emailInput =
    document.getElementById("email");

const phoneInput =
    document.getElementById("phone");

const saveProfileButton =
    document.getElementById("saveProfileButton");


/* ==========================================================
   2. ÉLÉMENTS — MOT DE PASSE
========================================================== */

const passwordForm =
    document.getElementById("passwordForm");

const currentPasswordInput =
    document.getElementById("currentPassword");

const newPasswordInput =
    document.getElementById("newPassword");

const confirmPasswordInput =
    document.getElementById("confirmPassword");

const changePasswordButton =
    document.getElementById("changePasswordButton");


/* ==========================================================
   3. ÉLÉMENTS — NOTIFICATION
========================================================== */

const profileToast =
    document.getElementById("profileToast");

const profileToastTitle =
    document.getElementById("profileToastTitle");

const profileToastMessage =
    document.getElementById("profileToastMessage");


let toastTimer = null;


/* ==========================================================
   4. CSRF TOKEN HELPER
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
   5. INITIALISATION
========================================================== */

document.addEventListener(
    "DOMContentLoaded",
    initializeProfilePage
);


function initializeProfilePage() {

    configureProfileForm();

    configurePasswordForm();

    configurePasswordToggles();

}


/* ==========================================================
   6. FORMULAIRE PROFIL
========================================================== */

function configureProfileForm() {

    if (!profileForm) {
        return;
    }


    profileForm.addEventListener(
        "submit",
        handleProfileSubmit
    );


    /*
     * Validation email.
     */

    if (emailInput) {

        emailInput.addEventListener(
            "blur",
            validateEmail
        );


        emailInput.addEventListener(
            "input",
            function () {

                if (hasFieldError(emailInput)) {

                    validateEmail();

                }

            }
        );

    }


    /*
     * Validation téléphone.
     */

    if (phoneInput) {

        phoneInput.addEventListener(
            "blur",
            validatePhone
        );


        phoneInput.addEventListener(
            "input",
            function () {

                /*
                 * On évite certains caractères
                 * clairement inadaptés.
                 */

                phoneInput.value =
                    phoneInput.value.replace(
                        /[^0-9+\s()-]/g,
                        ""
                    );


                if (hasFieldError(phoneInput)) {

                    validatePhone();

                }

            }
        );

    }

}


/* ==========================================================
   7. VALIDATION E-MAIL
========================================================== */

function validateEmail() {

    if (!emailInput) {
        return false;
    }


    const email =
        emailInput.value.trim();


    if (!email) {

        showFieldError(
            emailInput,
            "emailError",
            "Veuillez saisir votre adresse e-mail."
        );

        return false;

    }


    const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


    if (!emailPattern.test(email)) {

        showFieldError(
            emailInput,
            "emailError",
            "Veuillez saisir une adresse e-mail valide."
        );

        return false;

    }


    clearFieldError(
        emailInput,
        "emailError"
    );


    return true;

}


/* ==========================================================
   8. VALIDATION TÉLÉPHONE
========================================================== */

function validatePhone() {

    if (!phoneInput) {
        return true;
    }


    const phone =
        phoneInput.value.trim();


    /*
     * Le téléphone est facultatif.
     */

    if (!phone) {

        clearFieldError(
            phoneInput,
            "phoneError"
        );

        return true;

    }


    /*
     * On retire les caractères de présentation
     * pour compter les chiffres.
     */

    const digits =
        phone.replace(/\D/g, "");


    if (digits.length < 9) {

        showFieldError(
            phoneInput,
            "phoneError",
            "Le numéro de téléphone semble incomplet."
        );

        return false;

    }


    if (digits.length > 15) {

        showFieldError(
            phoneInput,
            "phoneError",
            "Le numéro de téléphone est trop long."
        );

        return false;

    }


    clearFieldError(
        phoneInput,
        "phoneError"
    );


    return true;

}


/* ==========================================================
   9. ENREGISTRER LE PROFIL (AJAX)
========================================================== */

function handleProfileSubmit(event) {

    event.preventDefault();


    if (
        saveProfileButton &&
        saveProfileButton.disabled
    ) {

        return;

    }


    const emailValid =
        validateEmail();


    const phoneValid =
        validatePhone();


    if (
        !emailValid ||
        !phoneValid
    ) {

        focusFirstInvalidField(
            profileForm
        );

        return;

    }


    setButtonLoading(
        saveProfileButton,
        true,
        "Enregistrement..."
    );


    /*
     * Envoi AJAX à Django.
     */

    const formData = new FormData();
    formData.append('action', 'update_profile');
    formData.append('email', emailInput.value.trim());
    if (phoneInput) {
        formData.append('phone', phoneInput.value.trim());
    }

    const csrftoken = getCookie('csrftoken');


    fetch(profileForm.action, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrftoken,
        },
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        setButtonLoading(
            saveProfileButton,
            false
        );

        if (data.success) {
            showToast(
                "Modifications enregistrées",
                data.message || "Vos coordonnées ont été mises à jour."
            );
        } else {
            if (data.errors && data.errors.length > 0) {
                showToast(
                    "Échec de l'enregistrement",
                    data.errors[0],
                    true
                );
                // Display error on the field
                if (data.errors[0].toLowerCase().includes('email')) {
                    showFieldError(emailInput, 'emailError', data.errors[0]);
                }
            } else {
                showToast(
                    "Échec de l'enregistrement",
                    "Une erreur est survenue.",
                    true
                );
            }
        }
    })
    .catch(error => {
        console.error('Erreur:', error);
        setButtonLoading(
            saveProfileButton,
            false
        );
        showToast(
            "Échec de l'enregistrement",
            "Une erreur est survenue. Veuillez réessayer.",
            true
        );
    });

}


/* ==========================================================
   10. CONFIGURATION MOT DE PASSE
========================================================== */

function configurePasswordForm() {

    if (!passwordForm) {
        return;
    }


    passwordForm.addEventListener(
        "submit",
        handlePasswordSubmit
    );


    /*
     * Validation en temps réel.
     */

    if (currentPasswordInput) {

        currentPasswordInput.addEventListener(
            "input",
            function () {

                if (
                    hasFieldError(
                        currentPasswordInput
                    )
                ) {

                    validateCurrentPassword();

                }

            }
        );

    }


    if (newPasswordInput) {

        newPasswordInput.addEventListener(
            "input",
            function () {

                if (
                    hasFieldError(
                        newPasswordInput
                    )
                ) {

                    validateNewPassword();

                }


                /*
                 * Si la confirmation était déjà
                 * incorrecte, on la revalide.
                 */

                if (
                    confirmPasswordInput &&
                    confirmPasswordInput.value
                ) {

                    validatePasswordConfirmation();

                }

            }
        );

    }


    if (confirmPasswordInput) {

        confirmPasswordInput.addEventListener(
            "input",
            function () {

                if (
                    hasFieldError(
                        confirmPasswordInput
                    )
                ) {

                    validatePasswordConfirmation();

                }

            }
        );

    }


    /*
     * Nettoyage du formulaire à la fermeture
     * de la fenêtre Bootstrap.
     */

    const passwordModal =
        document.getElementById(
            "passwordModal"
        );


    if (passwordModal) {

        passwordModal.addEventListener(
            "hidden.bs.modal",
            resetPasswordForm
        );

    }

}


/* ==========================================================
   11. MOT DE PASSE ACTUEL
========================================================== */

function validateCurrentPassword() {

    if (!currentPasswordInput) {
        return false;
    }


    if (!currentPasswordInput.value) {

        showFieldError(
            currentPasswordInput,
            "currentPasswordError",
            "Veuillez saisir votre mot de passe actuel."
        );

        return false;

    }


    clearFieldError(
        currentPasswordInput,
        "currentPasswordError"
    );


    return true;

}


/* ==========================================================
   12. NOUVEAU MOT DE PASSE
========================================================== */

function validateNewPassword() {

    if (!newPasswordInput) {
        return false;
    }


    const password =
        newPasswordInput.value;


    if (!password) {

        showFieldError(
            newPasswordInput,
            "newPasswordError",
            "Veuillez saisir votre nouveau mot de passe."
        );

        return false;

    }


    if (password.length < 8) {

        showFieldError(
            newPasswordInput,
            "newPasswordError",
            "Le mot de passe doit contenir au moins 8 caractères."
        );

        return false;

    }


    /*
     * On évite un mot de passe uniquement
     * composé de chiffres.
     */

    if (/^\d+$/.test(password)) {

        showFieldError(
            newPasswordInput,
            "newPasswordError",
            "Le mot de passe ne peut pas contenir uniquement des chiffres."
        );

        return false;

    }


    /*
     * Le nouveau mot de passe ne doit
     * pas être identique à l'ancien.
     */

    if (
        currentPasswordInput &&
        currentPasswordInput.value &&
        password === currentPasswordInput.value
    ) {

        showFieldError(
            newPasswordInput,
            "newPasswordError",
            "Le nouveau mot de passe doit être différent de l'ancien."
        );

        return false;

    }


    clearFieldError(
        newPasswordInput,
        "newPasswordError"
    );


    return true;

}


/* ==========================================================
   13. CONFIRMATION MOT DE PASSE
========================================================== */

function validatePasswordConfirmation() {

    if (!confirmPasswordInput) {
        return false;
    }


    if (!confirmPasswordInput.value) {

        showFieldError(
            confirmPasswordInput,
            "confirmPasswordError",
            "Veuillez confirmer le nouveau mot de passe."
        );

        return false;

    }


    if (
        !newPasswordInput ||
        confirmPasswordInput.value !==
        newPasswordInput.value
    ) {

        showFieldError(
            confirmPasswordInput,
            "confirmPasswordError",
            "Les deux mots de passe ne correspondent pas."
        );

        return false;

    }


    clearFieldError(
        confirmPasswordInput,
        "confirmPasswordError"
    );


    return true;

}


/* ==========================================================
   14. SOUMISSION MOT DE PASSE (AJAX)
========================================================== */

function handlePasswordSubmit(event) {

    event.preventDefault();


    if (
        changePasswordButton &&
        changePasswordButton.disabled
    ) {

        return;

    }


    const currentValid =
        validateCurrentPassword();


    const newValid =
        validateNewPassword();


    const confirmationValid =
        validatePasswordConfirmation();


    if (
        !currentValid ||
        !newValid ||
        !confirmationValid
    ) {

        focusFirstInvalidField(
            passwordForm
        );

        return;

    }


    setButtonLoading(
        changePasswordButton,
        true,
        "Modification..."
    );


    /*
     * Envoi AJAX à Django.
     */

    const formData = new FormData();
    formData.append('action', 'change_password');
    formData.append('current_password', currentPasswordInput.value);
    formData.append('new_password', newPasswordInput.value);
    formData.append('confirm_password', confirmPasswordInput.value);

    const csrftoken = getCookie('csrftoken');


    fetch(passwordForm.action, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrftoken,
        },
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        setButtonLoading(
            changePasswordButton,
            false
        );

        if (data.success) {
            closePasswordModal();
            showToast(
                "Mot de passe modifié",
                data.message || "Votre mot de passe a été mis à jour."
            );
        } else {
            if (data.errors && data.errors.length > 0) {
                // Display the first error
                const error = data.errors[0];
                if (error.toLowerCase().includes('actuel') || error.toLowerCase().includes('current')) {
                    showFieldError(currentPasswordInput, 'currentPasswordError', error);
                } else if (error.toLowerCase().includes('8 caractères') || error.toLowerCase().includes('chiffres')) {
                    showFieldError(newPasswordInput, 'newPasswordError', error);
                } else if (error.toLowerCase().includes('confirmation') || error.toLowerCase().includes('correspond')) {
                    showFieldError(confirmPasswordInput, 'confirmPasswordError', error);
                } else {
                    showToast(
                        "Échec de la modification",
                        error,
                        true
                    );
                }
            } else {
                showToast(
                    "Échec de la modification",
                    "Une erreur est survenue.",
                    true
                );
            }
        }
    })
    .catch(error => {
        console.error('Erreur:', error);
        setButtonLoading(
            changePasswordButton,
            false
        );
        showToast(
            "Échec de la modification",
            "Une erreur est survenue. Veuillez réessayer.",
            true
        );
    });

}


/* ==========================================================
   15. AFFICHER / MASQUER MOT DE PASSE
========================================================== */

function configurePasswordToggles() {

    const buttons =
        document.querySelectorAll(
            ".password-toggle"
        );


    buttons.forEach(
        function (button) {

            button.addEventListener(
                "click",
                function () {

                    const targetId =
                        button.dataset.target;


                    const input =
                        document.getElementById(
                            targetId
                        );


                    if (!input) {
                        return;
                    }


                    const showingPassword =
                        input.type === "text";


                    /*
                     * Basculer type.
                     */

                    input.type =
                        showingPassword
                            ? "password"
                            : "text";


                    /*
                     * Changer icône.
                     */

                    const icon =
                        button.querySelector("i");


                    if (icon) {

                        icon.className =
                            showingPassword
                                ? "bi bi-eye"
                                : "bi bi-eye-slash";

                    }


                    /*
                     * Accessibilité.
                     */

                    button.setAttribute(
                        "aria-label",
                        showingPassword
                            ? "Afficher le mot de passe"
                            : "Masquer le mot de passe"
                    );

                }
            );

        }
    );

}


/* ==========================================================
   16. FERMER MODAL
========================================================== */

function closePasswordModal() {

    const modalElement =
        document.getElementById(
            "passwordModal"
        );


    if (!modalElement) {
        return;
    }


    /*
     * Bootstrap doit être disponible.
     */

    if (
        typeof bootstrap === "undefined" ||
        !bootstrap.Modal
    ) {

        console.warn(
            "Bootstrap Modal n'est pas disponible."
        );

        return;

    }


    const modal =
        bootstrap.Modal.getOrCreateInstance(
            modalElement
        );


    modal.hide();

}


/* ==========================================================
   17. RÉINITIALISER FORMULAIRE MOT DE PASSE
========================================================== */

function resetPasswordForm() {

    if (!passwordForm) {
        return;
    }


    passwordForm.reset();


    const inputs = [
        currentPasswordInput,
        newPasswordInput,
        confirmPasswordInput
    ];


    inputs.forEach(
        function (input) {

            if (!input) {
                return;
            }


            /*
             * Remettre tous les champs
             * en mode password.
             */

            input.type =
                "password";


            input.removeAttribute(
                "aria-invalid"
            );


            const field =
                input.closest(
                    ".profile-field"
                );


            if (field) {

                field.classList.remove(
                    "has-error"
                );

            }

        }
    );


    /*
     * Effacer les messages.
     */

    clearErrorElement(
        "currentPasswordError"
    );

    clearErrorElement(
        "newPasswordError"
    );

    clearErrorElement(
        "confirmPasswordError"
    );


    /*
     * Remettre les icônes œil.
     */

    document
        .querySelectorAll(
            ".password-toggle"
        )
        .forEach(
            function (button) {

                const icon =
                    button.querySelector("i");


                if (icon) {

                    icon.className =
                        "bi bi-eye";

                }


                button.setAttribute(
                    "aria-label",
                    "Afficher le mot de passe"
                );

            }
        );

}


/* ==========================================================
   18. AFFICHER UNE ERREUR
========================================================== */

function showFieldError(
    input,
    errorId,
    message
) {

    if (!input) {
        return;
    }


    const field =
        input.closest(
            ".profile-field"
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
   19. SUPPRIMER UNE ERREUR
========================================================== */

function clearFieldError(
    input,
    errorId
) {

    if (!input) {
        return;
    }


    const field =
        input.closest(
            ".profile-field"
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
   20. SUPPRIMER UNE ERREUR PAR ID
========================================================== */

function clearErrorElement(errorId) {

    const error =
        document.getElementById(
            errorId
        );


    if (!error) {
        return;
    }


    error.textContent = "";

    error.classList.remove(
        "visible"
    );

}


/* ==========================================================
   21. SAVOIR SI UN CHAMP A UNE ERREUR
========================================================== */

function hasFieldError(input) {

    if (!input) {
        return false;
    }


    const field =
        input.closest(
            ".profile-field"
        );


    return Boolean(
        field &&
        field.classList.contains(
            "has-error"
        )
    );

}


/* ==========================================================
   22. PREMIER CHAMP INVALIDE
========================================================== */

function focusFirstInvalidField(form) {

    if (!form) {
        return;
    }


    const invalid =
        form.querySelector(
            '[aria-invalid="true"]'
        );


    if (!invalid) {
        return;
    }


    invalid.focus();


    invalid.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

}


/* ==========================================================
   23. ÉTAT CHARGEMENT D'UN BOUTON
========================================================== */

function setButtonLoading(
    button,
    loading,
    loadingText = "Traitement..."
) {

    if (!button) {
        return;
    }


    if (loading) {

        /*
         * Conserver le contenu original.
         */

        if (
            !button.dataset.originalHtml
        ) {

            button.dataset.originalHtml =
                button.innerHTML;

        }


        button.disabled =
            true;


        button.innerHTML = `
            <span
                class="spinner-border spinner-border-sm"
                aria-hidden="true"
            ></span>

            ${loadingText}
        `;


        return;

    }


    button.disabled =
        false;


    if (
        button.dataset.originalHtml
    ) {

        button.innerHTML =
            button.dataset.originalHtml;


        delete button.dataset.originalHtml;

    }

}


/* ==========================================================
   24. NOTIFICATION
========================================================== */

function showToast(
    title,
    message,
    error = false
) {

    if (!profileToast) {
        return;
    }


    /*
     * Texte.
     */

    if (profileToastTitle) {

        profileToastTitle.textContent =
            title;

    }


    if (profileToastMessage) {

        profileToastMessage.textContent =
            message;

    }


    /*
     * Icône.
     */

    const iconContainer =
        profileToast.querySelector(
            ".profile-toast-icon"
        );


    const icon =
        iconContainer
            ? iconContainer.querySelector("i")
            : null;


    if (icon) {

        icon.className =
            error
                ? "bi bi-exclamation-lg"
                : "bi bi-check-lg";

    }


    /*
     * Afficher.
     */

    profileToast.classList.add(
        "show"
    );


    /*
     * Annuler l'ancien timer
     * s'il existe.
     */

    if (toastTimer) {

        clearTimeout(
            toastTimer
        );

    }


    /*
     * Masquer après 3,5 secondes.
     */

    toastTimer =
        window.setTimeout(
            function () {

                profileToast.classList.remove(
                    "show"
                );

            },
            3500
        );

}