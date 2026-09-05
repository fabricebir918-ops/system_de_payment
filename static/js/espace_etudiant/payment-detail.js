"use strict";


/* ==========================================================
   ACADEMICPAY — DÉTAIL D'UN PAIEMENT
   ----------------------------------------------------------
   Le thème est géré exclusivement par dashbord.js.

   Cette page gère :
   - lecture de la référence dans l'URL
   - chargement du paiement
   - affichage des informations
   - statut validé / attente / anomalie
   - timeline
   - paiement introuvable
   - génération du reçu PDF
========================================================== */


/* ==========================================================
   1. INITIALISATION
========================================================== */

document.addEventListener(
    "DOMContentLoaded",
    initializePaymentDetail
);


function initializePaymentDetail() {

    /*
     * Bouton reçu.
     */

    initializeReceiptButton();

}


/* ==========================================================
   2. BOUTON REÇU
========================================================== */

function initializeReceiptButton() {

    const button =
        document.getElementById(
            "downloadReceiptButton"
        );


    if (!button) {

        return;

    }


    button.addEventListener(
        "click",
        function () {

            // Get payment data from data attributes
            const reference = this.dataset.reference;
            const amount = parseFloat(this.dataset.amount) || 0;
            const date = this.dataset.date || '';
            const semester = this.dataset.semester || '';
            const academicYear = this.dataset.academicYear || '';
            const validationDate = this.dataset.validationDate || '';

            if (!reference) {
                alert("Informations du paiement manquantes.");
                return;
            }

            generatePaymentReceipt(
                {
                    reference: reference,
                    amount: amount,
                    date: date,
                    semester: semester,
                    academicYear: academicYear,
                    validationDate: validationDate,
                },
                button
            );

        }
    );

}


/* ==========================================================
   3. GÉNÉRER LE REÇU PDF
========================================================== */

function generatePaymentReceipt(
    payment,
    button
) {

    /*
     * Vérification de jsPDF.
     */

    if (
        !window.jspdf ||
        !window.jspdf.jsPDF
    ) {

        alert(
            "Impossible de générer le reçu PDF. " +
            "La bibliothèque PDF n'est pas disponible."
        );


        console.error(
            "AcademicPay : jsPDF n'est pas chargé."
        );


        return;

    }


    setDownloadButtonLoading(
        button,
        true
    );


    try {

        const {
            jsPDF
        } = window.jspdf;


        const pdf =
            new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4"
            });


        const pageWidth =
            pdf.internal.pageSize.getWidth();


        const pageHeight =
            pdf.internal.pageSize.getHeight();


        const margin = 20;


        /*
         * ================================================
         * LOGO
         * ================================================
         */

        pdf.setFillColor(
            164,
            207,
            57
        );


        pdf.roundedRect(
            margin,
            18,
            13,
            13,
            2.5,
            2.5,
            "F"
        );


        /*
         * A
         */

        pdf.setTextColor(
            23,
            27,
            21
        );


        pdf.setFont(
            "helvetica",
            "bold"
        );


        pdf.setFontSize(11);


        pdf.text(
            "A",
            margin + 6.5,
            26.8,
            {
                align: "center"
            }
        );


        /*
         * AcademicPay
         */

        pdf.setFontSize(17);


        pdf.text(
            "AcademicPay",
            margin + 18,
            25.5
        );


        pdf.setFont(
            "helvetica",
            "normal"
        );


        pdf.setFontSize(7.5);


        pdf.setTextColor(
            110,
            116,
            108
        );


        pdf.text(
            "Gestion des paiements academiques",
            margin + 18,
            30.5
        );


        /*
         * ================================================
         * LIGNE
         * ================================================
         */

        pdf.setDrawColor(
            222,
            226,
            218
        );


        pdf.line(
            margin,
            41,
            pageWidth - margin,
            41
        );


        /*
         * ================================================
         * TITRE
         * ================================================
         */

        pdf.setFont(
            "helvetica",
            "bold"
        );


        pdf.setFontSize(18);


        pdf.setTextColor(
            28,
            32,
            27
        );


        pdf.text(
            "RECU DE PAIEMENT",
            margin,
            56
        );


        /*
         * Référence
         */

        pdf.setFont(
            "helvetica",
            "normal"
        );


        pdf.setFontSize(8);


        pdf.setTextColor(
            105,
            112,
            103
        );


        pdf.text(
            `Reference : #${payment.reference}`,
            margin,
            63
        );


        /*
         * Badge validation.
         */

        pdf.setFillColor(
            241,
            248,
            225
        );


        pdf.roundedRect(
            pageWidth - margin - 30,
            50,
            30,
            10,
            2,
            2,
            "F"
        );


        pdf.setFont(
            "helvetica",
            "bold"
        );


        pdf.setFontSize(7.5);


        pdf.setTextColor(
            111,
            145,
            27
        );


        pdf.text(
            "VALIDE",
            pageWidth - margin - 15,
            56.4,
            {
                align: "center"
            }
        );


        /*
         * ================================================
         * MONTANT
         * ================================================
         */

        pdf.setFillColor(
            164,
            207,
            57
        );


        pdf.roundedRect(
            margin,
            75,
            pageWidth - margin * 2,
            37,
            3,
            3,
            "F"
        );


        pdf.setTextColor(
            23,
            27,
            21
        );


        pdf.setFont(
            "helvetica",
            "normal"
        );


        pdf.setFontSize(7.5);


        pdf.text(
            "MONTANT VALIDE",
            margin + 8,
            87
        );


        pdf.setFont(
            "helvetica",
            "bold"
        );


        pdf.setFontSize(24);


        pdf.text(
            formatPaymentAmount(
                payment.amount
            ),
            margin + 8,
            102
        );


        /*
         * ================================================
         * ÉTUDIANT
         * ================================================
         */

        let y = 132;


        drawPDFSectionTitle(
            pdf,
            "INFORMATIONS DE L'ETUDIANT",
            margin,
            y
        );


        y += 11;


        drawPDFRow(
            pdf,
            "Etudiant",
            document.querySelector('.student-identity h2')?.textContent || 'Étudiant',
            margin,
            y,
            pageWidth
        );


        y += 10;


        drawPDFRow(
            pdf,
            "Matricule",
            document.querySelector('.student-meta span:first-child')?.textContent?.trim() || 'Sans ID',
            margin,
            y,
            pageWidth
        );


        y += 10;


        drawPDFRow(
            pdf,
            "Promotion",
            document.querySelector('.student-meta span:last-child')?.textContent?.trim() || 'Non défini',
            margin,
            y,
            pageWidth
        );


        y += 10;


        drawPDFRow(
            pdf,
            "Faculte",
            document.querySelector('.student-identity .result-label')?.parentElement?.querySelector('span')?.textContent || 'Non définie',
            margin,
            y,
            pageWidth
        );


        /*
         * ================================================
         * PAIEMENT
         * ================================================
         */

        y += 19;


        drawPDFSectionTitle(
            pdf,
            "DETAIL DU PAIEMENT",
            margin,
            y
        );


        y += 11;


        drawPDFRow(
            pdf,
            "Reference",
            `#${payment.reference}`,
            margin,
            y,
            pageWidth
        );


        y += 10;


        drawPDFRow(
            pdf,
            "Date du paiement",
            payment.date || '',
            margin,
            y,
            pageWidth
        );


        y += 10;


        drawPDFRow(
            pdf,
            "Semestre",
            payment.semester || '',
            margin,
            y,
            pageWidth
        );


        y += 10;


        drawPDFRow(
            pdf,
            "Annee academique",
            payment.academicYear || '',
            margin,
            y,
            pageWidth
        );


        y += 10;


        drawPDFRow(
            pdf,
            "Date de validation",
            payment.validationDate || '',
            margin,
            y,
            pageWidth
        );


        /*
         * ================================================
         * CONFIRMATION
         * ================================================
         */

        y += 19;


        pdf.setFillColor(
            247,
            249,
            244
        );


        pdf.setDrawColor(
            220,
            225,
            216
        );


        pdf.roundedRect(
            margin,
            y,
            pageWidth - margin * 2,
            25,
            3,
            3,
            "FD"
        );


        pdf.setFont(
            "helvetica",
            "bold"
        );


        pdf.setFontSize(8);


        pdf.setTextColor(
            111,
            145,
            27
        );


        pdf.text(
            "PAIEMENT VALIDE",
            margin + 7,
            y + 9
        );


        pdf.setFont(
            "helvetica",
            "normal"
        );


        pdf.setFontSize(7.3);


        pdf.setTextColor(
            105,
            112,
            103
        );


        pdf.text(
            "Cette transaction a ete rapprochee et validee dans AcademicPay.",
            margin + 7,
            y + 16
        );


        /*
         * ================================================
         * FOOTER
         * ================================================
         */

        const footerY =
            pageHeight - 18;


        pdf.setDrawColor(
            222,
            226,
            218
        );


        pdf.line(
            margin,
            footerY - 7,
            pageWidth - margin,
            footerY - 7
        );


        pdf.setFontSize(7);


        pdf.setTextColor(
            125,
            130,
            122
        );


        pdf.text(
            "Université Catholique de Bukavu",
            margin,
            footerY
        );


        pdf.text(
            "Document genere par AcademicPay",
            pageWidth - margin,
            footerY,
            {
                align: "right"
            }
        );


        /*
         * ================================================
         * ENREGISTREMENT
         * ================================================
         */

        pdf.save(
            `recu-${payment.reference}.pdf`
        );

    } catch (error) {

        console.error(
            "Erreur de génération du reçu :",
            error
        );


        alert(
            "Une erreur est survenue pendant la génération du reçu."
        );

    } finally {

        setDownloadButtonLoading(
            button,
            false
        );

    }

}


/* ==========================================================
   4. TITRE SECTION PDF
========================================================== */

function drawPDFSectionTitle(
    pdf,
    text,
    x,
    y
) {

    pdf.setFont(
        "helvetica",
        "bold"
    );


    pdf.setFontSize(7.5);


    pdf.setTextColor(
        111,
        145,
        27
    );


    pdf.text(
        text,
        x,
        y
    );

}


/* ==========================================================
   5. LIGNE PDF
========================================================== */

function drawPDFRow(
    pdf,
    label,
    value,
    x,
    y,
    pageWidth
) {

    const rightMargin = 20;


    /*
     * Label.
     */

    pdf.setFont(
        "helvetica",
        "normal"
    );


    pdf.setFontSize(8);


    pdf.setTextColor(
        105,
        112,
        103
    );


    pdf.text(
        label,
        x,
        y
    );


    /*
     * Valeur.
     */

    pdf.setFont(
        "helvetica",
        "bold"
    );


    pdf.setTextColor(
        28,
        32,
        27
    );


    pdf.text(
        String(value || "—"),
        pageWidth - rightMargin,
        y,
        {
            align: "right"
        }
    );


    /*
     * Séparateur.
     */

    pdf.setDrawColor(
        235,
        238,
        232
    );


    pdf.line(
        x,
        y + 3.5,
        pageWidth - rightMargin,
        y + 3.5
    );

}


/* ==========================================================
   6. ÉTAT DU BOUTON PDF
========================================================== */

function setDownloadButtonLoading(
    button,
    loading
) {

    if (!button) {
        return;
    }


    if (loading) {

        button.dataset.originalHtml =
            button.innerHTML;


        button.disabled = true;


        button.innerHTML = `
            <span
                class="spinner-border spinner-border-sm"
                aria-hidden="true"
            ></span>

            Génération...
        `;


        return;

    }


    button.disabled = false;


    if (button.dataset.originalHtml) {

        button.innerHTML =
            button.dataset.originalHtml;


        delete button.dataset.originalHtml;

    }

}


/* ==========================================================
   7. FORMATAGE DU MONTANT
========================================================== */

function formatPaymentAmount(amount) {

    const value =
        Number(amount);


    if (!Number.isFinite(value)) {

        return "0,00 $";

    }


    return (
        value.toLocaleString(
            "fr-FR",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        ) +
        " $"
    );

}

function initializeReceiptButton() {

    const button = document.getElementById("downloadReceiptButton");

    if (!button) {
        return;
    }

    button.addEventListener("click", function () {
        const url = this.dataset.url;
        if (url) {
            window.open(url, '_blank');
        }
    });

}