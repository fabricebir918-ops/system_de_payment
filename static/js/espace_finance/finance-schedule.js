"use strict";

/* ============================================================
   ACADEMICPAY — FINANCE / ÉCHÉANCIER
   Version statique compatible avec finance-schedule.html

   Backend futur :
   Faculty
      -> Department
         -> Program
            -> AcademicProgram(level)
               -> FeeSchedule
                  -> FeeInstallment
============================================================ */


/* ============================================================
   1. CONFIGURATION
============================================================ */

const CURRENT_ACADEMIC_YEAR = "2026-2027";

const PROMOTIONS = [
    "BC0",
    "BAC1",
    "BAC2",
    "BAC3",
    "M1",
    "M2",
    "M3",
    "DOC4"
];


/* ============================================================
   2. RÉFÉRENTIEL ACADÉMIQUE
============================================================ */


/* ============================================================
   3. DONNÉES STATIQUES DE DÉMONSTRATION

   IMPORTANT :
   Les montants sont fictifs.
============================================================ */

/* ============================================================
   4. ÉTAT
============================================================ */

let editingScheduleId = null;
let detailScheduleId = null;
let deletingScheduleId = null;


/* ============================================================
   5. HELPERS DOM
============================================================ */

const $ = id =>
    document.getElementById(id);


function getBootstrapModal(id) {

    const element = $(id);

    if (
        !element ||
        typeof bootstrap === "undefined"
    ) {
        return null;
    }

    return bootstrap.Modal.getOrCreateInstance(
        element
    );
}

function getCSRFToken() {
    const cookieValue = document.cookie
        .split('; ')
        .find(row => row.startsWith('csrftoken='))
        ?.split('=')[1];
    return cookieValue || '';
}


/* ============================================================
   6. UTILITAIRES
============================================================ */

function normalizeText(value) {

    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}


function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function formatCurrency(value) {

    const number =
        Number(value || 0);

    return new Intl.NumberFormat(
        "fr-FR",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    ).format(number) + " $";
}


function formatDate(value) {

    if (!value) {
        return "—";
    }

    const parts =
        value.split("-");

    if (parts.length !== 3) {
        return value;
    }

    const date =
        new Date(
            Number(parts[0]),
            Number(parts[1]) - 1,
            Number(parts[2])
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
            month: "short",
            year: "numeric"
        }
    ).format(date);
}


function dateFromISO(value) {

    if (!value) {
        return null;
    }

    const [year, month, day] =
        value
            .split("-")
            .map(Number);

    const date =
        new Date(
            year,
            month - 1,
            day
        );

    date.setHours(
        0,
        0,
        0,
        0
    );

    return date;
}


function nextId() {

    if (!schedules.length) {
        return 1;
    }

    return (
        Math.max(
            ...schedules.map(
                schedule =>
                    Number(schedule.id)
            )
        ) + 1
    );
}


/* ============================================================
   7. RÉFÉRENTIEL — RECHERCHE
============================================================ */

function getFaculty(code) {

    return (
        UCB_ACADEMIC_STRUCTURE.find(
            faculty =>
                faculty.code === code
        ) || null
    );
}


function getDepartment(
    facultyCode,
    departmentCode
) {

    const faculty =
        getFaculty(facultyCode);

    if (!faculty) {
        return null;
    }

    return (
        faculty.departments.find(
            department =>
                department.code ===
                departmentCode
        ) || null
    );
}


function getProgram(
    facultyCode,
    departmentCode,
    programCode
) {

    const department =
        getDepartment(
            facultyCode,
            departmentCode
        );

    if (!department) {
        return null;
    }

    return (
        department.programs.find(
            program =>
                program.code ===
                programCode
        ) || null
    );
}


function getSchedule(id) {

    return (
        schedules.find(
            schedule =>
                Number(schedule.id) ===
                Number(id)
        ) || null
    );
}


function getScheduleLabels(schedule) {

    const faculty =
        getFaculty(
            schedule.facultyCode
        );

    const department =
        getDepartment(
            schedule.facultyCode,
            schedule.departmentCode
        );

    const program =
        getProgram(
            schedule.facultyCode,
            schedule.departmentCode,
            schedule.programCode
        );

    return {

        faculty:
            faculty?.name || "—",

        department:
            department?.name || "—",

        program:
            program?.name || "—"
    };
}


/* ============================================================
   8. OPTIONS SELECT
============================================================ */

function resetSelect(
    select,
    placeholder
) {

    if (!select) {
        return;
    }

    select.innerHTML = "";

    const option =
        document.createElement(
            "option"
        );

    option.value = "";
    option.textContent =
        placeholder;

    select.appendChild(option);
}


function appendOptions(
    select,
    items
) {

    if (!select) {
        return;
    }

    items.forEach(
        item => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                item.code;

            option.textContent =
                item.name;

            select.appendChild(
                option
            );
        }
    );
}


function appendPromotionOptions(
    select,
    promotions
) {

    if (!select) {
        return;
    }

    promotions.forEach(
        promotion => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                promotion;

            option.textContent =
                promotion;

            select.appendChild(
                option
            );
        }
    );
}


/* ============================================================
   9. INITIALISATION DES FACULTÉS
============================================================ */

function initializeFacultySelects() {

    const filter =
        $("facultyFilter");

    const modal =
        $("scheduleFaculty");


    resetSelect(
        filter,
        "Toutes les facultés"
    );

    appendOptions(
        filter,
        UCB_ACADEMIC_STRUCTURE
    );


    resetSelect(
        modal,
        "Sélectionner une faculté"
    );

    appendOptions(
        modal,
        UCB_ACADEMIC_STRUCTURE
    );
}


/* ============================================================
   10. FILTRES — CASCADE
============================================================ */

function refreshDepartmentFilter(
    preserve = false
) {

    const facultyCode =
        $("facultyFilter")?.value ||
        "";

    const select =
        $("departmentFilter");

    if (!select) {
        return;
    }

    const previous =
        preserve
            ? select.value
            : "";


    resetSelect(
        select,
        "Tous les départements"
    );


    if (!facultyCode) {

        select.disabled =
            true;

        return;
    }


    const faculty =
        getFaculty(
            facultyCode
        );

    if (!faculty) {

        select.disabled =
            true;

        return;
    }


    appendOptions(
        select,
        faculty.departments
    );

    select.disabled =
        false;


    if (
        previous &&
        faculty.departments.some(
            department =>
                department.code ===
                previous
        )
    ) {
        select.value =
            previous;
    }
}


function refreshProgramFilter(
    preserve = false
) {

    const facultyCode =
        $("facultyFilter")?.value ||
        "";

    const departmentCode =
        $("departmentFilter")?.value ||
        "";

    const select =
        $("programFilter");

    if (!select) {
        return;
    }

    const previous =
        preserve
            ? select.value
            : "";


    resetSelect(
        select,
        "Toutes les spécialisations"
    );


    if (
        !facultyCode ||
        !departmentCode
    ) {

        select.disabled =
            true;

        return;
    }


    const department =
        getDepartment(
            facultyCode,
            departmentCode
        );


    if (!department) {

        select.disabled =
            true;

        return;
    }


    appendOptions(
        select,
        department.programs
    );

    select.disabled =
        false;


    if (
        previous &&
        department.programs.some(
            program =>
                program.code ===
                previous
        )
    ) {
        select.value =
            previous;
    }
}


/* ============================================================
   11. MODALE — CASCADE ACADÉMIQUE
============================================================ */

function refreshModalDepartments(
    selectedValue = ""
) {

    const facultyCode =
        $("scheduleFaculty")?.value ||
        "";

    const departmentSelect =
        $("scheduleDepartment");

    const programSelect =
        $("scheduleProgram");

    const promotionSelect =
        $("schedulePromotion");


    resetSelect(
        departmentSelect,
        "Sélectionner un département"
    );

    resetSelect(
        programSelect,
        "Sélectionner une spécialisation"
    );

    resetSelect(
        promotionSelect,
        "Sélectionner une promotion"
    );


    if (programSelect) {
        programSelect.disabled =
            true;
    }

    if (promotionSelect) {
        promotionSelect.disabled =
            true;
    }


    if (!facultyCode) {

        if (departmentSelect) {
            departmentSelect.disabled =
                true;
        }

        return;
    }


    const faculty =
        getFaculty(
            facultyCode
        );


    if (!faculty) {

        departmentSelect.disabled =
            true;

        return;
    }


    appendOptions(
        departmentSelect,
        faculty.departments
    );


    departmentSelect.disabled =
        false;


    if (
        selectedValue &&
        faculty.departments.some(
            department =>
                department.code ===
                selectedValue
        )
    ) {
        departmentSelect.value =
            selectedValue;
    }
}


function refreshModalPrograms(
    selectedValue = ""
) {

    const facultyCode =
        $("scheduleFaculty")?.value ||
        "";

    const departmentCode =
        $("scheduleDepartment")?.value ||
        "";

    const programSelect =
        $("scheduleProgram");

    const promotionSelect =
        $("schedulePromotion");


    resetSelect(
        programSelect,
        "Sélectionner une spécialisation"
    );

    resetSelect(
        promotionSelect,
        "Sélectionner une promotion"
    );


    if (promotionSelect) {
        promotionSelect.disabled =
            true;
    }


    if (
        !facultyCode ||
        !departmentCode
    ) {

        programSelect.disabled =
            true;

        return;
    }


    const department =
        getDepartment(
            facultyCode,
            departmentCode
        );


    if (!department) {

        programSelect.disabled =
            true;

        return;
    }


    appendOptions(
        programSelect,
        department.programs
    );


    programSelect.disabled =
        false;


    if (
        selectedValue &&
        department.programs.some(
            program =>
                program.code ===
                selectedValue
        )
    ) {
        programSelect.value =
            selectedValue;
    }
}


function refreshModalPromotions(
    selectedValue = ""
) {

    const facultyCode =
        $("scheduleFaculty")?.value ||
        "";

    const departmentCode =
        $("scheduleDepartment")?.value ||
        "";

    const programCode =
        $("scheduleProgram")?.value ||
        "";

    const select =
        $("schedulePromotion");


    resetSelect(
        select,
        "Sélectionner une promotion"
    );


    if (
        !facultyCode ||
        !departmentCode ||
        !programCode
    ) {

        select.disabled =
            true;

        return;
    }


    const program =
        getProgram(
            facultyCode,
            departmentCode,
            programCode
        );


    if (!program) {

        select.disabled =
            true;

        return;
    }


    /*
     * Très important :
     *
     * les promotions viennent directement
     * du programme sélectionné.
     *
     * Donc :
     *
     * Génie Logiciel -> BAC3
     *
     * Médecine humaine
     * -> M1, M2, M3, DOC4
     */

    appendPromotionOptions(
        select,
        program.levels
    );


    select.disabled =
        false;


    if (
        selectedValue &&
        program.levels.includes(
            selectedValue
        )
    ) {
        select.value =
            selectedValue;
    }
}


/* ============================================================
   12. FILTRAGE DES ÉCHÉANCIERS
============================================================ */

function getFilteredSchedules() {

    const search =
        normalizeText(
            $("scheduleSearch")
                ?.value
        );

    const facultyCode =
        $("facultyFilter")?.value ||
        "";

    const departmentCode =
        $("departmentFilter")?.value ||
        "";

    const programCode =
        $("programFilter")?.value ||
        "";

    const promotion =
        $("promotionFilter")?.value ||
        "";

    const status =
        $("scheduleStatusFilter")
            ?.value ||
        "";

    const year =
        $("academicYearFilter")
            ?.value ||
        "";


    return schedules.filter(
        schedule => {

            const labels =
                getScheduleLabels(
                    schedule
                );


            if (
                facultyCode &&
                schedule.facultyCode !==
                    facultyCode
            ) {
                return false;
            }


            if (
                departmentCode &&
                schedule.departmentCode !==
                    departmentCode
            ) {
                return false;
            }


            if (
                programCode &&
                schedule.programCode !==
                    programCode
            ) {
                return false;
            }


            if (
                promotion &&
                schedule.promotion !==
                    promotion
            ) {
                return false;
            }


            if (
                status &&
                schedule.status !==
                    status
            ) {
                return false;
            }


            if (
                year &&
                schedule.academicYear !==
                    year
            ) {
                return false;
            }


            if (search) {

                const searchable =
                    normalizeText(
                        [
                            labels.faculty,
                            labels.department,
                            labels.program,
                            schedule.promotion,
                            schedule.academicYear,
                            schedule.status
                        ].join(" ")
                    );


                if (
                    !searchable.includes(
                        search
                    )
                ) {
                    return false;
                }
            }


            return true;
        }
    );
}


/* ============================================================
   13. PROCHAINE ÉCHÉANCE D'UN ÉCHÉANCIER
============================================================ */

function getNextInstallment(
    schedule,
    fromDate = new Date()
) {

    const reference =
        new Date(fromDate);

    reference.setHours(
        0,
        0,
        0,
        0
    );


    const future =
        schedule.installments
            .map(
                installment => ({
                    ...installment,

                    date:
                        dateFromISO(
                            installment.dueDate
                        )
                })
            )
            .filter(
                installment =>
                    installment.date &&
                    installment.date >=
                        reference
            )
            .sort(
                (a, b) =>
                    a.date - b.date
            );


    return future[0] || null;
}


/* ============================================================
   14. BADGE STATUT
============================================================ */

function statusClass(status) {

    if (status === "Actif") {
        return "active";
    }

    if (status === "Brouillon") {
        return "draft";
    }

    return "closed";
}


/* ============================================================
   15. RENDU DU TABLEAU
============================================================ */

function renderSchedules() {

    const tbody =
        $("scheduleTableBody");

    const empty =
        $("scheduleEmpty");

    const counter =
        $("scheduleResultCount");


    if (!tbody) {
        return;
    }


    const data =
        getFilteredSchedules();


    tbody.innerHTML =
        "";


    if (counter) {
        counter.textContent =
            data.length;
    }


    if (!data.length) {

        if (empty) {
            empty.hidden =
                false;
        }

        return;
    }


    if (empty) {
        empty.hidden =
            true;
    }


    data.forEach(
        schedule => {

            const labels =
                getScheduleLabels(
                    schedule
                );

            const next =
                getNextInstallment(
                    schedule
                );


            const installmentsHtml =
                schedule.installments
                    .map(
                        installment => `
                            <div class="schedule-installment-mini">
                                <strong>
                                    ${escapeHtml(
                                        formatCurrency(
                                            installment.amount
                                        )
                                    )}
                                </strong>

                                <span>
                                    ${escapeHtml(
                                        formatDate(
                                            installment.dueDate
                                        )
                                    )}
                                </span>
                            </div>
                        `
                    )
                    .join("");


            const row =
                document.createElement(
                    "tr"
                );


            row.dataset.id =
                schedule.id;

            row.dataset.status =
                schedule.status;


            row.innerHTML = `

                <td class="schedule-faculty-cell">
                    <strong>
                        ${escapeHtml(
                            labels.faculty
                        )}
                    </strong>
                </td>

                <td class="schedule-department-cell">
                    ${escapeHtml(
                        labels.department
                    )}
                </td>

                <td class="schedule-program-cell">
                    ${escapeHtml(
                        labels.program
                    )}
                </td>

                <td>
                    <span class="schedule-promotion">
                        ${escapeHtml(
                            schedule.promotion
                        )}
                    </span>
                </td>

                <td>
                    <span class="schedule-academic-year">
                        ${escapeHtml(
                            schedule.academicYear
                        )}
                    </span>
                </td>

                <td>
                    <strong>
                        ${escapeHtml(
                            formatCurrency(
                                schedule.totalAmount
                            )
                        )}
                    </strong>
                </td>

                <td>
                    <div class="schedule-installments-mini">
                        ${installmentsHtml}
                    </div>
                </td>

                <td>
                    ${
                        next
                            ? `
                                <span class="schedule-deadline-indicator upcoming">
                                    ${escapeHtml(
                                        formatDate(
                                            next.dueDate
                                        )
                                    )}
                                </span>
                            `
                            : "—"
                    }
                </td>

                <td>
                    <span
                        class="schedule-status ${statusClass(
                            schedule.status
                        )}"
                    >
                        ${escapeHtml(
                            schedule.status
                        )}
                    </span>
                </td>

                <td>
                    <div class="schedule-actions">

                        <button
                            type="button"
                            class="schedule-action-button"
                            data-action="view"
                            data-id="${schedule.id}"
                            title="Voir"
                            aria-label="Voir"
                        >
                            <i class="bi bi-eye"></i>
                        </button>

                        <button
                            type="button"
                            class="schedule-action-button"
                            data-action="edit"
                            data-id="${schedule.id}"
                            title="Modifier"
                            aria-label="Modifier"
                        >
                            <i class="bi bi-pencil"></i>
                        </button>

                        <button
                            type="button"
                            class="schedule-action-button danger"
                            data-action="delete"
                            data-id="${schedule.id}"
                            title="Supprimer"
                            aria-label="Supprimer"
                        >
                            <i class="bi bi-trash3"></i>
                        </button>

                    </div>
                </td>
            `;


            tbody.appendChild(
                row
            );
        }
    );


    updateKpis();
    updateNextDeadlineCard();
}


/* ============================================================
   16. KPI
============================================================ */

function updateKpis() {

    const year =
        $("academicYearFilter")
            ?.value ||
        CURRENT_ACADEMIC_YEAR;


    const yearSchedules =
        schedules.filter(
            schedule =>
                schedule.academicYear ===
                year
        );


    const active =
        yearSchedules.filter(
            schedule =>
                schedule.status ===
                "Actif"
        );


    const faculties =
        new Set(
            yearSchedules.map(
                schedule =>
                    schedule.facultyCode
            )
        );


    const programs =
        new Set(
            yearSchedules.map(
                schedule =>
                    `${schedule.programCode}:${schedule.promotion}`
            )
        );


    const today =
        new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );


    const limit =
        new Date(today);

    limit.setDate(
        limit.getDate() + 30
    );


    let upcoming =
        0;


    active.forEach(
        schedule => {

            schedule.installments.forEach(
                installment => {

                    const date =
                        dateFromISO(
                            installment.dueDate
                        );


                    if (
                        date &&
                        date >= today &&
                        date <= limit
                    ) {
                        upcoming++;
                    }
                }
            );
        }
    );


    if ($("activeScheduleCount")) {

        $("activeScheduleCount")
            .textContent =
            active.length;
    }


    if ($("coveredFacultyCount")) {

        $("coveredFacultyCount")
            .textContent =
            faculties.size;
    }


    if ($("coveredPromotionCount")) {

        $("coveredPromotionCount")
            .textContent =
            programs.size;
    }


    if ($("upcomingDeadlineCount")) {

        $("upcomingDeadlineCount")
            .textContent =
            upcoming;
    }
}


/* ============================================================
   17. CARTE PROCHAINE ÉCHÉANCE
============================================================ */

function updateNextDeadlineCard() {

    const year =
        $("academicYearFilter")
            ?.value ||
        CURRENT_ACADEMIC_YEAR;


    const today =
        new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );


    const candidates = [];


    schedules
        .filter(
            schedule =>
                schedule.status ===
                    "Actif" &&
                schedule.academicYear ===
                    year
        )
        .forEach(
            schedule => {

                schedule.installments.forEach(
                    installment => {

                        const date =
                            dateFromISO(
                                installment.dueDate
                            );


                        if (
                            date &&
                            date >= today
                        ) {

                            candidates.push({
                                schedule,
                                installment,
                                date
                            });
                        }
                    }
                );
            }
        );


    candidates.sort(
        (a, b) =>
            a.date - b.date
    );


    const next =
        candidates[0];


    if (!next) {

        if ($("nextDeadlineTitle")) {
            $("nextDeadlineTitle")
                .textContent =
                "—";
        }

        if ($("nextDeadlineScope")) {
            $("nextDeadlineScope")
                .textContent =
                "Aucune échéance future";
        }

        if ($("nextDeadlineDate")) {
            $("nextDeadlineDate")
                .textContent =
                "—";
        }

        if ($("nextDeadlineAmount")) {
            $("nextDeadlineAmount")
                .textContent =
                "—";
        }

        return;
    }


    const labels =
        getScheduleLabels(
            next.schedule
        );


    const cumulative =
        next.schedule.installments
            .filter(
                installment =>
                    dateFromISO(
                        installment.dueDate
                    ) <=
                    next.date
            )
            .reduce(
                (sum, installment) =>
                    sum +
                    Number(
                        installment.amount
                    ),
                0
            );


    if ($("nextDeadlineTitle")) {

        $("nextDeadlineTitle")
            .textContent =
            `${labels.program} — ${next.schedule.promotion}`;
    }


    if ($("nextDeadlineScope")) {

        $("nextDeadlineScope")
            .textContent =
            `${labels.faculty} · ${labels.department}`;
    }


    if ($("nextDeadlineDate")) {

        $("nextDeadlineDate")
            .textContent =
            formatDate(
                next.installment.dueDate
            );
    }


    if ($("nextDeadlineAmount")) {

        $("nextDeadlineAmount")
            .textContent =
            formatCurrency(
                cumulative
            );
    }
}


/* ============================================================
   18. RESET MODALE
============================================================ */

function resetScheduleModal() {

    editingScheduleId =
        null;


    if ($("editingScheduleId")) {
        $("editingScheduleId").value =
            "";
    }


    if ($("scheduleModalTitle")) {

        $("scheduleModalTitle")
            .textContent =
            "Nouvel échéancier";
    }


    if ($("scheduleYear")) {

        $("scheduleYear").value =
            $("academicYearFilter")
                ?.value ||
            CURRENT_ACADEMIC_YEAR;
    }


    if ($("scheduleFaculty")) {

        $("scheduleFaculty").value =
            "";
    }


    refreshModalDepartments();


    if ($("scheduleTotalAmount")) {
        $("scheduleTotalAmount").value =
            "";
    }


    if ($("scheduleStatus")) {
        $("scheduleStatus").value =
            "Actif";
    }


    if ($("installment1Amount")) {
        $("installment1Amount").value =
            "";
    }


    if ($("installment1DueDate")) {
        $("installment1DueDate").value =
            "";
    }


    if ($("installment2Amount")) {
        $("installment2Amount").value =
            "";
    }


    if ($("installment2DueDate")) {
        $("installment2DueDate").value =
            "";
    }


    clearFormError();

    updateFinancialSummary();


    if ($("saveScheduleButton")) {

        $("saveScheduleButton")
            .innerHTML = `
                <i class="bi bi-check-lg"></i>
                Enregistrer
            `;
    }
}


/* ============================================================
   19. RÉSUMÉ FINANCIER
============================================================ */

function updateFinancialSummary() {

    const annual =
        Number(
            $("scheduleTotalAmount")
                ?.value || 0
        );

    const installment1 =
        Number(
            $("installment1Amount")
                ?.value || 0
        );

    const installment2 =
        Number(
            $("installment2Amount")
                ?.value || 0
        );

    const totalInstallments =
        installment1 +
        installment2;

    const balance =
        annual -
        totalInstallments;


    if ($("summaryAnnualAmount")) {

        $("summaryAnnualAmount")
            .textContent =
            formatCurrency(
                annual
            );
    }


    if ($("summaryInstallmentAmount")) {

        $("summaryInstallmentAmount")
            .textContent =
            formatCurrency(
                totalInstallments
            );
    }


    if ($("summaryBalance")) {

        $("summaryBalance")
            .textContent =
            formatCurrency(
                balance
            );
    }


    const box =
        $("scheduleBalanceBox");


    if (box) {

        box.classList.toggle(
            "is-balanced",
            annual > 0 &&
            Math.abs(balance) <
                0.01
        );

        box.classList.toggle(
            "has-balance",
            Math.abs(balance) >=
                0.01
        );
    }
}


/* ============================================================
   20. ERREURS
============================================================ */

function showFormError(message) {

    const element =
        $("scheduleFormError");

    if (!element) {
        return;
    }

    element.textContent =
        message;

    element.style.display =
        "block";
}


function clearFormError() {

    const element =
        $("scheduleFormError");

    if (!element) {
        return;
    }

    element.textContent =
        "";

    element.style.display =
        "none";
}


/* ============================================================
   21. VALIDATION
============================================================ */

function validateScheduleForm() {

    clearFormError();


    const facultyCode =
        $("scheduleFaculty")?.value;

    const departmentCode =
        $("scheduleDepartment")?.value;

    const programCode =
        $("scheduleProgram")?.value;

    const promotion =
        $("schedulePromotion")?.value;

    const year =
        $("scheduleYear")?.value;

    const total =
        Number(
            $("scheduleTotalAmount")
                ?.value
        );

    const amount1 =
        Number(
            $("installment1Amount")
                ?.value
        );

    const amount2 =
        Number(
            $("installment2Amount")
                ?.value
        );

    const date1 =
        $("installment1DueDate")
            ?.value;

    const date2 =
        $("installment2DueDate")
            ?.value;


    if (!year) {

        showFormError(
            "Veuillez sélectionner l'année académique."
        );

        return false;
    }


    if (!facultyCode) {

        showFormError(
            "Veuillez sélectionner une faculté."
        );

        return false;
    }


    if (!departmentCode) {

        showFormError(
            "Veuillez sélectionner un département."
        );

        return false;
    }


    if (!programCode) {

        showFormError(
            "Veuillez sélectionner une spécialisation."
        );

        return false;
    }


    if (!promotion) {

        showFormError(
            "Veuillez sélectionner une promotion."
        );

        return false;
    }


    const program =
        getProgram(
            facultyCode,
            departmentCode,
            programCode
        );


    if (
        !program ||
        !program.levels.includes(
            promotion
        )
    ) {

        showFormError(
            "Cette promotion n'est pas compatible avec la spécialisation sélectionnée."
        );

        return false;
    }


    if (
        !Number.isFinite(total) ||
        total <= 0
    ) {

        showFormError(
            "Le montant annuel doit être supérieur à zéro."
        );

        return false;
    }


    if (
        !Number.isFinite(amount1) ||
        amount1 <= 0 ||
        !Number.isFinite(amount2) ||
        amount2 <= 0
    ) {

        showFormError(
            "Les montants des deux tranches doivent être supérieurs à zéro."
        );

        return false;
    }


    if (
        Math.abs(
            total -
            (amount1 + amount2)
        ) > 0.01
    ) {

        showFormError(
            "La somme des deux tranches doit être exactement égale au montant annuel."
        );

        return false;
    }


    if (
        !date1 ||
        !date2
    ) {

        showFormError(
            "Veuillez définir la date limite de chaque tranche."
        );

        return false;
    }


    if (
        dateFromISO(date2) <=
        dateFromISO(date1)
    ) {

        showFormError(
            "La deuxième échéance doit être postérieure à la première."
        );

        return false;
    }


    /*
     * Empêcher deux configurations identiques
     * pour programme + promotion + année.
     */

    const duplicate =
        schedules.some(
            schedule =>

                schedule.id !==
                    editingScheduleId &&

                schedule.academicYear ===
                    year &&

                schedule.programCode ===
                    programCode &&

                schedule.promotion ===
                    promotion
        );


    if (duplicate) {

        showFormError(
            "Un échéancier existe déjà pour cette spécialisation, cette promotion et cette année académique."
        );

        return false;
    }


    return true;
}


/* ============================================================
   22. CONSTRUIRE L'OBJET DU FORMULAIRE
============================================================ */

function getScheduleFromForm() {

    return {

        facultyCode:
            $("scheduleFaculty").value,

        departmentCode:
            $("scheduleDepartment").value,

        programCode:
            $("scheduleProgram").value,

        promotion:
            $("schedulePromotion").value,

        academicYear:
            $("scheduleYear").value,

        totalAmount:
            Number(
                $("scheduleTotalAmount")
                    .value
            ),

        status:
            $("scheduleStatus").value,

        installments: [

            {
                number: 1,

                amount:
                    Number(
                        $("installment1Amount")
                            .value
                    ),

                dueDate:
                    $("installment1DueDate")
                        .value
            },

            {
                number: 2,

                amount:
                    Number(
                        $("installment2Amount")
                            .value
                    ),

                dueDate:
                    $("installment2DueDate")
                        .value
            }
        ]
    };
}


/* ============================================================
   23. ENREGISTRER
============================================================ */

async function saveSchedule() {

    if (
        !validateScheduleForm()
    ) {
        return;
    }


    const data =
        getScheduleFromForm();


    try {
        const response = await fetch('/finance/schedule/save/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json();
            showFormError(errorData.error || 'Erreur lors de l\'enregistrement');
            return;
        }

        const savedSchedule = await response.json();

        if (editingScheduleId) {
            const index =
                schedules.findIndex(
                    schedule =>
                        schedule.id ===
                        editingScheduleId
                );

            if (index !== -1) {
                schedules[index] = savedSchedule;
            }

            showToast(
                "Échéancier modifié avec succès."
            );
        } else {
            schedules.push(savedSchedule);
            showToast(
                "Échéancier créé avec succès."
            );
        }

        getBootstrapModal(
            "scheduleModal"
        )?.hide();

        editingScheduleId =
            null;

        renderSchedules();

    } catch (error) {
        console.error('Save error:', error);
        showFormError('Erreur de connexion au serveur');
    }
}


/* ============================================================
   24. OUVRIR MODIFICATION
============================================================ */

function openEditSchedule(id) {

    const schedule =
        getSchedule(id);


    if (!schedule) {
        return;
    }


    editingScheduleId =
        schedule.id;


    if ($("editingScheduleId")) {

        $("editingScheduleId").value =
            schedule.id;
    }


    if ($("scheduleModalTitle")) {

        $("scheduleModalTitle")
            .textContent =
            "Modifier l'échéancier";
    }


    $("scheduleYear").value =
        schedule.academicYear;


    $("scheduleFaculty").value =
        schedule.facultyCode;


    refreshModalDepartments(
        schedule.departmentCode
    );


    $("scheduleDepartment").value =
        schedule.departmentCode;


    refreshModalPrograms(
        schedule.programCode
    );


    $("scheduleProgram").value =
        schedule.programCode;


    refreshModalPromotions(
        schedule.promotion
    );


    $("schedulePromotion").value =
        schedule.promotion;


    $("scheduleTotalAmount").value =
        schedule.totalAmount;


    $("scheduleStatus").value =
        schedule.status;


    const installment1 =
        schedule.installments[0];

    const installment2 =
        schedule.installments[1];


    $("installment1Amount").value =
        installment1?.amount ?? "";

    $("installment1DueDate").value =
        installment1?.dueDate ?? "";

    $("installment2Amount").value =
        installment2?.amount ?? "";

    $("installment2DueDate").value =
        installment2?.dueDate ?? "";


    clearFormError();

    updateFinancialSummary();


    if ($("saveScheduleButton")) {

        $("saveScheduleButton")
            .innerHTML = `
                <i class="bi bi-check-lg"></i>
                Enregistrer les modifications
            `;
    }


    getBootstrapModal(
        "scheduleModal"
    )?.show();
}


/* ============================================================
   25. VOIR DÉTAIL
============================================================ */

function openScheduleDetail(id) {

    const schedule =
        getSchedule(id);


    if (!schedule) {
        return;
    }


    detailScheduleId =
        schedule.id;


    const labels =
        getScheduleLabels(
            schedule
        );


    if ($("detailScheduleTitle")) {

        $("detailScheduleTitle")
            .textContent =
            `${labels.program} — ${schedule.promotion}`;
    }


    $("detailFaculty").textContent =
        labels.faculty;

    $("detailDepartment").textContent =
        labels.department;

    $("detailProgram").textContent =
        labels.program;

    $("detailPromotion").textContent =
        schedule.promotion;

    $("detailYear").textContent =
        schedule.academicYear;

    $("detailTotalAmount").textContent =
        formatCurrency(
            schedule.totalAmount
        );

    $("detailStatus").textContent =
        schedule.status;


    if ($("detailInstallmentCount")) {

        $("detailInstallmentCount")
            .textContent =
            `${schedule.installments.length} tranche(s)`;
    }


    const container =
        $("detailInstallments");


    if (container) {

        container.innerHTML =
            schedule.installments
                .map(
                    installment => `

                        <div class="schedule-detail-installment">

                            <div class="installment-number">
                                ${installment.number}
                            </div>

                            <div>
                                <strong>
                                    Tranche ${installment.number}
                                </strong>

                                <span>
                                    ${
                                        installment.number === 1
                                            ? "Première échéance"
                                            : "Deuxième échéance"
                                    }
                                </span>
                            </div>

                            <strong class="schedule-detail-installment-amount">
                                ${escapeHtml(
                                    formatCurrency(
                                        installment.amount
                                    )
                                )}
                            </strong>

                            <span class="schedule-detail-installment-date">
                                ${escapeHtml(
                                    formatDate(
                                        installment.dueDate
                                    )
                                )}
                            </span>

                        </div>
                    `
                )
                .join("");
    }


    getBootstrapModal(
        "scheduleDetailModal"
    )?.show();
}


/* ============================================================
   26. MODIFIER DEPUIS DÉTAIL
============================================================ */

function editFromDetail() {

    if (!detailScheduleId) {
        return;
    }


    const id =
        detailScheduleId;


    const detailModal =
        $("scheduleDetailModal");


    const instance =
        getBootstrapModal(
            "scheduleDetailModal"
        );


    /*
     * On attend que Bootstrap ait réellement
     * fermé la première modale avant d'ouvrir
     * celle de modification.
     */

    if (detailModal) {

        detailModal.addEventListener(
            "hidden.bs.modal",
            function handler() {

                detailModal.removeEventListener(
                    "hidden.bs.modal",
                    handler
                );

                openEditSchedule(id);
            }
        );


        instance?.hide();
    }

    else {

        openEditSchedule(id);
    }
}


/* ============================================================
   27. OUVRIR SUPPRESSION
============================================================ */

function openDeleteSchedule(id) {

    const schedule =
        getSchedule(id);


    if (!schedule) {
        return;
    }


    deletingScheduleId =
        schedule.id;


    if ($("deleteScheduleId")) {

        $("deleteScheduleId").value =
            schedule.id;
    }


    getBootstrapModal(
        "deleteScheduleModal"
    )?.show();
}


/* ============================================================
   28. CONFIRMER SUPPRESSION
============================================================ */

async function confirmDeleteSchedule() {

    if (!deletingScheduleId) {
        return;
    }

    try {
        const response = await fetch('/finance/schedule/delete/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({
                schedule_id: deletingScheduleId
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            showToast(errorData.error || 'Erreur lors de la suppression');
            return;
        }

        schedules =
            schedules.filter(
                schedule =>
                    schedule.id !==
                    deletingScheduleId
            );

        deletingScheduleId =
            null;

        if ($("deleteScheduleId")) {
            $("deleteScheduleId").value =
                "";
        }

        getBootstrapModal(
            "deleteScheduleModal"
        )?.hide();

        renderSchedules();

        showToast(
            "Échéancier supprimé."
        );

    } catch (error) {
        console.error('Delete error:', error);
        showToast('Erreur de connexion au serveur');
    }
}


/* ============================================================
   29. TOAST
============================================================ */

function showToast(message) {

    const toastElement =
        $("financeToast");

    const messageElement =
        $("toastMessage");


    if (messageElement) {
        messageElement.textContent =
            message;
    }


    if (
        toastElement &&
        typeof bootstrap !==
            "undefined"
    ) {

        bootstrap.Toast
            .getOrCreateInstance(
                toastElement
            )
            .show();
    }
}


/* ============================================================
   30. RÉINITIALISER FILTRES
============================================================ */

function resetFilters() {

    if ($("scheduleSearch")) {
        $("scheduleSearch").value =
            "";
    }


    if ($("facultyFilter")) {
        $("facultyFilter").value =
            "";
    }


    resetSelect(
        $("departmentFilter"),
        "Tous les départements"
    );

    $("departmentFilter").disabled =
        true;


    resetSelect(
        $("programFilter"),
        "Toutes les spécialisations"
    );

    $("programFilter").disabled =
        true;


    /*
     * Promotion reste toujours active.
     */

    if ($("promotionFilter")) {
        $("promotionFilter").value =
            "";
    }


    if ($("scheduleStatusFilter")) {
        $("scheduleStatusFilter").value =
            "";
    }


    renderSchedules();
}


/* ============================================================
   31. ACTIONS DU TABLEAU
============================================================ */

function handleTableClick(event) {

    const button =
        event.target.closest(
            "[data-action][data-id]"
        );


    if (!button) {
        return;
    }


    const id =
        Number(
            button.dataset.id
        );

    const action =
        button.dataset.action;


    if (action === "view") {

        openScheduleDetail(id);

        return;
    }


    if (action === "edit") {

        openEditSchedule(id);

        return;
    }


    if (action === "delete") {

        openDeleteSchedule(id);
    }
}


/* ============================================================
   32. ÉVÉNEMENTS
============================================================ */

function bindEvents() {

    /* --------------------------------------------------------
       ANNÉE ACADÉMIQUE
    -------------------------------------------------------- */

    $("academicYearFilter")
        ?.addEventListener(
            "change",
            () => {

                renderSchedules();

                updateKpis();

                updateNextDeadlineCard();
            }
        );


    /* --------------------------------------------------------
       RECHERCHE
    -------------------------------------------------------- */

    $("scheduleSearch")
        ?.addEventListener(
            "input",
            renderSchedules
        );


    $("clearScheduleSearch")
        ?.addEventListener(
            "click",
            () => {

                $("scheduleSearch").value =
                    "";

                $("scheduleSearch").focus();

                renderSchedules();
            }
        );


    /* --------------------------------------------------------
       FILTRE FACULTÉ
    -------------------------------------------------------- */

    $("facultyFilter")
        ?.addEventListener(
            "change",
            () => {

                refreshDepartmentFilter();

                refreshProgramFilter();

                renderSchedules();
            }
        );


    /* --------------------------------------------------------
       FILTRE DÉPARTEMENT
    -------------------------------------------------------- */

    $("departmentFilter")
        ?.addEventListener(
            "change",
            () => {

                refreshProgramFilter();

                renderSchedules();
            }
        );


    /* --------------------------------------------------------
       FILTRE SPÉCIALISATION
    -------------------------------------------------------- */

    $("programFilter")
        ?.addEventListener(
            "change",
            renderSchedules
        );


    /* --------------------------------------------------------
       FILTRE PROMOTION
       Toujours indépendant et toujours actif.
    -------------------------------------------------------- */

    $("promotionFilter")
        ?.addEventListener(
            "change",
            renderSchedules
        );


    /* --------------------------------------------------------
       FILTRE STATUT
    -------------------------------------------------------- */

    $("scheduleStatusFilter")
        ?.addEventListener(
            "change",
            renderSchedules
        );


    /* --------------------------------------------------------
       RESET FILTRES
    -------------------------------------------------------- */

    $("resetScheduleFilters")
        ?.addEventListener(
            "click",
            resetFilters
        );


    $("scheduleEmptyReset")
        ?.addEventListener(
            "click",
            resetFilters
        );


    /* --------------------------------------------------------
       NOUVEL ÉCHÉANCIER
    -------------------------------------------------------- */

    $("newScheduleButton")
        ?.addEventListener(
            "click",
            () => {

                /*
                 * Le HTML ouvre déjà la modale
                 * via data-bs-toggle.
                 *
                 * Ici nous préparons simplement
                 * le formulaire.
                 */

                resetScheduleModal();
            }
        );


    /* --------------------------------------------------------
       MODALE — FACULTÉ
    -------------------------------------------------------- */

    $("scheduleFaculty")
        ?.addEventListener(
            "change",
            () => {

                refreshModalDepartments();

                clearFormError();
            }
        );


    /* --------------------------------------------------------
       MODALE — DÉPARTEMENT
    -------------------------------------------------------- */

    $("scheduleDepartment")
        ?.addEventListener(
            "change",
            () => {

                refreshModalPrograms();

                clearFormError();
            }
        );


    /* --------------------------------------------------------
       MODALE — SPÉCIALISATION
    -------------------------------------------------------- */

    $("scheduleProgram")
        ?.addEventListener(
            "change",
            () => {

                refreshModalPromotions();

                clearFormError();
            }
        );


    /* --------------------------------------------------------
       MODALE — PROMOTION
    -------------------------------------------------------- */

    $("schedulePromotion")
        ?.addEventListener(
            "change",
            clearFormError
        );


    /* --------------------------------------------------------
       MONTANTS
    -------------------------------------------------------- */

    [
        "scheduleTotalAmount",
        "installment1Amount",
        "installment2Amount"
    ].forEach(
        id => {

            $(id)?.addEventListener(
                "input",
                () => {

                    updateFinancialSummary();

                    clearFormError();
                }
            );
        }
    );


    /* --------------------------------------------------------
       DATES
    -------------------------------------------------------- */

    [
        "installment1DueDate",
        "installment2DueDate"
    ].forEach(
        id => {

            $(id)?.addEventListener(
                "change",
                clearFormError
            );
        }
    );


    /* --------------------------------------------------------
       ENREGISTRER
    -------------------------------------------------------- */

    $("saveScheduleButton")
        ?.addEventListener(
            "click",
            saveSchedule
        );


    /* --------------------------------------------------------
       ACTIONS TABLEAU
    -------------------------------------------------------- */

    $("scheduleTableBody")
        ?.addEventListener(
            "click",
            handleTableClick
        );


    /* --------------------------------------------------------
       MODIFIER DEPUIS DÉTAIL
    -------------------------------------------------------- */

    $("editFromDetailButton")
        ?.addEventListener(
            "click",
            editFromDetail
        );


    /* --------------------------------------------------------
       SUPPRESSION
    -------------------------------------------------------- */

    $("confirmDeleteSchedule")
        ?.addEventListener(
            "click",
            confirmDeleteSchedule
        );


    /* --------------------------------------------------------
       NETTOYAGE APRÈS FERMETURE MODALE PRINCIPALE
    -------------------------------------------------------- */

    $("scheduleModal")
        ?.addEventListener(
            "hidden.bs.modal",
            () => {

                clearFormError();
            }
        );
}


/* ============================================================
   33. INITIALISATION PROMOTION FILTRE

   La promotion doit rester disponible même
   lorsqu'aucune faculté n'est sélectionnée.
============================================================ */

function initializePromotionFilter() {

    const select =
        $("promotionFilter");


    if (!select) {
        return;
    }


    resetSelect(
        select,
        "Toutes les promotions"
    );


    PROMOTIONS.forEach(
        promotion => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                promotion;


            switch (promotion) {

                case "M1":
                    option.textContent =
                        "Master 1";
                    break;

                case "M2":
                    option.textContent =
                        "Master 2";
                    break;

                case "M3":
                    option.textContent =
                        "Master 3";
                    break;

                case "DOC4":
                    option.textContent =
                        "Doctorat 4";
                    break;

                default:
                    option.textContent =
                        promotion;
            }


            select.appendChild(
                option
            );
        }
    );


    select.disabled =
        false;
}


/* ============================================================
   34. INITIALISATION DES SELECTS DÉPENDANTS
============================================================ */

function initializeDependentSelects() {

    resetSelect(
        $("departmentFilter"),
        "Tous les départements"
    );

    $("departmentFilter").disabled =
        true;


    resetSelect(
        $("programFilter"),
        "Toutes les spécialisations"
    );

    $("programFilter").disabled =
        true;


    resetSelect(
        $("scheduleDepartment"),
        "Sélectionner un département"
    );

    $("scheduleDepartment").disabled =
        true;


    resetSelect(
        $("scheduleProgram"),
        "Sélectionner une spécialisation"
    );

    $("scheduleProgram").disabled =
        true;


    resetSelect(
        $("schedulePromotion"),
        "Sélectionner une promotion"
    );

    $("schedulePromotion").disabled =
        true;
}


/* ============================================================
   35. INITIALISATION GÉNÉRALE
============================================================ */

function initializeSchedulePage() {

    initializeFacultySelects();

    initializePromotionFilter();

    initializeDependentSelects();

    bindEvents();

    updateFinancialSummary();

    renderSchedules();

    updateKpis();

    updateNextDeadlineCard();
}


/* ============================================================
   36. DÉMARRAGE
============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    initializeSchedulePage
);
/* ============================================================
   THÈME CLAIR / SOMBRE
============================================================ */

const THEME_KEY = "academicpay-finance-theme";

function initializeTheme() {

    const themeButton =
        document.getElementById("themeButton");

    if (!themeButton) {
        console.warn(
            'AcademicPay : bouton #themeButton introuvable.'
        );
        return;
    }


    /* --------------------------------------------------------
       Appliquer le thème sauvegardé
    -------------------------------------------------------- */

    const savedTheme =
        localStorage.getItem(THEME_KEY);


    if (savedTheme === "light") {

        document.body.classList.add(
            "light-theme"
        );

    } else {

        document.body.classList.remove(
            "light-theme"
        );
    }


    /* --------------------------------------------------------
       Mettre à jour l'icône
    -------------------------------------------------------- */

    function updateThemeIcon() {

        const isLight =
            document.body.classList.contains(
                "light-theme"
            );


        const icon =
            themeButton.querySelector("i");


        if (icon) {

            icon.className =
                isLight
                    ? "bi bi-moon"
                    : "bi bi-sun";
        }


        themeButton.title =
            isLight
                ? "Activer le mode sombre"
                : "Activer le mode clair";


        themeButton.setAttribute(
            "aria-label",
            themeButton.title
        );
    }


    updateThemeIcon();


    /* --------------------------------------------------------
       Changement du thème
    -------------------------------------------------------- */

    themeButton.addEventListener(
        "click",
        () => {

            const isLight =
                document.body.classList.toggle(
                    "light-theme"
                );


            localStorage.setItem(
                THEME_KEY,
                isLight
                    ? "light"
                    : "dark"
            );


            updateThemeIcon();
        }
    );
}


/* ============================================================
   INITIALISATION DU THÈME
============================================================ */

initializeTheme();