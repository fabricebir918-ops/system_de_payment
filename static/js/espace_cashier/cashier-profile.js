document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       PROFIL
    ====================================================== */

    const profileForm =
        document.getElementById("profileForm");

    const editProfileButton =
        document.getElementById("editProfileButton");

    const cancelEditButton =
        document.getElementById("cancelEditButton");

    const formActions =
        document.getElementById("formActions");

    const editableFields =
        document.querySelectorAll(".editable-field");

    const profileMessage =
        document.getElementById("profileMessage");


    let originalValues = {};


    /* =====================================================
       ACTIVER MODIFICATION
    ====================================================== */

    editProfileButton.addEventListener("click", () => {

        originalValues = {};

        editableFields.forEach((field) => {

            originalValues[field.id] =
                field.value;

            field.disabled = false;

        });


        formActions.hidden = false;

        editProfileButton.hidden = true;


        profileMessage.className =
            "profile-message";

        profileMessage.textContent =
            "";


        if (editableFields.length > 0) {
            editableFields[0].focus();
        }

    });


    /* =====================================================
       ANNULER
    ====================================================== */

    cancelEditButton.addEventListener("click", () => {

        editableFields.forEach((field) => {

            field.value =
                originalValues[field.id];

            field.disabled = true;

        });


        formActions.hidden = true;

        editProfileButton.hidden = false;


        profileMessage.className =
            "profile-message";

        profileMessage.textContent =
            "";

    });


    /* =====================================================
       ENREGISTRER (AJAX)
    ====================================================== */

    profileForm.addEventListener("submit", (event) => {

        event.preventDefault();


        const email =
            document
                .getElementById("email")
                .value
                .trim();


        profileMessage.className =
            "profile-message";

        profileMessage.textContent =
            "";


        /* EMAIL */

        if (email === "") {

            showProfileError(
                "Veuillez renseigner votre adresse e-mail."
            );

            document
                .getElementById("email")
                .focus();

            return;

        }


        if (!isValidEmail(email)) {

            showProfileError(
                "Veuillez introduire une adresse e-mail valide."
            );

            document
                .getElementById("email")
                .focus();

            return;

        }


        /* SEND AJAX REQUEST */

        const formData = new FormData();
        formData.append('action', 'update_profile');
        formData.append('email', email);

        // Get CSRF token from cookie
        const csrftoken = getCookie('csrftoken');

        fetch(window.location.href, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': csrftoken,
            },
            body: formData,
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Success
                editableFields.forEach((field) => {
                    field.disabled = true;
                });

                formActions.hidden = true;
                editProfileButton.hidden = false;

                profileMessage.classList.add("success");
                profileMessage.textContent = data.message;

                // Update original values
                editableFields.forEach((field) => {
                    originalValues[field.id] = field.value;
                });
            } else {
                // Errors
                if (data.errors && data.errors.length > 0) {
                    showProfileError(data.errors[0]);
                } else {
                    showProfileError("Une erreur est survenue.");
                }
            }
        })
        .catch(() => {
            showProfileError("Une erreur est survenue. Veuillez réessayer.");
        });

    });


    /* =====================================================
       VALIDATION EMAIL
    ====================================================== */

    function isValidEmail(email) {

        const pattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        return pattern.test(email);

    }


    function showProfileError(message) {

        profileMessage.classList.add("error");

        profileMessage.textContent =
            message;

    }


    /* =====================================================
       MOT DE PASSE (AJAX)
    ====================================================== */

    const passwordForm =
        document.getElementById("passwordForm");

    const passwordMessage =
        document.getElementById("passwordMessage");

    const changePasswordBtn =
        document.getElementById("changePasswordBtn");


    passwordForm.addEventListener("submit", (event) => {

        event.preventDefault();


        const currentPassword =
            document
                .getElementById("currentPassword")
                .value;

        const newPassword =
            document
                .getElementById("newPassword")
                .value;

        const confirmPassword =
            document
                .getElementById("confirmPassword")
                .value;


        passwordMessage.className =
            "password-message";

        passwordMessage.textContent =
            "";


        if (
            currentPassword === "" ||
            newPassword === "" ||
            confirmPassword === ""
        ) {

            showPasswordError(
                "Veuillez remplir tous les champs."
            );

            return;

        }


        if (newPassword.length < 8) {

            showPasswordError(
                "Le nouveau mot de passe doit contenir au moins 8 caractères."
            );

            return;

        }


        if (newPassword !== confirmPassword) {

            showPasswordError(
                "La confirmation ne correspond pas au nouveau mot de passe."
            );

            return;

        }


        if (currentPassword === newPassword) {

            showPasswordError(
                "Le nouveau mot de passe doit être différent du mot de passe actuel."
            );

            return;

        }


        /* SEND AJAX REQUEST */

        const formData = new FormData();
        formData.append('action', 'change_password');
        formData.append('current_password', currentPassword);
        formData.append('new_password', newPassword);
        formData.append('confirm_password', confirmPassword);

        const csrftoken = getCookie('csrftoken');

        // Show loading state
        changePasswordBtn.disabled = true;
        changePasswordBtn.innerHTML = `
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            Modification...
        `;

        fetch(window.location.href, {
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
            changePasswordBtn.disabled = false;
            changePasswordBtn.innerHTML = `
                <i class="bi bi-check-lg"></i>
                Modifier
            `;

            if (data.success) {
                passwordMessage.classList.add("success");
                passwordMessage.textContent = data.message;
                passwordForm.reset();

                // Close modal after 2 seconds
                setTimeout(() => {
                    const modal = bootstrap.Modal.getInstance(
                        document.getElementById('passwordModal')
                    );
                    if (modal) modal.hide();
                }, 2000);
            } else {
                if (data.errors && data.errors.length > 0) {
                    showPasswordError(data.errors[0]);
                } else {
                    showPasswordError("Une erreur est survenue.");
                }
            }
        })
        .catch(() => {
            changePasswordBtn.disabled = false;
            changePasswordBtn.innerHTML = `
                <i class="bi bi-check-lg"></i>
                Modifier
            `;
            showPasswordError("Une erreur est survenue. Veuillez réessayer.");
        });

    });


    function showPasswordError(message) {

        passwordMessage.classList.add("error");

        passwordMessage.textContent =
            message;

    }


    /* =====================================================
       AFFICHER / MASQUER MOT DE PASSE
    ====================================================== */

    const passwordToggles =
        document.querySelectorAll(".password-toggle");


    passwordToggles.forEach((button) => {

        button.addEventListener("click", () => {

            const targetId =
                button.dataset.target;

            const input =
                document.getElementById(targetId);

            const icon =
                button.querySelector("i");


            if (input.type === "password") {

                input.type = "text";

                icon.classList.remove("bi-eye");

                icon.classList.add("bi-eye-slash");

            }

            else {

                input.type = "password";

                icon.classList.remove("bi-eye-slash");

                icon.classList.add("bi-eye");

            }

        });

    });


    /* =====================================================
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

});