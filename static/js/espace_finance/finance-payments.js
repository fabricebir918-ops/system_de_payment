"use strict";

/* ============================================================
   ACADEMICPAY
   FINANCE — PAIEMENTS

   Prototype frontend basé sur le dataset synthétique Django.

   IMPORTANT :
   - Les données simulent des PaymentClaim.
   - APPROVED -> Payment créé
   - PENDING  -> aucun Payment
   - ANOMALY  -> PaymentAnomaly
   ============================================================ */


/* ============================================================
   1. RÉFÉRENTIEL BANCAIRE
   ============================================================ */

const BANKS = payments_data.banks;


/* ============================================================
   2. RÉFÉRENTIEL ACADÉMIQUE

   Reproduction frontend de :

   Faculty
       -> Department
           -> Program
               -> AcademicProgram(level)

   RÈGLES DES FILTRES :
   - Faculté : toujours active.
   - Département : activé après choix d'une faculté.
   - Spécialisation : activée après choix d'un département.
   - Promotion : toujours active et indépendante.
   ============================================================ */

const ACADEMIC_STRUCTURE = payments_data.academicStructure;


/* ============================================================
   3. FACULTÉS

   Conservé pour rester compatible avec les fonctions
   existantes de la page.
   ============================================================ */

const FACULTIES =
    Object.fromEntries(
        Object.entries(
            ACADEMIC_STRUCTURE
        ).map(
            ([code, faculty]) => [
                code,
                faculty.name
            ]
        )
    );


/* ============================================================
   4. PROMOTIONS

   Promotion reste indépendante des trois autres filtres.

   Les valeurs correspondent aux niveaux réellement présents
   dans le référentiel académique actuellement fourni.
   ============================================================ */

const PROMOTIONS = payments_data.promotions;


/* ============================================================
   5. SEMESTRES
   ============================================================ */

const SEMESTERS = {
    S1: "Semestre 1",
    S2: "Semestre 2"
};


/* ============================================================
   6. ANNÉES ACADÉMIQUES
   ============================================================ */

const ACADEMIC_YEARS = [
    "2023-2024",
    "2024-2025",
    "2025-2026",
    "2026-2027"
];

const CURRENT_ACADEMIC_YEAR =
    "2026-2027";


/* ============================================================
   7. SCÉNARIOS DE DÉCLARATION

   APPROVED :
       PaymentClaim -> Payment
       BankTransaction.is_verified = true

   PENDING :
       PaymentClaim uniquement

   ANOMALY :
       PaymentClaim rejeté
       PaymentAnomaly créée
   ============================================================ */

const CLAIM_SCENARIOS = {

    APPROVED: {
        label: "Approuvé",
        className: "validated"
    },

    PENDING: {
        label: "En attente",
        className: "pending"
    },

    ANOMALY: {
        label: "Anomalie",
        className: "anomaly"
    }
};


/* ============================================================
   8. TYPES D'ANOMALIES DU BACKEND
   ============================================================ */

const ANOMALY_TYPES = {

    REFERENCE_NOT_FOUND:
        "Référence introuvable",

    REFERENCE_ALREADY_USED:
        "Référence déjà utilisée",

    AMOUNT_MISMATCH:
        "Montant différent",

    BANK_MISMATCH:
        "Banque différente",

    DATE_MISMATCH:
        "Date différente",

    DUPLICATE_CLAIM:
        "Déclaration en double"
};


/* ============================================================
   9. DONNÉES SYNTHÉTIQUES FRONTEND

   IMPORTANT :
   conserve ici le tableau paymentClaims de ton fichier
   actuel SANS LE MODIFIER.

   Il contient déjà :
       faculty
       department
       departmentName
       program
       programName
       promotion

   Exemple de structure :
   ============================================================ */



const paymentClaims = payments_data.claims;


/* ============================================================
   10. ÉTAT DE LA PAGE
   ============================================================ */

const state = {

    currentPage: 1,

    rowsPerPage: 10,

    startDate: "",

    endDate: ""
};


/* ============================================================
   11. RÉFÉRENCES DOM
   ============================================================ */

const academicYearFilter =
    document.getElementById(
        "academicYearFilter"
    );

const bankFilter =
    document.getElementById(
        "bankFilter"
    );

const facultyFilter =
    document.getElementById(
        "facultyFilter"
    );

const departmentFilter =
    document.getElementById(
        "departmentFilter"
    );

const programFilter =
    document.getElementById(
        "programFilter"
    );

const promotionFilter =
    document.getElementById(
        "promotionFilter"
    );

const semesterFilter =
    document.getElementById(
        "semesterFilter"
    );

const statusFilter =
    document.getElementById(
        "statusFilter"
    );

const paymentSearch =
    document.getElementById(
        "paymentSearch"
    );

const clearSearch =
    document.getElementById(
        "clearSearch"
    );

const resetFilters =
    document.getElementById(
        "resetFilters"
    );

const emptyResetButton =
    document.getElementById(
        "emptyResetButton"
    );

const paymentsTableBody =
    document.getElementById(
        "paymentsTableBody"
    );

const paymentsEmpty =
    document.getElementById(
        "paymentsEmpty"
    );

const visiblePaymentCount =
    document.getElementById(
        "visiblePaymentCount"
    );

const previousPage =
    document.getElementById(
        "previousPage"
    );

const nextPage =
    document.getElementById(
        "nextPage"
    );

const paginationPages =
    document.getElementById(
        "paginationPages"
    );

const showAllBanks =
    document.getElementById(
        "showAllBanks"
    );

const paymentStartDate =
    document.getElementById(
        "paymentStartDate"
    );

const paymentEndDate =
    document.getElementById(
        "paymentEndDate"
    );

const paymentPeriodError =
    document.getElementById(
        "paymentPeriodError"
    );

const paymentPeriodLabel =
    document.getElementById(
        "paymentPeriodLabel"
    );

const applyPaymentPeriod =
    document.getElementById(
        "applyPaymentPeriod"
    );

const clearPaymentPeriod =
    document.getElementById(
        "clearPaymentPeriod"
    );


/* ============================================================
   12. UTILITAIRES GÉNÉRAUX
   ============================================================ */

function escapeHtml(value) {

    const div =
        document.createElement("div");

    div.textContent =
        value == null
            ? ""
            : String(value);

    return div.innerHTML;
}


function normalizeText(value) {

    return String(
        value ?? ""
    )
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .trim();
}


function setText(
    id,
    value
) {

    const element =
        document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}


/* ============================================================
   13. FORMATAGE
   ============================================================ */

function formatMoney(value) {

    return new Intl.NumberFormat(
        "fr-FR",
        {
            style: "currency",
            currency: "USD",

            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    ).format(
        Number(value) || 0
    );
}


function formatDate(value) {

    if (!value) {
        return "—";
    }

    const date =
        new Date(
            `${value}T00:00:00`
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return value;
    }

    return new Intl.DateTimeFormat(
        "fr-FR",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }
    ).format(date);
}


/* ============================================================
   14. LIBELLÉS
   ============================================================ */

function getBankName(code) {

    return (
        BANKS[code]?.name ??
        code ??
        "—"
    );
}


function getFacultyName(code) {

    return (
        ACADEMIC_STRUCTURE[
            code
        ]?.name ??
        FACULTIES[code] ??
        code ??
        "—"
    );
}


function getDepartmentName(
    facultyCode,
    departmentCode
) {

    return (
        ACADEMIC_STRUCTURE[
            facultyCode
        ]?.departments?.[
            departmentCode
        ]?.name ??
        departmentCode ??
        "—"
    );
}


function getProgramName(
    facultyCode,
    departmentCode,
    programCode
) {

    return (
        ACADEMIC_STRUCTURE[
            facultyCode
        ]?.departments?.[
            departmentCode
        ]?.programs?.[
            programCode
        ]?.name ??
        programCode ??
        "—"
    );
}


function getPromotionName(code) {

    return (
        PROMOTIONS[code] ??
        code ??
        "—"
    );
}


function getSemesterName(code) {

    return (
        SEMESTERS[code] ??
        code ??
        "—"
    );
}


function getScenarioInfo(code) {

    return (
        CLAIM_SCENARIOS[code] ?? {
            label: code ?? "—",
            className: ""
        }
    );
}


/* ============================================================
   15. INITIALISATION DES FACULTÉS
   ============================================================ */

function populateFacultyFilter() {

    if (!facultyFilter) {
        return;
    }

    const currentValue =
        facultyFilter.value;

    facultyFilter.innerHTML =
        `
            <option value="">
                Toutes les facultés
            </option>
        `;

    Object.entries(
        ACADEMIC_STRUCTURE
    ).forEach(
        ([code, faculty]) => {

            const option =
                document.createElement(
                    "option"
                );

            option.value = code;

            option.textContent =
                faculty.name;

            facultyFilter.appendChild(
                option
            );
        }
    );

    if (
        currentValue &&
        ACADEMIC_STRUCTURE[
            currentValue
        ]
    ) {
        facultyFilter.value =
            currentValue;
    }
}


/* ============================================================
   16. INITIALISATION DES PROMOTIONS

   IMPORTANT :
   Promotion ne dépend PAS de la faculté,
   du département ou de la spécialisation.
   ============================================================ */

function populatePromotionFilter() {

    if (!promotionFilter) {
        return;
    }

    const currentValue =
        promotionFilter.value;

    promotionFilter.innerHTML =
        `
            <option value="">
                Toutes les promotions
            </option>
        `;

    Object.entries(
        PROMOTIONS
    ).forEach(
        ([code, name]) => {

            const option =
                document.createElement(
                    "option"
                );

            option.value = code;

            option.textContent =
                name;

            promotionFilter.appendChild(
                option
            );
        }
    );

    if (
        currentValue &&
        PROMOTIONS[currentValue]
    ) {
        promotionFilter.value =
            currentValue;
    }
}


/* ============================================================
   17. DÉPARTEMENTS

   Le département dépend de la faculté.

   Sans faculté :
       - filtre désactivé
       - aucune valeur sélectionnée
   ============================================================ */

function populateDepartmentFilter() {

    if (!departmentFilter) {
        return;
    }

    const facultyCode =
        facultyFilter?.value ?? "";

    departmentFilter.innerHTML =
        `
            <option value="">
                Tous les départements
            </option>
        `;

    if (!facultyCode) {

        departmentFilter.disabled =
            true;

        departmentFilter.value =
            "";

        populateProgramFilter();

        return;
    }

    const faculty =
        ACADEMIC_STRUCTURE[
            facultyCode
        ];

    if (!faculty) {

        departmentFilter.disabled =
            true;

        populateProgramFilter();

        return;
    }

    Object.entries(
        faculty.departments
    ).forEach(
        ([code, department]) => {

            const option =
                document.createElement(
                    "option"
                );

            option.value = code;

            option.textContent =
                department.name;

            departmentFilter
                .appendChild(option);
        }
    );

    departmentFilter.disabled =
        false;
}


/* ============================================================
   18. SPÉCIALISATIONS / FILIÈRES

   La spécialisation dépend :
       Faculté
           +
       Département

   Sans département :
       filtre désactivé.
   ============================================================ */

function populateProgramFilter() {

    if (!programFilter) {
        return;
    }

    const facultyCode =
        facultyFilter?.value ?? "";

    const departmentCode =
        departmentFilter?.value ?? "";

    programFilter.innerHTML =
        `
            <option value="">
                Toutes les spécialisations
            </option>
        `;

    if (
        !facultyCode ||
        !departmentCode
    ) {

        programFilter.disabled =
            true;

        programFilter.value =
            "";

        return;
    }

    const department =
        ACADEMIC_STRUCTURE[
            facultyCode
        ]?.departments?.[
            departmentCode
        ];

    if (!department) {

        programFilter.disabled =
            true;

        programFilter.value =
            "";

        return;
    }

    Object.entries(
        department.programs
    ).forEach(
        ([code, program]) => {

            const option =
                document.createElement(
                    "option"
                );

            option.value = code;

            option.textContent =
                program.name;

            programFilter
                .appendChild(option);
        }
    );

    programFilter.disabled =
        false;
}


/* ============================================================
   19. INITIALISATION DE LA STRUCTURE ACADÉMIQUE
   ============================================================ */

function initializeAcademicFilters() {

    populateFacultyFilter();

    populatePromotionFilter();


    /*
     * Au chargement :
     *
     * Département désactivé tant qu'aucune
     * faculté n'est sélectionnée.
     */

    if (departmentFilter) {

        departmentFilter.disabled =
            !facultyFilter?.value;
    }


    /*
     * Spécialisation désactivée tant qu'aucun
     * département n'est sélectionné.
     */

    if (programFilter) {

        programFilter.disabled =
            !departmentFilter?.value;
    }


    /*
     * Faculté
     *     ↓
     * Département
     *     ↓
     * Spécialisation
     */

    facultyFilter?.addEventListener(
        "change",
        () => {

            if (departmentFilter) {
                departmentFilter.value =
                    "";
            }

            if (programFilter) {
                programFilter.value =
                    "";
            }

            populateDepartmentFilter();

            state.currentPage = 1;

            renderPayments();
        }
    );


    departmentFilter?.addEventListener(
        "change",
        () => {

            if (programFilter) {
                programFilter.value =
                    "";
            }

            populateProgramFilter();

            state.currentPage = 1;

            renderPayments();
        }
    );


    programFilter?.addEventListener(
        "change",
        () => {

            state.currentPage = 1;

            renderPayments();
        }
    );
}


/* ============================================================
   20. RECHERCHE
   ============================================================ */

function matchesSearch(
    claim,
    searchValue
) {

    if (!searchValue) {
        return true;
    }

    const searchableValues = [

        claim.student,

        claim.matricule,

        claim.reference,

        getBankName(
            claim.bank
        ),

        getFacultyName(
            claim.faculty
        ),

        claim.departmentName,

        claim.programName,

        getPromotionName(
            claim.promotion
        ),

        getSemesterName(
            claim.semester
        ),

        claim.academicYear,

        getScenarioInfo(
            claim.scenario
        ).label
    ];

    const haystack =
        normalizeText(
            searchableValues.join(" ")
        );

    return haystack.includes(
        searchValue
    );
}


/* ============================================================
   21. FILTRAGE DES DÉCLARATIONS
   ============================================================ */

function getFilteredClaims() {

    const academicYear =
        academicYearFilter?.value ?? "";

    const bank =
        bankFilter?.value ?? "";

    const faculty =
        facultyFilter?.value ?? "";

    const department =
        departmentFilter?.value ?? "";

    const program =
        programFilter?.value ?? "";

    const promotion =
        promotionFilter?.value ?? "";

    const semester =
        semesterFilter?.value ?? "";

    const status =
        statusFilter?.value ?? "";

    const search =
        normalizeText(
            paymentSearch?.value ?? ""
        );


    return paymentClaims
        .filter(claim => {

            /*
             * Année académique
             */

            if (
                academicYear &&
                claim.academicYear !==
                    academicYear
            ) {
                return false;
            }


            /*
             * Banque
             */

            if (
                bank &&
                claim.bank !== bank
            ) {
                return false;
            }


            /*
             * Faculté
             */

            if (
                faculty &&
                claim.faculty !== faculty
            ) {
                return false;
            }


            /*
             * Département
             */

            if (
                department &&
                claim.department !==
                    department
            ) {
                return false;
            }


            /*
             * Spécialisation / filière
             */

            if (
                program &&
                claim.program !== program
            ) {
                return false;
            }


            /*
             * Promotion
             *
             * Indépendante de la chaîne :
             * Faculté -> Département -> Programme
             */

            if (
                promotion &&
                claim.promotion !==
                    promotion
            ) {
                return false;
            }


            /*
             * Semestre
             */

            if (
                semester &&
                claim.semester !== semester
            ) {
                return false;
            }


            /*
             * Statut
             */

            if (
                status &&
                claim.scenario !== status
            ) {
                return false;
            }


            /*
             * Période
             */

            if (
                state.startDate &&
                claim.date <
                    state.startDate
            ) {
                return false;
            }


            if (
                state.endDate &&
                claim.date >
                    state.endDate
            ) {
                return false;
            }


            /*
             * Recherche globale
             */

            if (
                !matchesSearch(
                    claim,
                    search
                )
            ) {
                return false;
            }


            return true;
        })
        .sort(
            (a, b) => {

                const dateComparison =
                    b.date.localeCompare(
                        a.date
                    );

                if (dateComparison !== 0) {
                    return dateComparison;
                }

                return b.id - a.id;
            }
        );
}


/* ============================================================
   22. CRÉATION D'UNE LIGNE DU TABLEAU
   ============================================================ */

function createPaymentRow(claim) {

    const scenario =
        getScenarioInfo(
            claim.scenario
        );

    return `
        <tr>

            <td>

                <div class="student-cell">

                    <div class="student-avatar">
                        ${escapeHtml(
                            claim.student
                                .charAt(0)
                                .toUpperCase()
                        )}
                    </div>

                    <div class="student-info">

                        <strong>
                            ${escapeHtml(
                                claim.student
                            )}
                        </strong>

                    </div>

                </div>

            </td>


            <td>
                ${escapeHtml(
                    claim.matricule
                )}
            </td>


            <td>
                <strong>
                    ${escapeHtml(
                        claim.reference
                    )}
                </strong>
            </td>


            <td>
                ${escapeHtml(
                    getBankName(
                        claim.bank
                    )
                )}
            </td>


            <td>
                ${escapeHtml(
                    getFacultyName(
                        claim.faculty
                    )
                )}
            </td>


            <td>
                ${escapeHtml(
                    getPromotionName(
                        claim.promotion
                    )
                )}
            </td>


            <td class="amount">
                ${escapeHtml(
                    formatMoney(
                        claim.amount
                    )
                )}
            </td>


            <td>
                ${escapeHtml(
                    formatDate(
                        claim.date
                    )
                )}
            </td>


            <td>

                <span
                    class="payment-status ${escapeHtml(
                        scenario.className
                    )}"
                >
                    ${escapeHtml(
                        scenario.label
                    )}
                </span>

            </td>


            <td>

                <button
                    type="button"
                    class="table-action payment-detail-button"
                    data-payment-id="${claim.id}"
                    title="Voir le détail"
                    aria-label="Voir le détail de la déclaration"
                >
                    <i class="bi bi-arrow-up-right"></i>
                </button>

            </td>

        </tr>
    `;
}
/* ============================================================
   23. RENDU DU TABLEAU
   ============================================================ */

function renderPayments() {

    const claims =
        getFilteredClaims();

    const total =
        claims.length;

    const totalPages =
        Math.max(
            1,
            Math.ceil(
                total /
                state.rowsPerPage
            )
        );

    if (
        state.currentPage >
        totalPages
    ) {
        state.currentPage =
            totalPages;
    }

    const startIndex =
        (
            state.currentPage - 1
        ) * state.rowsPerPage;

    const endIndex =
        Math.min(
            startIndex +
            state.rowsPerPage,
            total
        );

    const visibleClaims =
        claims.slice(
            startIndex,
            endIndex
        );


    /* --------------------------------------------------------
       TABLEAU
       -------------------------------------------------------- */

    if (paymentsTableBody) {

        paymentsTableBody.innerHTML =
            visibleClaims
                .map(createPaymentRow)
                .join("");
    }


    /* --------------------------------------------------------
       ÉTAT VIDE
       -------------------------------------------------------- */

    if (paymentsEmpty) {

        paymentsEmpty.hidden =
            total !== 0;
    }


    /* --------------------------------------------------------
       COMPTEUR
       -------------------------------------------------------- */

    if (visiblePaymentCount) {

        visiblePaymentCount.textContent =
            total;
    }


    /* --------------------------------------------------------
       INFORMATIONS PAGINATION
       -------------------------------------------------------- */

    setText(
        "paginationStart",
        total === 0
            ? 0
            : startIndex + 1
    );

    setText(
        "paginationEnd",
        total === 0
            ? 0
            : endIndex
    );

    setText(
        "paginationTotal",
        total
    );


    renderPagination(
        totalPages
    );

    bindPaymentDetailButtons();
}


/* ============================================================
   24. PAGINATION
   ============================================================ */

function renderPagination(
    totalPages
) {

    if (
        !paginationPages ||
        !previousPage ||
        !nextPage
    ) {
        return;
    }

    paginationPages.innerHTML = "";

    previousPage.disabled =
        state.currentPage <= 1;

    nextPage.disabled =
        state.currentPage >=
        totalPages;


    /*
     * Maximum de cinq numéros visibles.
     */

    let firstPage =
        Math.max(
            1,
            state.currentPage - 2
        );

    let lastPage =
        Math.min(
            totalPages,
            firstPage + 4
        );

    firstPage =
        Math.max(
            1,
            lastPage - 4
        );


    for (
        let page = firstPage;
        page <= lastPage;
        page += 1
    ) {

        const button =
            document.createElement(
                "button"
            );

        button.type = "button";

        button.textContent =
            page;

        if (
            page ===
            state.currentPage
        ) {
            button.classList.add(
                "active"
            );
        }

        button.addEventListener(
            "click",
            () => {

                state.currentPage =
                    page;

                renderPayments();
            }
        );

        paginationPages.appendChild(
            button
        );
    }
}


/* ============================================================
   25. KPI
   ============================================================ */

function renderKpis() {

    /*
     * Ces KPI sont désormais calculés côté serveur (voir
     * payments_data.kpi dans espace_finance.py), à partir des
     * mêmes sources que le tableau de bord et les rapports :
     *   - collectedAmount : somme des Payment (status=PAID) pour
     *     l'année académique sélectionnée.
     *   - anomalyCount : nombre de PaymentAnomaly encore OPEN pour
     *     cette année (get_pending_anomalies_count).
     *
     * Ils ne sont plus recalculés ici à partir de claim.scenario,
     * qui ne vaut "ANOMALY" que si claim.status == REJECTED — un
     * statut que la logique de rapprochement ne pose jamais
     * aujourd'hui, ce qui faisait que ce compteur ne reflétait
     * quasiment jamais les véritables anomalies.
     *
     * Le tableau (liste des déclarations) reste, lui, filtré et
     * recalculé côté client via getFilteredClaims(), puisqu'il
     * s'agit d'un affichage brut des PaymentClaim et non d'un KPI
     * agrégé.
     */

    const kpi = payments_data.kpi || {};

    const collectedAmount = Number(kpi.collectedAmount || 0);
    const anomalyCount = Number(kpi.anomalyCount || 0);
    const totalClaims = Number(kpi.totalClaims || 0);
    const approvedClaims = Number(kpi.approvedClaims || 0);
    const approvalRate = Number(kpi.approvalRate || 0);

    /*
     * Ces IDs correspondent aux cartes KPI
     * réellement présentes dans finance-payments.html.
     */

    setText(
        "totalCollected",
        formatMoney(
            collectedAmount
        )
    );

    setText(
        "totalCollectedInfo",
        "Paiements validés"
    );

    setText(
        "totalPayments",
        totalClaims
    );

    setText(
        "paidPayments",
        approvedClaims
    );

    setText(
        "paidRate",
        `${approvalRate.toFixed(1)} % des déclarations`
    );

    setText(
        "anomalyPayments",
        anomalyCount
    );
}



/* ============================================================
   26. STATISTIQUES BANCAIRES
   ============================================================ */

const BANK_CARD_PREFIXES = {
    RAWBANK: "rawbank",
    BOA_RDC: "boa",
    EQUITY_BCDC: "equity"
};


function renderBankStatistics() {

    const academicYear =
        academicYearFilter?.value ||
        CURRENT_ACADEMIC_YEAR;

    const claims =
        paymentClaims.filter(
            claim =>
                claim.academicYear ===
                academicYear
        );

    const totalAmount =
        claims.reduce(
            (sum, claim) =>
                sum +
                Number(
                    claim.amount
                ),
            0
        );


    Object.keys(
        BANKS
    ).forEach(bankCode => {

        const prefix =
            BANK_CARD_PREFIXES[
                bankCode
            ];

        if (!prefix) {
            return;
        }

        const bankClaims =
            claims.filter(
                claim =>
                    claim.bank ===
                    bankCode
            );

        const bankAmount =
            bankClaims.reduce(
                (sum, claim) =>
                    sum +
                    Number(
                        claim.amount
                    ),
                0
            );

        const percentage =
            totalAmount > 0
                ? (
                    bankAmount /
                    totalAmount
                ) * 100
                : 0;


        setText(
            `${prefix}Amount`,
            formatMoney(
                bankAmount
            )
        );

        setText(
            `${prefix}Count`,
            `${bankClaims.length} paiement(s)`
        );

        const progressElement =
            document.getElementById(
                `${prefix}Progress`
            );

        if (progressElement) {

            progressElement.style.width =
                `${percentage.toFixed(1)}%`;
        }
    });
}



/* ============================================================
   27. CARTES BANCAIRES
   ============================================================ */

function initializeBankCards() {

    const cards =
        document.querySelectorAll(
            ".bank-card[data-bank]"
        );

    cards.forEach(card => {

        card.addEventListener(
            "click",
            () => {

                const bank =
                    card.dataset.bank;

                if (!bankFilter) {
                    return;
                }


                /*
                 * Un second clic sur la banque active
                 * retire le filtre.
                 */

                bankFilter.value =
                    bankFilter.value === bank
                        ? ""
                        : bank;

                updateBankCardState();

                state.currentPage = 1;

                renderPayments();
            }
        );
    });


    showAllBanks?.addEventListener(
        "click",
        () => {

            if (bankFilter) {
                bankFilter.value = "";
            }

            updateBankCardState();

            state.currentPage = 1;

            renderPayments();
        }
    );
}


function updateBankCardState() {

    const selectedBank =
        bankFilter?.value ?? "";

    document
        .querySelectorAll(
            ".bank-card[data-bank]"
        )
        .forEach(card => {

            card.classList.toggle(
                "active",
                card.dataset.bank ===
                    selectedBank
            );
        });
}


/* ============================================================
   28. DÉTAIL D'UNE DÉCLARATION
   ============================================================ */

function bindPaymentDetailButtons() {

    document
        .querySelectorAll(
            ".payment-detail-button"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const id =
                        Number(
                            button.dataset
                                .paymentId
                        );

                    openPaymentDetail(id);
                }
            );
        });
}


function openPaymentDetail(id) {

    const claim =
        paymentClaims.find(
            item =>
                item.id === id
        );

    if (!claim) {
        return;
    }


    /* --------------------------------------------------------
       ÉTUDIANT
       -------------------------------------------------------- */

    setText(
        "detailStudent",
        claim.student
    );

    setText(
        "detailMatricule",
        claim.matricule
    );

    setText(
        "detailFaculty",
        getFacultyName(
            claim.faculty
        )
    );

    setText(
        "detailDepartment",
        claim.departmentName ||
        getDepartmentName(
            claim.faculty,
            claim.department
        )
    );

    setText(
        "detailProgram",
        claim.programName ||
        getProgramName(
            claim.faculty,
            claim.department,
            claim.program
        )
    );

    setText(
        "detailPromotion",
        getPromotionName(
            claim.promotion
        )
    );


    /* --------------------------------------------------------
       DÉCLARATION
       -------------------------------------------------------- */

    setText(
        "detailReference",
        claim.reference
    );

    setText(
        "detailBank",
        getBankName(
            claim.bank
        )
    );

    setText(
        "detailAmount",
        formatMoney(
            claim.amount
        )
    );

    setText(
        "detailDate",
        formatDate(
            claim.date
        )
    );

    setText(
        "detailStatus",
        getScenarioInfo(
            claim.scenario
        ).label
    );

    setText(
        "detailSemester",
        getSemesterName(
            claim.semester
        )
    );

    setText(
        "detailYear",
        claim.academicYear
    );


    renderReconciliationDetail(
        claim
    );


    /* --------------------------------------------------------
       OUVERTURE BOOTSTRAP
       -------------------------------------------------------- */

    const modalElement =
        document.getElementById(
            "paymentDetailModal"
        );

    if (
        modalElement &&
        window.bootstrap
    ) {

        bootstrap.Modal
            .getOrCreateInstance(
                modalElement
            )
            .show();
    }
}


/* ============================================================
   29. ÉTAT DU RAPPROCHEMENT
   ============================================================ */

function renderReconciliationDetail(
    claim
) {

    const container =
        document.getElementById(
            "detailReconciliation"
        );

    if (!container) {
        return;
    }

    container.classList.remove(
        "pending",
        "anomaly"
    );


    if (
        claim.scenario ===
        "APPROVED"
    ) {

        container.innerHTML = `
            <i class="bi bi-check-circle"></i>

            <div>
                <strong>
                    Paiement rapproché
                </strong>

                <span>
                    La déclaration correspond à une
                    transaction bancaire et le paiement
                    a été validé.
                </span>
            </div>
        `;

        return;
    }


    if (
        claim.scenario ===
        "PENDING"
    ) {

        container.classList.add(
            "pending"
        );

        container.innerHTML = `
            <i class="bi bi-clock-history"></i>

            <div>
                <strong>
                    Rapprochement en attente
                </strong>

                <span>
                    Aucun paiement définitif n'a encore
                    été créé pour cette déclaration.
                </span>
            </div>
        `;

        return;
    }


    container.classList.add(
        "anomaly"
    );

    const anomaly =
        ANOMALY_TYPES[
            claim.anomalyType
        ] ??
        "Anomalie de rapprochement";

    container.innerHTML = `
        <i class="bi bi-exclamation-triangle"></i>

        <div>
            <strong>
                ${escapeHtml(anomaly)}
            </strong>

            <span>
                La déclaration nécessite une vérification
                avant validation du paiement.
            </span>
        </div>
    `;
}


/* ============================================================
   30. FILTRE PAR PÉRIODE
   ============================================================ */

function initializePeriodFilter() {

    applyPaymentPeriod?.addEventListener(
        "click",
        () => {

            const start =
                paymentStartDate?.value ??
                "";

            const end =
                paymentEndDate?.value ??
                "";


            if (
                start &&
                end &&
                start > end
            ) {

                if (paymentPeriodError) {

                    paymentPeriodError
                        .textContent =
                        "La date de début doit précéder la date de fin.";
                }

                return;
            }


            if (paymentPeriodError) {

                paymentPeriodError
                    .textContent = "";
            }


            state.startDate = start;

            state.endDate = end;

            state.currentPage = 1;


            updatePeriodLabel();

            renderPayments();


            const modal =
                document.getElementById(
                    "paymentPeriodModal"
                );

            if (
                modal &&
                window.bootstrap
            ) {

                bootstrap.Modal
                    .getInstance(modal)
                    ?.hide();
            }
        }
    );


    clearPaymentPeriod?.addEventListener(
        "click",
        () => {

            state.startDate = "";

            state.endDate = "";

            if (paymentStartDate) {
                paymentStartDate.value =
                    "";
            }

            if (paymentEndDate) {
                paymentEndDate.value =
                    "";
            }

            if (paymentPeriodError) {
                paymentPeriodError
                    .textContent = "";
            }

            state.currentPage = 1;

            updatePeriodLabel();

            renderPayments();
        }
    );
}


function updatePeriodLabel() {

    if (!paymentPeriodLabel) {
        return;
    }


    if (
        !state.startDate &&
        !state.endDate
    ) {

        paymentPeriodLabel.textContent =
            "Période";

        return;
    }


    if (
        state.startDate &&
        state.endDate
    ) {

        paymentPeriodLabel.textContent =
            `${formatDate(
                state.startDate
            )} – ${formatDate(
                state.endDate
            )}`;

        return;
    }


    if (state.startDate) {

        paymentPeriodLabel.textContent =
            `Depuis ${formatDate(
                state.startDate
            )}`;

        return;
    }


    paymentPeriodLabel.textContent =
        `Jusqu'au ${formatDate(
            state.endDate
        )}`;
}


/* ============================================================
   31. RESET COMPLET

   Faculté -> vide
   Département -> vide + désactivé
   Spécialisation -> vide + désactivée

   Promotion reste active.
   ============================================================ */

function resetAllFilters() {

    if (academicYearFilter) {

        academicYearFilter.value =
            CURRENT_ACADEMIC_YEAR;
    }

    if (bankFilter) {
        bankFilter.value = "";
    }

    if (facultyFilter) {
        facultyFilter.value = "";
    }

    if (departmentFilter) {

        departmentFilter.innerHTML = `
            <option value="">
                Tous les départements
            </option>
        `;

        departmentFilter.value = "";

        departmentFilter.disabled =
            true;
    }

    if (programFilter) {

        programFilter.innerHTML = `
            <option value="">
                Toutes les spécialisations
            </option>
        `;

        programFilter.value = "";

        programFilter.disabled =
            true;
    }

    if (promotionFilter) {

        promotionFilter.value = "";

        /*
         * Elle reste TOUJOURS utilisable.
         */
        promotionFilter.disabled =
            false;
    }

    if (semesterFilter) {
        semesterFilter.value = "";
    }

    if (statusFilter) {
        statusFilter.value = "";
    }

    if (paymentSearch) {
        paymentSearch.value = "";
    }

    if (paymentStartDate) {
        paymentStartDate.value = "";
    }

    if (paymentEndDate) {
        paymentEndDate.value = "";
    }

    if (paymentPeriodError) {
        paymentPeriodError.textContent =
            "";
    }


    state.startDate = "";

    state.endDate = "";

    state.currentPage = 1;


    updatePeriodLabel();

    updateBankCardState();

    renderAll();
}


/* ============================================================
   32. ÉVÉNEMENTS DES FILTRES SIMPLES
   ============================================================ */

function initializeSimpleFilters() {

    const filters = [

        academicYearFilter,

        bankFilter,

        promotionFilter,

        semesterFilter,

        statusFilter
    ];


    filters.forEach(filter => {

        filter?.addEventListener(
            "change",
            () => {

                if (
                    filter ===
                    academicYearFilter
                ) {

                    /*
                     * Les KPI (total encaissé, anomalies, etc.)
                     * sont calculés côté serveur pour une année
                     * académique donnée (voir payments_data.kpi).
                     * On recharge la page avec l'année choisie
                     * plutôt que de ré-agréger côté client, pour
                     * garantir que ces chiffres restent exacts et
                     * cohérents avec le tableau de bord et les
                     * rapports.
                     */

                    const params =
                        new URLSearchParams(
                            window.location.search
                        );

                    params.set(
                        "academic_year",
                        academicYearFilter.value
                    );

                    window.location.search =
                        params.toString();

                    return;
                }

                state.currentPage = 1;


                if (
                    filter ===
                    bankFilter
                ) {

                    updateBankCardState();
                }


                renderPayments();
            }
        );
    });


    paymentSearch?.addEventListener(
        "input",
        () => {

            state.currentPage = 1;

            renderPayments();
        }
    );


    clearSearch?.addEventListener(
        "click",
        () => {

            if (paymentSearch) {

                paymentSearch.value =
                    "";

                paymentSearch.focus();
            }

            state.currentPage = 1;

            renderPayments();
        }
    );


    resetFilters?.addEventListener(
        "click",
        resetAllFilters
    );


    emptyResetButton?.addEventListener(
        "click",
        resetAllFilters
    );
}


/* ============================================================
   33. ÉVÉNEMENTS PAGINATION
   ============================================================ */

function initializePagination() {

    previousPage?.addEventListener(
        "click",
        () => {

            if (
                state.currentPage > 1
            ) {

                state.currentPage -= 1;

                renderPayments();
            }
        }
    );


    nextPage?.addEventListener(
        "click",
        () => {

            const totalPages =
                Math.max(
                    1,
                    Math.ceil(
                        getFilteredClaims()
                            .length /
                        state.rowsPerPage
                    )
                );


            if (
                state.currentPage <
                totalPages
            ) {

                state.currentPage += 1;

                renderPayments();
            }
        }
    );
}


/* ============================================================
   34. EXPORT CSV
   ============================================================ */

function exportPaymentsCsv() {

    const claims =
        getFilteredClaims();

    if (!claims.length) {
        return;
    }


    const rows = [

        [
            "Étudiant",
            "Matricule",
            "Référence",
            "Banque",
            "Faculté",
            "Département",
            "Spécialisation",
            "Promotion",
            "Semestre",
            "Montant",
            "Date",
            "Année académique",
            "Statut"
        ],


        ...claims.map(claim => [

            claim.student,

            claim.matricule,

            claim.reference,

            getBankName(
                claim.bank
            ),

            getFacultyName(
                claim.faculty
            ),

            claim.departmentName ||
            getDepartmentName(
                claim.faculty,
                claim.department
            ),

            claim.programName ||
            getProgramName(
                claim.faculty,
                claim.department,
                claim.program
            ),

            getPromotionName(
                claim.promotion
            ),

            getSemesterName(
                claim.semester
            ),

            Number(
                claim.amount
            ).toFixed(2),

            claim.date,

            claim.academicYear,

            getScenarioInfo(
                claim.scenario
            ).label
        ])
    ];


    const csv =
        rows
            .map(row =>
                row
                    .map(value =>
                        `"${String(
                            value ?? ""
                        ).replace(
                            /"/g,
                            '""'
                        )}"`
                    )
                    .join(";")
            )
            .join("\n");


    const blob =
        new Blob(
            [
                "\uFEFF",
                csv
            ],
            {
                type:
                    "text/csv;charset=utf-8"
            }
        );


    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;

    link.download =
        `academicpay-paiements-${
            academicYearFilter?.value ||
            CURRENT_ACADEMIC_YEAR
        }.csv`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
}


/* ============================================================
   35. EXPORT PDF

   La page est statique.
   Le bouton utilise donc l'impression du navigateur.
   Le backend pourra ensuite produire un vrai PDF serveur.
   ============================================================ */

function exportPaymentsPdf() {

    window.print();
}


function initializeExports() {

    const csvButton =
        document.getElementById(
            "exportPaymentsCsv"
        );

    const pdfButton =
        document.getElementById(
            "exportPaymentsPdf"
        );


    csvButton?.addEventListener(
        "click",
        exportPaymentsCsv
    );

    pdfButton?.addEventListener(
        "click",
        exportPaymentsPdf
    );
}


/* ============================================================
   36. THÈME

   On ne recrée PAS la logique du thème ici.

   finance-dashboard.js / le JS global du projet reste
   responsable de data-theme et des boutons de bascule.

   Cela évite deux scripts concurrents.
   ============================================================ */


/* ============================================================
   37. RENDU GLOBAL
   ============================================================ */

function renderAll() {

    renderKpis();

    renderBankStatistics();

    renderPayments();
}


/* ============================================================
   38. INITIALISATION
   ============================================================ */

function initializePaymentsPage() {

    /*
     * 1. Référentiel académique
     */

    initializeAcademicFilters();


    /*
     * 2. Autres filtres
     */

    initializeSimpleFilters();


    /*
     * 3. Cartes bancaires
     */

    initializeBankCards();


    /*
     * 4. Pagination
     */

    initializePagination();


    /*
     * 5. Période
     */

    initializePeriodFilter();


    /*
     * 6. Exports
     */

    initializeExports();


    /*
     * 7. État initial
     */

    updateBankCardState();

    updatePeriodLabel();

    renderAll();
}


/* ============================================================
   39. DÉMARRAGE
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    initializePaymentsPage
);