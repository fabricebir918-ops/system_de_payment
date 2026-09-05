/* ==========================================================
   ACADEMICPAY — FINANCE / PROFIL
   Django version with AJAX support
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* ======================================================
       ÉLÉMENTS — PROFIL
    ====================================================== */

    const profileForm =
        document.getElementById("profileForm");

    const editProfileButton =
        document.getElementById("editProfileButton");

    const cancelProfileButton =
        document.getElementById("cancelProfileButton");

    const saveProfileButton =
        document.getElementById("saveProfileButton");

    const profileFormActions =
        document.getElementById("profileFormActions");

    const lastNameInput =
        document.getElementById("profileLastName");

    const firstNameInput =
        document.getElementById("profileFirstName");

    const emailInput =
        document.getElementById("profileEmail");

    const phoneInput =
        document.getElementById("profilePhone");

    const departmentInput =
        document.getElementById("profileDepartment");

    const roleInput =
        document.getElementById("profileRole");


    /* ======================================================
       ÉLÉMENTS — SÉCURITÉ
    ====================================================== */

    const changePasswordButton =
        document.getElementById("changePasswordButton");

    const sessionsButton =
        document.getElementById("sessionsButton");

    const passwordModalElement =
        document.getElementById("passwordModal");

    const sessionsModalElement =
        document.getElementById("sessionsModal");

    const passwordForm =
        document.getElementById("passwordForm");

    const currentPassword =
        document.getElementById("currentPassword");

    const newPassword =
        document.getElementById("newPassword");

    const confirmPassword =
        document.getElementById("confirmPassword");

    const passwordError =
        document.getElementById("passwordError");

    const changePasswordSubmit =
        document.getElementById("changePasswordSubmit");


    /* ======================================================
       ÉLÉMENTS — PRÉFÉRENCES
    ====================================================== */

    const themeButton =
        document.getElementById("themeButton");

    const appearanceSelect =
        document.getElementById("appearanceSelect");

    const tableDensitySelect =
        document.getElementById("tableDensitySelect");

    const anomalyNotificationSwitch =
        document.getElementById("anomalyNotificationSwitch");


    /* ======================================================
       TOAST
    ====================================================== */

    const toastElement =
        document.getElementById("financeToast");

    const toastMessage =
        document.getElementById("toastMessage");


    /* ======================================================
       CSRF TOKEN HELPER
    ====================================================== */

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


    /* ======================================================
       CHAMPS MODIFIABLES / VERROUILLÉS
    ====================================================== */

    const editableFields = [
        lastNameInput,
        firstNameInput,
        emailInput,
        phoneInput
    ].filter(Boolean);


    const lockedFields = [
        departmentInput,
        roleInput
    ].filter(Boolean);


    lockedFields.forEach(field => {
        field.dataset.locked = "true";
        field.disabled = true;
    });


    /* ======================================================
       VALEURS ORIGINALES
    ====================================================== */

    let originalProfileValues = {};


    function saveOriginalValues() {
        originalProfileValues = {};
        editableFields.forEach(field => {
            if (field) originalProfileValues[field.id] = field.value;
        });
    }


    function restoreOriginalValues() {
        editableFields.forEach(field => {
            if (field && originalProfileValues[field.id] !== undefined) {
                field.value = originalProfileValues[field.id];
            }
        });
    }


    /* ======================================================
       MODE ÉDITION
    ====================================================== */

    function enableProfileEditing() {
        saveOriginalValues();

        editableFields.forEach(field => {
            if (field) field.disabled = false;
        });

        lockedFields.forEach(field => {
            if (field) field.disabled = true;
        });

        profileForm?.classList.add("editing");

        if (profileFormActions) {
            profileFormActions.hidden = false;
        }

        if (editProfileButton) {
            editProfileButton.disabled = true;
        }

        firstNameInput?.focus();
    }


    function disableProfileEditing() {
        editableFields.forEach(field => {
            if (field) field.disabled = true;
        });

        lockedFields.forEach(field => {
            if (field) field.disabled = true;
        });

        profileForm?.classList.remove("editing");

        if (profileFormActions) {
            profileFormActions.hidden = true;
        }

        if (editProfileButton) {
            editProfileButton.disabled = false;
        }
    }


    editProfileButton?.addEventListener("click", enableProfileEditing);


    cancelProfileButton?.addEventListener("click", () => {
        restoreOriginalValues();
        disableProfileEditing();
        showToast("Modifications annulées.");
    });


    /* ======================================================
       ENREGISTRER LE PROFIL (AJAX)
    ====================================================== */

    profileForm?.addEventListener("submit", function(event) {
        event.preventDefault();

        const lastName = lastNameInput?.value.trim() || "";
        const firstName = firstNameInput?.value.trim() || "";
        const email = emailInput?.value.trim() || "";
        const phone = phoneInput?.value.trim() || "";

        // Validate
        if (!lastName) {
            showToast("Veuillez renseigner le nom.");
            lastNameInput?.focus();
            return;
        }

        if (!firstName) {
            showToast("Veuillez renseigner le prénom.");
            firstNameInput?.focus();
            return;
        }

        if (emailInput && !emailInput.checkValidity()) {
            showToast("Veuillez saisir une adresse e-mail valide.");
            emailInput?.focus();
            return;
        }

        if (!phone) {
            showToast("Veuillez renseigner le numéro de téléphone.");
            phoneInput?.focus();
            return;
        }

        // Send AJAX request
        const formData = new FormData();
        formData.append('action', 'update_profile');
        formData.append('first_name', firstName);
        formData.append('last_name', lastName);
        formData.append('email', email);
        formData.append('phone', phone);

        const csrftoken = getCookie('csrftoken');

        // Show loading state
        if (saveProfileButton) {
            saveProfileButton.disabled = true;
            saveProfileButton.innerHTML = `
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                Enregistrement...
            `;
        }

        fetch(this.action, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': csrftoken,
            },
            body: formData,
        })
        .then(response => response.json())
        .then(data => {
            // Reset button
            if (saveProfileButton) {
                saveProfileButton.disabled = false;
                saveProfileButton.innerHTML = '<i class="bi bi-check2"></i> Enregistrer';
            }

            if (data.success) {
                saveOriginalValues();
                disableProfileEditing();
                updateVisibleProfileName(data.full_name || firstName + ' ' + lastName);
                showToast(data.message || "Informations mises à jour.");
            } else {
                if (data.errors && data.errors.length > 0) {
                    showToast(data.errors[0]);
                } else {
                    showToast("Une erreur est survenue.");
                }
            }
        })
        .catch(error => {
            console.error('Error:', error);
            if (saveProfileButton) {
                saveProfileButton.disabled = false;
                saveProfileButton.innerHTML = '<i class="bi bi-check2"></i> Enregistrer';
            }
            showToast("Une erreur est survenue. Veuillez réessayer.");
        });
    });


    /* ======================================================
       NOM AFFICHÉ
    ====================================================== */

    function updateVisibleProfileName(completeName) {
        if (!completeName) return;

        const profileName = document.querySelector(".profile-sidebar-card > h2");
        if (profileName) {
            profileName.textContent = completeName;
        }

        // Update sidebar name
        const sidebarName = document.querySelector(".finance-user .user-information strong");
        if (sidebarName) {
            sidebarName.textContent = completeName;
        }
    }


    /* ======================================================
       MODALE MOT DE PASSE
    ====================================================== */

    changePasswordButton?.addEventListener("click", () => {
        clearPasswordForm();
        if (passwordModalElement && typeof bootstrap !== "undefined") {
            bootstrap.Modal.getOrCreateInstance(passwordModalElement).show();
        }
    });


    /* ======================================================
       AFFICHER / MASQUER MOT DE PASSE
    ====================================================== */

    document.querySelectorAll(".toggle-password").forEach(button => {
        button.addEventListener("click", () => {
            const targetId = button.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;

            const isPassword = input.type === "password";
            input.type = isPassword ? "text" : "password";

            const icon = button.querySelector("i");
            if (icon) {
                icon.className = isPassword ? "bi bi-eye-slash" : "bi bi-eye";
            }

            button.setAttribute("aria-label", isPassword ? "Masquer le mot de passe" : "Afficher le mot de passe");
        });
    });


    /* ======================================================
       CHANGEMENT MOT DE PASSE (AJAX)
    ====================================================== */

    passwordForm?.addEventListener("submit", function(event) {
        event.preventDefault();
        hidePasswordError();

        const currentValue = currentPassword?.value || "";
        const newValue = newPassword?.value || "";
        const confirmValue = confirmPassword?.value || "";

        if (!currentValue) {
            showPasswordError("Veuillez saisir votre mot de passe actuel.");
            currentPassword?.focus();
            return;
        }

        if (newValue.length < 8) {
            showPasswordError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
            newPassword?.focus();
            return;
        }

        if (newValue === currentValue) {
            showPasswordError("Le nouveau mot de passe doit être différent du mot de passe actuel.");
            newPassword?.focus();
            return;
        }

        if (newValue !== confirmValue) {
            showPasswordError("Les deux nouveaux mots de passe ne correspondent pas.");
            confirmPassword?.focus();
            return;
        }

        // Send AJAX request
        const formData = new FormData();
        formData.append('action', 'change_password');
        formData.append('current_password', currentValue);
        formData.append('new_password', newValue);
        formData.append('confirm_password', confirmValue);

        const csrftoken = getCookie('csrftoken');

        // Show loading state
        if (changePasswordSubmit) {
            changePasswordSubmit.disabled = true;
            changePasswordSubmit.innerHTML = `
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                Modification...
            `;
        }

        fetch(this.action, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': csrftoken,
            },
            body: formData,
        })
        .then(response => response.json())
        .then(data => {
            // Reset button
            if (changePasswordSubmit) {
                changePasswordSubmit.disabled = false;
                changePasswordSubmit.innerHTML = '<i class="bi bi-shield-check"></i> Modifier';
            }

            if (data.success) {
                if (passwordModalElement && typeof bootstrap !== "undefined") {
                    bootstrap.Modal.getOrCreateInstance(passwordModalElement).hide();
                }
                clearPasswordForm();
                showToast(data.message || "Mot de passe modifié avec succès.");
            } else {
                if (data.errors && data.errors.length > 0) {
                    showPasswordError(data.errors[0]);
                } else {
                    showPasswordError("Une erreur est survenue.");
                }
            }
        })
        .catch(error => {
            console.error('Error:', error);
            if (changePasswordSubmit) {
                changePasswordSubmit.disabled = false;
                changePasswordSubmit.innerHTML = '<i class="bi bi-shield-check"></i> Modifier';
            }
            showPasswordError("Une erreur est survenue. Veuillez réessayer.");
        });
    });


    function showPasswordError(message) {
        if (!passwordError) return;
        passwordError.textContent = message;
        passwordError.hidden = false;
    }


    function hidePasswordError() {
        if (!passwordError) return;
        passwordError.textContent = "";
        passwordError.hidden = true;
    }


    function clearPasswordForm() {
        passwordForm?.reset();
        hidePasswordError();

        document.querySelectorAll(".toggle-password").forEach(button => {
            const targetId = button.dataset.target;
            const input = document.getElementById(targetId);
            const icon = button.querySelector("i");

            if (input) input.type = "password";
            if (icon) icon.className = "bi bi-eye";
            button.setAttribute("aria-label", "Afficher le mot de passe");
        });
    }


    passwordModalElement?.addEventListener("hidden.bs.modal", clearPasswordForm);


    /* ======================================================
       SESSIONS
    ====================================================== */

    sessionsButton?.addEventListener("click", () => {
        if (sessionsModalElement && typeof bootstrap !== "undefined") {
            bootstrap.Modal.getOrCreateInstance(sessionsModalElement).show();
        }
    });


    /* ======================================================
       THÈME
    ====================================================== */

    function initializeTheme() {
        const savedTheme = localStorage.getItem("academicpay-finance-theme") || "dark";
        applyTheme(savedTheme, false);
    }


    function applyTheme(theme, save = true) {
        const lightMode = theme === "light";
        document.body.classList.toggle("light-theme", lightMode);

        if (appearanceSelect) {
            appearanceSelect.value = lightMode ? "light" : "dark";
        }

        updateThemeIcon();

        if (save) {
            localStorage.setItem("academicpay-finance-theme", lightMode ? "light" : "dark");
        }
    }


    function updateThemeIcon() {
        if (!themeButton) return;
        const icon = themeButton.querySelector("i");
        if (!icon) return;

        const lightMode = document.body.classList.contains("light-theme");
        icon.className = lightMode ? "bi bi-moon" : "bi bi-sun";
        themeButton.title = lightMode ? "Activer le mode sombre" : "Activer le mode clair";
    }


    themeButton?.addEventListener("click", () => {
        const nextTheme = document.body.classList.contains("light-theme") ? "dark" : "light";
        applyTheme(nextTheme);
    });


    appearanceSelect?.addEventListener("change", () => {
        applyTheme(appearanceSelect.value);
        showToast(appearanceSelect.value === "light" ? "Mode clair activé." : "Mode sombre activé.");
    });


    /* ======================================================
       DENSITÉ DES TABLEAUX
    ====================================================== */

    function initializeTableDensity() {
        const density = localStorage.getItem("academicpay-table-density") || "comfortable";
        applyTableDensity(density, false);
    }


    function applyTableDensity(density, save = true) {
        const compact = density === "compact";
        document.body.classList.toggle("compact-tables", compact);

        if (tableDensitySelect) {
            tableDensitySelect.value = compact ? "compact" : "comfortable";
        }

        if (save) {
            localStorage.setItem("academicpay-table-density", compact ? "compact" : "comfortable");
        }
    }


    tableDensitySelect?.addEventListener("change", () => {
        applyTableDensity(tableDensitySelect.value);
        showToast(tableDensitySelect.value === "compact" ? "Affichage compact activé." : "Affichage confortable activé.");
    });


    /* ======================================================
       NOTIFICATIONS D'ANOMALIES
    ====================================================== */

    function initializeNotifications() {
        if (!anomalyNotificationSwitch) return;

        const savedValue = localStorage.getItem("academicpay-anomaly-notifications");
        anomalyNotificationSwitch.checked = savedValue === null ? true : savedValue === "true";
    }


    anomalyNotificationSwitch?.addEventListener("change", () => {
        const enabled = anomalyNotificationSwitch.checked;
        localStorage.setItem("academicpay-anomaly-notifications", String(enabled));
        showToast(enabled ? "Notifications d'anomalies activées." : "Notifications d'anomalies désactivées.");
    });


    /* ======================================================
       TOAST
    ====================================================== */

    function showToast(message) {
        if (!toastElement || !toastMessage || typeof bootstrap === "undefined") return;

        toastMessage.textContent = message;
        bootstrap.Toast.getOrCreateInstance(toastElement, { delay: 2500 }).show();
    }


    /* ======================================================
       INITIALISATION
    ====================================================== */

    saveOriginalValues();
    disableProfileEditing();
    initializeTheme();
    initializeTableDensity();
    initializeNotifications();

});