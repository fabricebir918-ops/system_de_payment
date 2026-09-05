document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       ÉLÉMENTS
    ====================================================== */

    const retryButton =
        document.getElementById("retryButton");

    const correctedReference =
        document.getElementById("correctedReference");

    const correctionReason =
        document.getElementById("correctionReason");

    const confirmCorrection =
        document.getElementById("confirmCorrection");

    const correctionMessage =
        document.getElementById("correctionMessage");


    const escalationReason =
        document.getElementById("escalationReason");

    const confirmEscalation =
        document.getElementById("confirmEscalation");

    const escalationMessage =
        document.getElementById("escalationMessage");


    /* =====================================================
       RELANCER LE RAPPROCHEMENT
    ====================================================== */

    retryButton.addEventListener("click", () => {

        const originalContent =
            retryButton.innerHTML;


        retryButton.disabled = true;

        retryButton.innerHTML = `
            <div class="decision-icon">
                <span
                    class="spinner-border spinner-border-sm"
                    aria-hidden="true"
                ></span>
            </div>

            <div>
                <strong>Vérification en cours...</strong>

                <span>
                    Recherche de la référence dans les
                    transactions disponibles.
                </span>
            </div>
        `;


        setTimeout(() => {

            retryButton.innerHTML = originalContent;

            retryButton.disabled = false;

            alert(
                "Aucune nouvelle correspondance n'a été trouvée pour cette référence."
            );

        }, 1200);

    });


    /* =====================================================
       CORRECTION DE LA RÉFÉRENCE
    ====================================================== */

    confirmCorrection.addEventListener("click", () => {

        const reference =
            correctedReference.value.trim();

        const reason =
            correctionReason.value.trim();


        correctionMessage.className =
            "form-message";

        correctionMessage.textContent =
            "";


        if (reference === "") {

            correctionMessage.classList.add("error");

            correctionMessage.textContent =
                "Veuillez introduire la référence corrigée.";

            correctedReference.focus();

            return;

        }


        if (reason === "") {

            correctionMessage.classList.add("error");

            correctionMessage.textContent =
                "Veuillez indiquer le motif de la correction.";

            correctionReason.focus();

            return;

        }


        if (reference.length < 5) {

            correctionMessage.classList.add("error");

            correctionMessage.textContent =
                "La référence introduite semble invalide.";

            correctedReference.focus();

            return;

        }


        correctionMessage.classList.add("success");

        correctionMessage.textContent =
            "Référence corrigée. Le rapprochement pourra être relancé.";

    });


    /* =====================================================
       TRANSMISSION
    ====================================================== */

    confirmEscalation.addEventListener("click", () => {

        const reason =
            escalationReason.value.trim();


        escalationMessage.className =
            "form-message";

        escalationMessage.textContent =
            "";


        if (reason === "") {

            escalationMessage.classList.add("error");

            escalationMessage.textContent =
                "Veuillez ajouter un commentaire avant la transmission.";

            escalationReason.focus();

            return;

        }


        escalationMessage.classList.add("success");

        escalationMessage.textContent =
            "L'anomalie a été transmise au responsable financier.";

    });

});