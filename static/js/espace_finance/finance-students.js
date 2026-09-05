/* ==========================================================
   ACADEMICPAY — FINANCE / SITUATIONS FINANCIÈRES
   finance-students.js

   Données réelles injectées par Django (voir espace_finance.py :
   finance_students / finance_student_detail) dans le bloc
   <script id="finance-students-bootstrap" type="application/json">
   du template finance-students.html.

   Référentiel académique :
   Faculty -> Department -> Program -> AcademicProgram(level)
========================================================== */

document.addEventListener("DOMContentLoaded", () => {

    "use strict";

    /* ======================================================
       1. OUTILS GÉNÉRAUX
    ====================================================== */

    const $ = id => document.getElementById(id);


    /* ======================================================
       2. DONNÉES INJECTÉES PAR LE SERVEUR
    ====================================================== */

    function readBootstrapData() {

        const node =
            $("finance-students-bootstrap");

        if (!node) {

            console.error(
                "AcademicPay : bloc de données " +
                "finance-students-bootstrap introuvable."
            );

            return {
                academicYear: "",
                referenceDate:
                    new Date().toISOString(),
                situations: [],
                academicStructure: {
                    faculties: [],
                    departments: [],
                    programs: [],
                    academicPrograms: []
                },
                banks: []
            };
        }

        try {
            return JSON.parse(node.textContent);
        } catch (error) {

            console.error(
                "AcademicPay : données bootstrap invalides.",
                error
            );

            return {
                academicYear: "",
                referenceDate:
                    new Date().toISOString(),
                situations: [],
                academicStructure: {
                    faculties: [],
                    departments: [],
                    programs: [],
                    academicPrograms: []
                },
                banks: []
            };
        }
    }


    const BOOTSTRAP = readBootstrapData();

    const REFERENCE_DATE =
        new Date(BOOTSTRAP.referenceDate);

    const FINANCE_STUDENTS_EXPORT_CSV_URL =
        document.body.dataset
            .exportCsvUrl || "";

    const FINANCE_STUDENTS_LIST_URL =
        document.body.dataset
            .studentsListUrl || "";

    // Gabarit d'URL contenant l'ID factice "0" à remplacer par
    // l'identifiant réel de l'étudiant (voir finance-students.html).
    const FINANCE_STUDENT_DETAIL_URL_TEMPLATE =
        document.body.dataset
            .studentDetailUrlTemplate || "";

    const OPEN_STUDENT_ID =
        (() => {

            const node =
                $("finance-students-open-id");

            const raw =
                node?.textContent?.trim();

            return raw ? Number(raw) : null;
        })();


    /* ======================================================
       3. RÉFÉRENTIEL ACADÉMIQUE (fourni par Django)
    ====================================================== */

    const faculties =
        BOOTSTRAP.academicStructure.faculties;

    const departments =
        BOOTSTRAP.academicStructure.departments;

    const programs =
        BOOTSTRAP.academicStructure.programs;

    const academicPrograms =
        BOOTSTRAP.academicStructure.academicPrograms;

    const banks =
        BOOTSTRAP.banks;


    /* ======================================================
       4. ORDRE DES NIVEAUX ACADÉMIQUES
    ====================================================== */

    const LEVEL_ORDER = [
        "PREPA",
        "BC0",
        "BAC0",
        "BAC1",
        "BAC2",
        "BAC3",
        "M1",
        "M2",
        "M3",
        "DOC4"
    ];

    function levelOrder(level) {

        const index =
            LEVEL_ORDER.indexOf(level);

        return index === -1
            ? LEVEL_ORDER.length
            : index;
    }


    /* ======================================================
       5. ADAPTATION DES SITUATIONS SERVEUR -> MODÈLE UI
    ====================================================== */

    function adaptSituation(raw) {

        const student = {
            id: raw.student.id,
            matricule: raw.student.matricule,
            fullNameValue: raw.student.fullName,
            lastName: raw.student.lastName,
            firstName: raw.student.firstName,
            avatarUrl: raw.student.avatarUrl
        };

        const payments =
            (raw.payments || []).map(payment => ({
                id: payment.id,
                amount: Number(payment.amount),
                validatedAt: payment.validatedAt,
                bank: payment.bankName
                    ? { name: payment.bankName }
                    : null,
                transaction: {
                    reference: payment.reference || null
                }
            }));

        const installments =
            (raw.installments || []).map(item => ({
                id: item.id,
                sequence: item.sequence,
                title: item.title,
                amount: Number(item.amount),
                dueDate: item.dueDate
            }));

        return {
            student,
            faculty: raw.faculty,
            department: raw.department,
            program: raw.program,
            academicProgram: raw.academicProgram,
            schedule: raw.schedule,
            installments,
            payments,
            annualAmount: Number(raw.annualAmount),
            requiredAmount: Number(raw.requiredAmount),
            paidAmount: Number(raw.paidAmount),
            annualRemaining: Number(raw.annualRemaining),
            overdueAmount: Number(raw.overdueAmount),
            status: raw.status
        };
    }


    /* ======================================================
       6. UTILITAIRES
    ====================================================== */

    function normalize(value) {

        return String(value ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }


    function escapeHTML(value) {

        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function money(value) {

        return new Intl.NumberFormat(
            "fr-FR",
            {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }
        ).format(Number(value) || 0) + " $";
    }


    function pdfMoney(value) {

        return new Intl.NumberFormat(
            "fr-FR",
            {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }
        ).format(Number(value) || 0) + " USD";
    }


    function formatDate(value) {

        if (!value) {
            return "—";
        }

        return new Intl.DateTimeFormat(
            "fr-FR",
            {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            }
        ).format(
            new Date(value + "T00:00:00")
        );
    }


    function setText(id, value) {

        const element = $(id);

        if (element) {
            element.textContent = value;
        }
    }


    function setWidth(id, value) {

        const element = $(id);

        if (element) {
            element.style.width = value;
        }
    }


    function getModal(id) {

        const element = $(id);

        if (
            !element ||
            typeof bootstrap === "undefined"
        ) {
            return null;
        }

        return bootstrap.Modal
            .getOrCreateInstance(element);
    }


    function showToast(message) {

        const toast = $("financeToast");
        const text = $("toastMessage");

        if (!toast || !text) {
            return;
        }

        text.textContent = message;

        if (
            typeof bootstrap !== "undefined"
        ) {
            bootstrap.Toast
                .getOrCreateInstance(
                    toast,
                    { delay: 2300 }
                )
                .show();
        }
    }


    function initials(student) {

        return (
            (student.firstName?.charAt(0) || "") +
            (student.lastName?.charAt(0) || "")
        ).toUpperCase();
    }


    function fullName(student) {

        if (student.fullNameValue) {
            return student.fullNameValue;
        }

        return [
            student.lastName,
            student.firstName
        ]
            .filter(Boolean)
            .join(" ");
    }


    /* ======================================================
       7. CHARGEMENT DES SITUATIONS
    ====================================================== */

    let situations =
        BOOTSTRAP.situations.map(adaptSituation);

    let filteredSituations = [];
    let currentStudentId = null;


    function calculateAllSituations() {
        // Les situations sont déjà calculées côté serveur ;
        // conservé pour compatibilité avec l'initialisation
        // existante plus bas dans le fichier.
    }


    /* ======================================================
       8. DOM
    ====================================================== */

    const academicYearFilter = $("academicYearFilter");
    const searchInput = $("studentSearch");

    const facultyFilter = $("facultyFilter");
    const departmentFilter = $("departmentFilter");
    const programFilter = $("programFilter");
    const academicProgramFilter = $("academicProgramFilter");

    const financialStatusFilter = $("financialStatusFilter");
    const bankFilter = $("bankFilter");

    const tableBody = $("studentsTableBody");
    const emptyState = $("studentsEmpty");


    /* ======================================================
       20. SELECT
    ====================================================== */

    function populateSelect(
        select,
        values,
        placeholder,
        getValue = item => item.id,
        getLabel = item => item.name
    ) {

        if (!select) {
            return;
        }

        select.innerHTML = "";

        const first =
            document.createElement("option");

        first.value = "";
        first.textContent = placeholder;

        select.appendChild(first);


        values.forEach(item => {

            const option =
                document.createElement("option");

            option.value =
                String(getValue(item));

            option.textContent =
                getLabel(item);

            select.appendChild(option);
        });
    }


    /* ======================================================
       21. ORDRE DES NIVEAUX
    ====================================================== */

    function levelOrder(level) {

        const order = [
            "BC0",
            "BAC1",
            "BAC2",
            "BAC3",
            "M1",
            "M2",
            "M3",
            "DOC4"
        ];

        const index =
            order.indexOf(level);

        return index === -1
            ? 999
            : index;
    }


    /* ======================================================
       22. CASCADE ACADÉMIQUE

       FACULTÉ
          ↓
       DÉPARTEMENT
          ↓
       PROGRAMME / SPÉCIALISATION
          ↓
       PARCOURS ACADÉMIQUE / NIVEAU
    ====================================================== */

    function initializeAcademicFilters() {

        populateSelect(
            facultyFilter,
            faculties,
            "Toutes les facultés"
        );

        resetDepartmentFilter();
    }


    function resetDepartmentFilter() {

        populateSelect(
            departmentFilter,
            [],
            "Tous les départements"
        );

        if (departmentFilter) {
            departmentFilter.disabled = true;
        }

        resetProgramFilter();
    }


    function resetProgramFilter() {

        populateSelect(
            programFilter,
            [],
            "Tous les programmes"
        );

        if (programFilter) {
            programFilter.disabled = true;
        }

        resetAcademicProgramFilter();
    }


    function resetAcademicProgramFilter() {

        populateSelect(
            academicProgramFilter,
            [],
            "Tous les parcours"
        );

        if (academicProgramFilter) {
            academicProgramFilter.disabled = true;
        }
    }


    function updateDepartmentFilter() {

        const facultyId =
            Number(facultyFilter?.value);

        if (!facultyId) {

            resetDepartmentFilter();
            return;
        }


        const values =
            departments.filter(
                department =>
                    department.facultyId ===
                    facultyId
            );


        populateSelect(
            departmentFilter,
            values,
            "Tous les départements"
        );


        if (departmentFilter) {
            departmentFilter.disabled = false;
        }


        resetProgramFilter();
    }


    function updateProgramFilter() {

        const departmentId =
            Number(
                departmentFilter?.value
            );


        if (!departmentId) {

            resetProgramFilter();
            return;
        }


        const values =
            programs.filter(
                program =>
                    program.departmentId ===
                    departmentId
            );


        populateSelect(
            programFilter,
            values,
            "Tous les programmes"
        );


        if (programFilter) {
            programFilter.disabled = false;
        }


        resetAcademicProgramFilter();
    }


    function updateAcademicProgramFilter() {

        const programId =
            Number(programFilter?.value);


        if (!programId) {

            resetAcademicProgramFilter();
            return;
        }


        const values =
            academicPrograms
                .filter(
                    academicProgram =>
                        academicProgram.programId ===
                        programId
                )
                .sort(
                    (a, b) =>
                        levelOrder(a.level) -
                        levelOrder(b.level)
                );


        populateSelect(
            academicProgramFilter,
            values,
            "Tous les parcours",
            item => item.id,
            item => item.levelDisplay || item.level
        );


        if (academicProgramFilter) {
            academicProgramFilter.disabled = false;
        }
    }


    /* ======================================================
       23. FILTRAGE
    ====================================================== */

    function applyFilters() {

        const academicYear =
            academicYearFilter?.value || "";

        const search =
            normalize(searchInput?.value);

        const facultyId =
            Number(facultyFilter?.value);

        const departmentId =
            Number(departmentFilter?.value);

        const programId =
            Number(programFilter?.value);

        const academicProgramId =
            Number(academicProgramFilter?.value);

        const status =
            financialStatusFilter?.value || "";

        const bank =
            bankFilter?.value || "";


        filteredSituations =
            situations.filter(situation => {

                if (
                    academicYear &&
                    situation.academicProgram
                        ?.academicYear !==
                        academicYear
                ) {
                    return false;
                }


                if (
                    facultyId &&
                    situation.faculty?.id !==
                        facultyId
                ) {
                    return false;
                }


                if (
                    departmentId &&
                    situation.department?.id !==
                        departmentId
                ) {
                    return false;
                }


                if (
                    programId &&
                    situation.program?.id !==
                        programId
                ) {
                    return false;
                }


                if (
                    academicProgramId &&
                    situation.academicProgram?.id !==
                        academicProgramId
                ) {
                    return false;
                }


                if (
                    status &&
                    situation.status !== status
                ) {
                    return false;
                }


                if (bank) {

                    const usesBank =
                        situation.payments.some(
                            payment =>
                                payment.bank?.name ===
                                bank
                        );

                    if (!usesBank) {
                        return false;
                    }
                }


                if (search) {

                    const references =
                        situation.payments
                            .map(
                                payment =>
                                    payment.transaction
                                        ?.reference
                            )
                            .join(" ");


                    const searchable =
                        normalize([
                            fullName(
                                situation.student
                            ),
                            situation.student
                                .matricule,
                            situation.faculty
                                ?.name,
                            situation.department
                                ?.name,
                            situation.program
                                ?.name,
                            situation.academicProgram
                                ?.level,
                            references
                        ].join(" "));


                    if (
                        !searchable.includes(search)
                    ) {
                        return false;
                    }
                }


                return true;
            });


        renderTable();
        updateKPIs();
        updateSummary();
    }


    /* ======================================================
       24. STATUT
    ====================================================== */

    function statusClass(status) {

        switch (status) {

            case "En ordre":
                return "up-to-date";

            case "En avance":
                return "ahead";

            case "En retard":
                return "late";

            case "Non configuré":
                return "unconfigured";

            default:
                return "";
        }
    }


    /* ======================================================
       25. TABLEAU
    ====================================================== */

    function renderTable() {

        if (!tableBody) {
            return;
        }


        tableBody.innerHTML = "";

        setText(
            "studentResultCount",
            filteredSituations.length
        );


        if (!filteredSituations.length) {

            if (emptyState) {
                emptyState.hidden = false;
            }

            return;
        }


        if (emptyState) {
            emptyState.hidden = true;
        }


        filteredSituations.forEach(
            situation => {

                const student =
                    situation.student;

                const row =
                    document.createElement("tr");


                row.innerHTML = `

                    <td>

                        <div class="student-cell">

                            <div class="student-cell-avatar">
                                ${escapeHTML(
                                    initials(student)
                                )}
                            </div>

                            <div class="student-cell-info">

                                <strong>
                                    ${escapeHTML(
                                        fullName(student)
                                    )}
                                </strong>

                                <span>
                                    ${escapeHTML(
                                        student.matricule
                                    )}
                                </span>

                            </div>

                        </div>

                    </td>


                    <td>

                        <div class="academic-program-cell">

                            <strong>
                                ${escapeHTML(
                                    situation.academicProgram
                                        ?.name || "—"
                                )}
                            </strong>

                            <span>
                                ${escapeHTML(
                                    [
                                        situation.faculty?.name,
                                        situation.department?.name,
                                        situation.program?.name
                                    ]
                                        .filter(Boolean)
                                        .join(" · ")
                                )}
                            </span>

                        </div>

                    </td>


                    <td>
                        <span class="student-money">
                            ${
                                situation.schedule
                                    ? money(
                                        situation.annualAmount
                                    )
                                    : "—"
                            }
                        </span>
                    </td>


                    <td>
                        <span class="student-money">
                            ${
                                situation.schedule
                                    ? money(
                                        situation.requiredAmount
                                    )
                                    : "—"
                            }
                        </span>
                    </td>


                    <td>
                        <span class="student-money paid">
                            ${money(
                                situation.paidAmount
                            )}
                        </span>
                    </td>


                    <td>
                        <span class="student-money">
                            ${
                                situation.schedule
                                    ? money(
                                        situation.annualRemaining
                                    )
                                    : "—"
                            }
                        </span>
                    </td>


                    <td>

                        <span class="
                            student-money
                            ${
                                situation.overdueAmount > 0
                                    ? "overdue"
                                    : "zero"
                            }
                        ">
                            ${
                                situation.schedule
                                    ? money(
                                        situation.overdueAmount
                                    )
                                    : "—"
                            }
                        </span>

                    </td>


                    <td>

                        <span class="
                            student-financial-status
                            ${statusClass(
                                situation.status
                            )}
                        ">
                            ${escapeHTML(
                                situation.status
                            )}
                        </span>

                    </td>


                    <td>

                        <div class="student-actions">

                            <button
                                type="button"
                                class="student-action-button view-student"
                                data-student-id="${student.id}"
                                title="Consulter"
                                aria-label="Consulter ${escapeHTML(
                                    fullName(student)
                                )}"
                            >
                                <i class="bi bi-eye"></i>
                            </button>

                        </div>

                    </td>
                `;


                tableBody.appendChild(row);
            }
        );
    }


    /* ======================================================
       26. KPI
    ====================================================== */

    function getYearSituations() {

        const year =
            academicYearFilter?.value || "";

        return situations.filter(
            situation =>
                !year ||
                situation.academicProgram
                    ?.academicYear === year
        );
    }


    function updateKPIs() {

        const yearSituations =
            getYearSituations();

        const configured =
            yearSituations.filter(
                situation =>
                    situation.schedule
            );

        const upToDate =
            configured.filter(
                situation =>
                    situation.status ===
                        "En ordre" ||
                    situation.status ===
                        "En avance"
            );

        const late =
            configured.filter(
                situation =>
                    situation.status ===
                    "En retard"
            );

        const overdue =
            late.reduce(
                (total, situation) =>
                    total +
                    situation.overdueAmount,
                0
            );

        const percentage =
            configured.length
                ? (
                    upToDate.length /
                    configured.length
                ) * 100
                : 0;


        setText(
            "totalStudents",
            yearSituations.length
        );

        setText(
            "studentsUpToDate",
            upToDate.length
        );

        setText(
            "studentsUpToDatePercentage",
            percentage.toFixed(1) +
            " % des étudiants configurés"
        );

        setText(
            "studentsLate",
            late.length
        );

        setText(
            "totalOverdueAmount",
            money(overdue)
        );
    }


    /* ======================================================
       27. SYNTHÈSE FINANCIÈRE
    ====================================================== */

    function updateSummary() {

        const year =
            academicYearFilter?.value || "";

        const configured =
            situations.filter(
                situation =>
                    situation.schedule &&
                    (
                        !year ||
                        situation.academicProgram
                            ?.academicYear === year
                    )
            );


        const expected =
            configured.reduce(
                (total, situation) =>
                    total +
                    situation.annualAmount,
                0
            );


        const paid =
            configured.reduce(
                (total, situation) =>
                    total +
                    situation.paidAmount,
                0
            );


        const remaining =
            configured.reduce(
                (total, situation) =>
                    total +
                    situation.annualRemaining,
                0
            );


        const required =
            configured.reduce(
                (total, situation) =>
                    total +
                    situation.requiredAmount,
                0
            );


        const missing =
            configured.reduce(
                (total, situation) =>
                    total +
                    situation.overdueAmount,
                0
            );


        const covered =
            configured.reduce(
                (total, situation) =>
                    total +
                    Math.min(
                        situation.paidAmount,
                        situation.requiredAmount
                    ),
                0
            );


        const collectionRate =
            expected > 0
                ? Math.min(
                    (paid / expected) * 100,
                    100
                )
                : 0;


        setText(
            "totalExpected",
            money(expected)
        );

        setText(
            "totalPaid",
            money(paid)
        );

        setText(
            "totalRemaining",
            money(remaining)
        );

        setText(
            "totalCurrentlyRequired",
            money(required)
        );

        setText(
            "requiredCovered",
            money(covered)
        );

        setText(
            "requiredMissing",
            money(missing)
        );

        setText(
            "collectionRate",
            collectionRate.toFixed(1) + " %"
        );

        setWidth(
            "collectionProgress",
            collectionRate + "%"
        );


        if (academicYearFilter) {

            const selected =
                academicYearFilter.options[
                    academicYearFilter.selectedIndex
                ];

            setText(
                "summaryPeriod",
                selected?.textContent?.trim() ||
                academicYearFilter.value
            );
        }
    }


    /* ======================================================
       28. FICHE ÉTUDIANT
    ====================================================== */

    function openStudentSituation(
        studentId,
        updateUrl = true
    ) {

        const situation =
            situations.find(
                item =>
                    item.student.id ===
                    studentId
            );

        if (!situation) {
            return;
        }


        currentStudentId = studentId;

        const student =
            situation.student;


        if (
            updateUrl &&
            typeof FINANCE_STUDENT_DETAIL_URL_TEMPLATE ===
                "string" &&
            FINANCE_STUDENT_DETAIL_URL_TEMPLATE
        ) {

            const detailUrl =
                FINANCE_STUDENT_DETAIL_URL_TEMPLATE
                    .replace(
                        "0",
                        studentId
                    ) +
                `?academic_year=${
                    encodeURIComponent(
                        academicYearFilter?.value || ""
                    )
                }`;

            window.history.pushState(
                { studentId },
                "",
                detailUrl
            );
        }


        setText(
            "studentModalTitle",
            fullName(student)
        );

        setText(
            "studentProfileAvatar",
            initials(student)
        );

        setText(
            "studentProfileName",
            fullName(student)
        );

        setText(
            "studentProfileMatricule",
            student.matricule
        );

        setText(
            "studentProfileFaculty",
            situation.faculty?.name || "—"
        );

        setText(
            "studentProfileDepartment",
            situation.department?.name || "—"
        );

        setText(
            "studentProfileProgram",
            situation.program?.name || "—"
        );

        setText(
            "studentProfileAcademicProgram",
            situation.academicProgram
                ? situation.academicProgram.level
                : "—"
        );

        setText(
            "studentProfileStatus",
            situation.status
        );

        setText(
            "studentProfileYear",
            situation.academicProgram
                ?.academicYear || "—"
        );


        setText(
            "studentAnnualAmount",
            situation.schedule
                ? money(
                    situation.annualAmount
                )
                : "—"
        );

        setText(
            "studentRequiredAmount",
            situation.schedule
                ? money(
                    situation.requiredAmount
                )
                : "—"
        );

        setText(
            "studentPaidAmount",
            money(situation.paidAmount)
        );

        setText(
            "studentRemainingAmount",
            situation.schedule
                ? money(
                    situation.annualRemaining
                )
                : "—"
        );

        setText(
            "studentOverdueAmount",
            situation.schedule
                ? money(
                    situation.overdueAmount
                )
                : "—"
        );


        const percentage =
            situation.annualAmount > 0
                ? Math.min(
                    (
                        situation.paidAmount /
                        situation.annualAmount
                    ) * 100,
                    100
                )
                : 0;


        setText(
            "studentPaymentPercentage",
            percentage.toFixed(1) + " %"
        );

        setText(
            "studentPaymentProgressText",
            money(situation.paidAmount) +
            " sur " +
            (
                situation.schedule
                    ? money(
                        situation.annualAmount
                    )
                    : "—"
            )
        );

        setWidth(
            "studentPaymentProgressBar",
            percentage + "%"
        );


        updateDeadlineState(situation);
        renderSchedule(situation);
        renderPayments(situation);
        renderAnalysis(situation);


        getModal(
            "studentFinancialModal"
        )?.show();
    }


    /* ======================================================
       28bis. NAVIGATION FICHE <-> LISTE (URL partageable)
    ====================================================== */

    $("studentFinancialModal")
        ?.addEventListener(
            "hidden.bs.modal",
            () => {

                if (
                    !currentStudentId ||
                    !FINANCE_STUDENTS_LIST_URL
                ) {
                    return;
                }

                currentStudentId = null;

                const url = new URL(
                    FINANCE_STUDENTS_LIST_URL,
                    window.location.origin
                );

                url.searchParams.set(
                    "academic_year",
                    academicYearFilter?.value || ""
                );

                window.history.pushState(
                    {},
                    "",
                    url.toString()
                );
            }
        );


    window.addEventListener(
        "popstate",
        () => {

            // Retour navigateur depuis une fiche étudiant :
            // si la modale est ouverte, on la referme simplement,
            // la page liste reste affichée en dessous.
            if (currentStudentId) {

                getModal(
                    "studentFinancialModal"
                )?.hide();
            }
        }
    );


    /* ======================================================
       29. ÉTAT ÉCHÉANCE
    ====================================================== */

    function updateDeadlineState(situation) {

        if (!situation.schedule) {

            setText(
                "studentDeadlineState",
                "Aucun échéancier configuré"
            );

            return;
        }


        if (
            situation.status ===
            "En retard"
        ) {

            setText(
                "studentDeadlineState",
                "Retard : " +
                money(
                    situation.overdueAmount
                )
            );

            return;
        }


        const next =
            situation.installments.find(
                installment => {

                    const date =
                        new Date(
                            installment.dueDate +
                            "T23:59:59"
                        );

                    return date > REFERENCE_DATE;
                }
            );


        if (next) {

            setText(
                "studentDeadlineState",
                "Prochaine échéance : " +
                formatDate(next.dueDate)
            );

            return;
        }


        setText(
            "studentDeadlineState",
            situation.annualRemaining === 0
                ? "Frais entièrement payés"
                : "Toutes les échéances sont atteintes"
        );
    }


    /* ======================================================
       30. TIMELINE ÉCHÉANCIER
    ====================================================== */

    function renderSchedule(situation) {

        const container =
            $("studentScheduleTimeline");

        if (!container) {
            return;
        }


        container.innerHTML = "";


        if (!situation.schedule) {

            container.innerHTML = `

                <div class="student-detail-empty">

                    <i class="bi bi-calendar-x"></i>

                    <strong>
                        Aucun échéancier
                    </strong>

                    <span>
                        Aucun échéancier actif n'est associé
                        à ce parcours académique.
                    </span>

                </div>
            `;

            return;
        }


        let cumulative = 0;


        situation.installments.forEach(
            installment => {

                cumulative +=
                    Number(installment.amount);


                const dueDate =
                    new Date(
                        installment.dueDate +
                        "T23:59:59"
                    );


                let state = "current";
                let icon = "bi-clock";


                if (
                    situation.paidAmount >=
                    cumulative
                ) {

                    state = "completed";
                    icon = "bi-check-lg";

                } else if (
                    dueDate <= REFERENCE_DATE
                ) {

                    state = "late";
                    icon =
                        "bi-exclamation-lg";
                }


                const item =
                    document.createElement("div");

                item.className =
                    `student-schedule-item ${state}`;


                item.innerHTML = `

                    <div class="student-schedule-marker">
                        <i class="bi ${icon}"></i>
                    </div>

                    <div class="student-schedule-content">

                        <div>

                            <span>
                                Tranche ${installment.sequence}
                            </span>

                            <strong>
                                ${formatDate(
                                    installment.dueDate
                                )}
                            </strong>

                            <small>
                                Cumul exigible :
                                ${money(cumulative)}
                            </small>

                        </div>

                        <strong class="student-schedule-amount">
                            ${money(
                                installment.amount
                            )}
                        </strong>

                    </div>
                `;


                container.appendChild(item);
            }
        );
    }


    /* ======================================================
       31. PAIEMENTS VALIDÉS
    ====================================================== */

    function renderPayments(situation) {

        const container =
            $("studentPaymentsList");

        if (!container) {
            return;
        }


        container.innerHTML = "";


        const values =
            [...situation.payments]
                .sort(
                    (a, b) =>
                        new Date(
                            b.validatedAt
                        ) -
                        new Date(
                            a.validatedAt
                        )
                );


        if (!values.length) {

            container.innerHTML = `

                <div class="student-detail-empty">

                    <i class="bi bi-receipt"></i>

                    <strong>
                        Aucun paiement validé
                    </strong>

                    <span>
                        Aucun paiement rapproché et validé
                        n'est enregistré.
                    </span>

                </div>
            `;

            return;
        }


        values.forEach(payment => {

            const item =
                document.createElement("div");

            item.className =
                "student-payment-item";


            item.innerHTML = `

                <div class="student-payment-bank">
                    <i class="bi bi-bank"></i>
                </div>

                <div class="student-payment-info">

                    <strong>
                        ${escapeHTML(
                            payment.bank?.name ||
                            "Banque"
                        )}
                    </strong>

                    <span>
                        ${formatDate(
                            payment.validatedAt
                        )}
                    </span>

                    <small>
                        ${escapeHTML(
                            payment.transaction
                                ?.reference || "—"
                        )}
                    </small>

                </div>

                <strong class="student-payment-value">
                    ${money(payment.amount)}
                </strong>
            `;


            container.appendChild(item);
        });
    }


    /* ======================================================
       32. ANALYSE FINANCIÈRE
    ====================================================== */

    function renderAnalysis(situation) {

        const box =
            $("studentFinancialAnalysis");

        if (!box) {
            return;
        }


        const icon =
            box.querySelector(
                ".student-analysis-icon i"
            );


        box.classList.remove(
            "late",
            "ahead",
            "unconfigured"
        );


        if (
            situation.status ===
            "Non configuré"
        ) {

            box.classList.add(
                "unconfigured"
            );

            if (icon) {
                icon.className =
                    "bi bi-exclamation-circle";
            }

            setText(
                "studentAnalysisTitle",
                "Échéancier non configuré"
            );

            setText(
                "studentAnalysisText",
                "Aucun échéancier actif ne correspond au parcours académique de cet étudiant."
            );

            return;
        }


        if (
            situation.status ===
            "En retard"
        ) {

            box.classList.add("late");

            if (icon) {
                icon.className =
                    "bi bi-exclamation-triangle";
            }

            setText(
                "studentAnalysisTitle",
                "Étudiant en retard de paiement"
            );

            setText(
                "studentAnalysisText",
                `${money(
                    situation.requiredAmount
                )} sont exigibles à ce jour. ` +
                `Les paiements validés représentent ${money(
                    situation.paidAmount
                )}. ` +
                `Le montant non couvert est de ${money(
                    situation.overdueAmount
                )}.`
            );

            return;
        }


        if (
            situation.status ===
            "En avance"
        ) {

            box.classList.add("ahead");

            if (icon) {
                icon.className =
                    "bi bi-arrow-up-circle";
            }


            const advance =
                Math.max(
                    situation.paidAmount -
                    situation.requiredAmount,
                    0
                );


            setText(
                "studentAnalysisTitle",
                "Étudiant en avance"
            );

            setText(
                "studentAnalysisText",
                `Le montant actuellement exigible est couvert. ` +
                `Une avance de ${money(
                    advance
                )} est disponible sur les prochaines tranches.`
            );

            return;
        }


        if (icon) {
            icon.className =
                "bi bi-check-circle";
        }


        setText(
            "studentAnalysisTitle",
            situation.annualRemaining === 0
                ? "Frais académiques entièrement payés"
                : "Étudiant en ordre à ce jour"
        );


        setText(
            "studentAnalysisText",
            situation.annualRemaining === 0
                ? "Tous les frais prévus par l'échéancier annuel ont été couverts."
                : `Le montant actuellement exigible est couvert. Le solde annuel restant est de ${money(
                    situation.annualRemaining
                )}.`
        );
    }


    /* ======================================================
       33. ÉVÉNEMENTS CASCADE
    ====================================================== */

    facultyFilter?.addEventListener(
        "change",
        () => {

            updateDepartmentFilter();
            applyFilters();
        }
    );


    departmentFilter?.addEventListener(
        "change",
        () => {

            updateProgramFilter();
            applyFilters();
        }
    );


    programFilter?.addEventListener(
        "change",
        () => {

            updateAcademicProgramFilter();
            applyFilters();
        }
    );


    academicProgramFilter?.addEventListener(
        "change",
        applyFilters
    );


    financialStatusFilter?.addEventListener(
        "change",
        applyFilters
    );


    bankFilter?.addEventListener(
        "change",
        applyFilters
    );


    searchInput?.addEventListener(
        "input",
        applyFilters
    );


    /* ======================================================
       34. ANNÉE ACADÉMIQUE

       Les montants (échéancier, exigible, paiements) sont
       calculés côté serveur pour l'année académique active.
       Changer d'année académique recharge donc la page avec
       le bon paramètre plutôt que de refiltrer côté client.
    ====================================================== */

    academicYearFilter?.addEventListener(
        "change",
        () => {

            const url = new URL(
                window.location.href
            );

            url.searchParams.set(
                "academic_year",
                academicYearFilter.value
            );

            window.location.href =
                url.toString();
        }
    );


    /* ======================================================
       35. RECHERCHE
    ====================================================== */

    $("clearStudentSearch")
        ?.addEventListener(
            "click",
            () => {

                if (!searchInput) {
                    return;
                }

                searchInput.value = "";

                applyFilters();

                searchInput.focus();
            }
        );


    /* ======================================================
       36. RÉINITIALISATION
    ====================================================== */

    function resetFilters() {

        if (searchInput) {
            searchInput.value = "";
        }

        if (facultyFilter) {
            facultyFilter.value = "";
        }

        if (financialStatusFilter) {
            financialStatusFilter.value = "";
        }

        if (bankFilter) {
            bankFilter.value = "";
        }

        resetDepartmentFilter();

        applyFilters();
    }


    $("resetStudentFilters")
        ?.addEventListener(
            "click",
            resetFilters
        );


    $("studentsEmptyReset")
        ?.addEventListener(
            "click",
            resetFilters
        );


    /* ======================================================
       37. ACTION VOIR
    ====================================================== */

    tableBody?.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".view-student"
                );

            if (!button) {
                return;
            }

            openStudentSituation(
                Number(
                    button.dataset.studentId
                )
            );
        }
    );


    /* ======================================================
       38. THÈME
    ====================================================== */

    const themeButton =
        $("themeButton");

    const savedTheme =
        localStorage.getItem(
            "academicpay-finance-theme"
        );


    if (savedTheme === "light") {

        document.body.classList.add(
            "light-theme"
        );
    }


    function updateThemeIcon() {

        const icon =
            themeButton?.querySelector("i");

        if (!icon) {
            return;
        }

        const light =
            document.body.classList
                .contains("light-theme");

        icon.className =
            light
                ? "bi bi-moon-stars"
                : "bi bi-sun";
    }


    updateThemeIcon();


    themeButton?.addEventListener(
        "click",
        () => {

            document.body.classList.toggle(
                "light-theme"
            );

            const light =
                document.body.classList
                    .contains("light-theme");

            localStorage.setItem(
                "academicpay-finance-theme",
                light
                    ? "light"
                    : "dark"
            );

            updateThemeIcon();
        }
    );


    /* ======================================================
       39. EXPORT GLOBAL
    ====================================================== */

    $("exportStudentsButton")
        ?.addEventListener(
            "click",
            () => {

                getModal(
                    "studentsExportModal"
                )?.show();
            }
        );


    $("confirmStudentsExport")
        ?.addEventListener(
            "click",
            () => {

                const format =
                    document.querySelector(
                        'input[name="studentExportFormat"]:checked'
                    )?.value || "csv";


                if (format === "csv") {

                    exportCSV();

                } else {

                    exportGlobalPDF();
                }
            }
        );


    /* ======================================================
       40. CSV (généré côté serveur, filtres actifs transmis
           en paramètres de requête)
    ====================================================== */

    function buildExportQueryParams() {

        const params = new URLSearchParams();

        params.set(
            "academic_year",
            academicYearFilter?.value || ""
        );

        if (facultyFilter?.value) {
            params.set(
                "faculty",
                facultyFilter.value
            );
        }

        if (departmentFilter?.value) {
            params.set(
                "department",
                departmentFilter.value
            );
        }

        if (programFilter?.value) {
            params.set(
                "program",
                programFilter.value
            );
        }

        if (academicProgramFilter?.value) {
            params.set(
                "academic_program",
                academicProgramFilter.value
            );
        }

        if (financialStatusFilter?.value) {
            params.set(
                "status",
                financialStatusFilter.value
            );
        }

        if (bankFilter?.value) {
            params.set(
                "bank",
                bankFilter.value
            );
        }

        if (searchInput?.value) {
            params.set(
                "q",
                searchInput.value
            );
        }

        return params;
    }


    function exportCSV() {

        if (!filteredSituations.length) {

            showToast(
                "Aucune donnée à exporter."
            );

            return;
        }


        const params =
            buildExportQueryParams();

        window.location.href =
            `${FINANCE_STUDENTS_EXPORT_CSV_URL}?${params.toString()}`;


        getModal(
            "studentsExportModal"
        )?.hide();


        showToast(
            "Export CSV généré."
        );
    }


    /* ======================================================
       41. JSPDF
    ====================================================== */

    function getJsPDF() {

        if (
            !window.jspdf ||
            !window.jspdf.jsPDF
        ) {

            showToast(
                "Le générateur PDF n'est pas disponible."
            );

            return null;
        }

        return window.jspdf.jsPDF;
    }


    /* ======================================================
       42. PDF GLOBAL
    ====================================================== */

    function exportGlobalPDF() {

        if (!filteredSituations.length) {

            showToast(
                "Aucune donnée à exporter."
            );

            return;
        }


        const JsPDF = getJsPDF();

        if (!JsPDF) {
            return;
        }


        const doc =
            new JsPDF({
                orientation: "landscape",
                unit: "mm",
                format: "a4"
            });


        if (
            typeof doc.autoTable !==
            "function"
        ) {

            showToast(
                "Le module de tableau PDF n'est pas disponible."
            );

            return;
        }


        doc.setFont(
            "helvetica",
            "bold"
        );

        doc.setFontSize(17);

        doc.text(
            "AcademicPay",
            14,
            15
        );


        doc.setFontSize(11);

        doc.text(
            "Situations financières des étudiants",
            14,
            23
        );


        doc.setFont(
            "helvetica",
            "normal"
        );

        doc.setFontSize(8);

        doc.text(
            `Année académique : ${
                academicYearFilter?.value ||
                "Toutes"
            }`,
            14,
            30
        );


        const body =
            filteredSituations.map(
                situation => [

                    situation.student
                        .matricule,

                    fullName(
                        situation.student
                    ),

                    situation.faculty
                        ?.name || "—",

                    situation.department
                        ?.name || "—",

                    situation.program
                        ?.name || "—",

                    situation.academicProgram
                        ?.level || "—",

                    situation.schedule
                        ? pdfMoney(
                            situation.annualAmount
                        )
                        : "N/C",

                    pdfMoney(
                        situation.paidAmount
                    ),

                    situation.schedule
                        ? pdfMoney(
                            situation.annualRemaining
                        )
                        : "N/C",

                    situation.status
                ]
            );


        doc.autoTable({

            startY: 37,

            head: [[
                "Matricule",
                "Étudiant",
                "Faculté",
                "Département",
                "Programme",
                "Niveau",
                "Frais",
                "Payé",
                "Solde",
                "Situation"
            ]],

            body,

            theme: "grid",

            styles: {
                fontSize: 5.8,
                cellPadding: 1.5
            },

            headStyles: {
                fontStyle: "bold"
            }
        });


        doc.save(
            `situations-financieres-${
                academicYearFilter?.value ||
                "toutes"
            }.pdf`
        );


        getModal(
            "studentsExportModal"
        )?.hide();


        showToast(
            "Rapport PDF généré."
        );
    }


    /* ======================================================
       43. PDF INDIVIDUEL
    ====================================================== */

    $("exportStudentStatement")
        ?.addEventListener(
            "click",
            () => {

                const situation =
                    situations.find(
                        item =>
                            item.student.id ===
                            currentStudentId
                    );

                if (situation) {
                    exportStudentPDF(
                        situation
                    );
                }
            }
        );


    function exportStudentPDF(situation) {

        const JsPDF = getJsPDF();

        if (!JsPDF) {
            return;
        }


        const doc =
            new JsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4"
            });


        if (
            typeof doc.autoTable !==
            "function"
        ) {

            showToast(
                "Le module PDF n'est pas disponible."
            );

            return;
        }


        const student =
            situation.student;


        doc.setFont(
            "helvetica",
            "bold"
        );

        doc.setFontSize(18);

        doc.text(
            "AcademicPay",
            14,
            17
        );


        doc.setFontSize(11);

        doc.text(
            "Situation financière de l'étudiant",
            14,
            25
        );


        doc.autoTable({

            startY: 33,

            theme: "grid",

            body: [

                [
                    "Étudiant",
                    fullName(student)
                ],

                [
                    "Matricule",
                    student.matricule
                ],

                [
                    "Faculté",
                    situation.faculty
                        ?.name || "—"
                ],

                [
                    "Département",
                    situation.department
                        ?.name || "—"
                ],

                [
                    "Programme",
                    situation.program
                        ?.name || "—"
                ],

                [
                    "Niveau",
                    situation.academicProgram
                        ?.level || "—"
                ],

                [
                    "Année académique",
                    situation.academicProgram
                        ?.academicYear || "—"
                ],

                [
                    "Situation",
                    situation.status
                ]
            ],

            columnStyles: {

                0: {
                    cellWidth: 48,
                    fontStyle: "bold"
                }
            },

            styles: {
                fontSize: 8,
                cellPadding: 2.3
            }
        });


        let y =
            doc.lastAutoTable.finalY + 9;


        doc.setFont(
            "helvetica",
            "bold"
        );

        doc.setFontSize(10);

        doc.text(
            "Synthèse financière",
            14,
            y
        );


        doc.autoTable({

            startY: y + 4,

            head: [[
                "Frais",
                "Exigible",
                "Payé",
                "Solde",
                "Retard"
            ]],

            body: [[

                situation.schedule
                    ? pdfMoney(
                        situation.annualAmount
                    )
                    : "N/C",

                situation.schedule
                    ? pdfMoney(
                        situation.requiredAmount
                    )
                    : "N/C",

                pdfMoney(
                    situation.paidAmount
                ),

                situation.schedule
                    ? pdfMoney(
                        situation.annualRemaining
                    )
                    : "N/C",

                situation.schedule
                    ? pdfMoney(
                        situation.overdueAmount
                    )
                    : "N/C"
            ]],

            theme: "grid",

            styles: {
                fontSize: 7.5,
                halign: "center"
            }
        });


        y =
            doc.lastAutoTable.finalY + 9;


        if (
            situation.installments.length
        ) {

            doc.setFont(
                "helvetica",
                "bold"
            );

            doc.setFontSize(10);

            doc.text(
                "Échéancier",
                14,
                y
            );


            doc.autoTable({

                startY: y + 4,

                head: [[
                    "Tranche",
                    "Échéance",
                    "Montant"
                ]],

                body:
                    situation.installments
                        .map(
                            installment => [

                                `Tranche ${
                                    installment.sequence
                                }`,

                                formatDate(
                                    installment.dueDate
                                ),

                                pdfMoney(
                                    installment.amount
                                )
                            ]
                        ),

                theme: "grid",

                styles: {
                    fontSize: 7.5
                }
            });


            y =
                doc.lastAutoTable.finalY + 9;
        }


        if (
            situation.payments.length
        ) {

            if (y > 245) {

                doc.addPage();
                y = 20;
            }


            doc.setFont(
                "helvetica",
                "bold"
            );

            doc.setFontSize(10);

            doc.text(
                "Paiements validés",
                14,
                y
            );


            doc.autoTable({

                startY: y + 4,

                head: [[
                    "Date",
                    "Banque",
                    "Référence",
                    "Montant"
                ]],

                body:
                    situation.payments
                        .map(
                            payment => [

                                formatDate(
                                    payment.validatedAt
                                ),

                                payment.bank
                                    ?.name || "—",

                                payment.transaction
                                    ?.reference || "—",

                                pdfMoney(
                                    payment.amount
                                )
                            ]
                        ),

                theme: "grid",

                styles: {
                    fontSize: 7
                }
            });
        }


        const safeMatricule =
            student.matricule
                .replaceAll("/", "-")
                .replaceAll("\\", "-");


        doc.save(
            `situation-financiere-${safeMatricule}.pdf`
        );


        showToast(
            "Situation financière PDF générée."
        );
    }


    /* ======================================================
       44. IMPRESSION
    ====================================================== */

    $("printStudentStatement")
        ?.addEventListener(
            "click",
            () => {

                if (!currentStudentId) {
                    return;
                }

                window.print();
            }
        );


    /* ======================================================
       45. INITIALISATION
    ====================================================== */

    initializeAcademicFilters();

    applyFilters();


    if (OPEN_STUDENT_ID) {

        openStudentSituation(
            OPEN_STUDENT_ID
        );
    }


    /* ======================================================
       46. VÉRIFICATION DÉVELOPPEMENT
    ====================================================== */

    console.info(
        `AcademicPay : ${faculties.length} facultés chargées, ` +
        `${situations.length} situations calculées.`
    );

});