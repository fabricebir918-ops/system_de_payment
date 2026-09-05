# ============================================================
# views/espace_finance.py  (extrait — module "Situations financières")
#
# Dépend des modèles :
#   Faculty, Department, Program, AcademicProgram, AcademicLevel,
#   User, Bank, PaymentClaim, Payment, FeeSchedule, FeeInstallment
#
# Remplace les données synthétiques de finance-students.js par des
# données réelles calculées côté serveur et injectées en JSON dans
# le template (pas d'appel fetch() supplémentaire).
# ============================================================

import csv
import json
from datetime import datetime, time

from django.contrib.auth.decorators import login_required, user_passes_test
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Prefetch
from django.http import HttpResponse, HttpResponseForbidden
from django.shortcuts import get_object_or_404, render
from django.utils import timezone

from .models import (
    AcademicLevel,
    AcademicProgram,
    Bank,
    Department,
    Faculty,
    FeeInstallment,
    FeeSchedule,
    Payment,
    PaymentClaim,
    Program,
    User,
)


# ============================================================
# ACCÈS
# ============================================================

def _is_finance_staff(user):
    return (
        user.is_authenticated
        and user.role == User.Role.STAFF
        and user.staff_role == User.StaffRole.FINANCIER
    )


finance_staff_required = user_passes_test(_is_finance_staff)


# ============================================================
# NIVEAUX ACADÉMIQUES — ordre d'affichage
# ============================================================

LEVEL_ORDER = [
    AcademicLevel.PREPARATOIRE,
    "BC0",
    AcademicLevel.BAC0,
    AcademicLevel.BAC1,
    AcademicLevel.BAC2,
    AcademicLevel.BAC3,
    AcademicLevel.M1,
    AcademicLevel.M2,
    AcademicLevel.M3,
    AcademicLevel.DOC4,
]


def _level_rank(level):
    try:
        return LEVEL_ORDER.index(level)
    except ValueError:
        return len(LEVEL_ORDER)


DEFAULT_ACADEMIC_YEAR = "2026-2027"

ACADEMIC_YEAR_CHOICES = [
    "2026-2027",
    "2025-2026",
    "2024-2025",
    "2023-2024",
]


def _safe_json(data):
    """
    Sérialise en JSON pour injection directe dans un tag <script>.
    Échappe les séquences "</" pour éviter toute fermeture prématurée
    du tag si une valeur textuelle (nom, référence...) en contient.
    """
    return json.dumps(data, cls=DjangoJSONEncoder).replace("</", "<\\/")


# ============================================================
# CALCUL DE LA SITUATION FINANCIÈRE D'UN ÉTUDIANT
# ============================================================

def _build_reference_datetime():
    """
    Instant de référence pour déterminer ce qui est "exigible à ce
    jour". On utilise l'heure actuelle du serveur (fin de journée)
    plutôt qu'une date figée, contrairement au prototype JS.
    """
    now = timezone.localtime()
    return timezone.make_aware(
        datetime.combine(now.date(), time(23, 59, 59))
    ) if timezone.is_naive(now) else now


def get_student_payments(student, academic_year=None, prefetched_claims=None):
    """
    Retourne les paiements validés (claim approuvé + transaction
    vérifiée) d'un étudiant, triés du plus récent au plus ancien.
    """
    qs = (
        Payment.objects.filter(
            student=student,
            status=Payment.Status.PAID,
        )
        .select_related(
            "claim",
            "claim__bank",
            "claim__bank_transaction",
            "claim__bank_transaction__bank_account",
            "claim__bank_transaction__bank_account__bank",
        )
        .order_by("-payment_date")
    )

    if academic_year:
        qs = qs.filter(academic_year=academic_year)

    return list(qs)


def get_fee_schedule(academic_program, academic_year):
    if not academic_program:
        return None

    return (
        FeeSchedule.objects.filter(
            academic_program=academic_program,
            academic_year=academic_year,
            status=FeeSchedule.Status.ACTIF,
        )
        .prefetch_related(
            Prefetch(
                "installments",
                queryset=FeeInstallment.objects.order_by(
                    "installment_number"
                ),
            )
        )
        .first()
    )


def get_required_amount(installments, reference_dt):
    total = 0
    for installment in installments:
        due = timezone.make_aware(
            datetime.combine(installment.due_date, time(23, 59, 59))
        )
        if due <= reference_dt:
            total += installment.amount
    return total


def calculate_situation(student, academic_year, reference_dt):
    """
    Calcule la situation financière complète d'un étudiant pour
    une année académique donnée. Reproduit la logique de
    finance-students.js §19 côté serveur.
    """
    academic_program = student.academic_program
    faculty = student.faculty
    department = student.department
    program = academic_program.program if academic_program else None

    schedule = get_fee_schedule(academic_program, academic_year)
    installments = list(schedule.installments.all()) if schedule else []

    payments = get_student_payments(student, academic_year=academic_year)
    paid_amount = sum((p.amount for p in payments), start=0)

    if not schedule:
        return {
            "student": student,
            "faculty": faculty,
            "department": department,
            "program": program,
            "academic_program": academic_program,
            "academic_year": academic_year,
            "schedule": None,
            "installments": [],
            "payments": payments,
            "annual_amount": 0,
            "required_amount": 0,
            "paid_amount": paid_amount,
            "annual_remaining": 0,
            "overdue_amount": 0,
            "status": "Non configuré",
        }

    annual_amount = schedule.total_amount
    required_amount = get_required_amount(installments, reference_dt)
    annual_remaining = max(annual_amount - paid_amount, 0)
    overdue_amount = max(required_amount - paid_amount, 0)

    if overdue_amount > 0:
        status = "En retard"
    elif paid_amount > required_amount and paid_amount < annual_amount:
        status = "En avance"
    else:
        status = "En ordre"

    return {
        "student": student,
        "faculty": faculty,
        "department": department,
        "program": program,
        "academic_program": academic_program,
        "academic_year": academic_year,
        "schedule": schedule,
        "installments": installments,
        "payments": payments,
        "annual_amount": annual_amount,
        "required_amount": required_amount,
        "paid_amount": paid_amount,
        "annual_remaining": annual_remaining,
        "overdue_amount": overdue_amount,
        "status": status,
    }


def calculate_all_situations(academic_year, reference_dt, students=None):
    if students is None:
        students = (
            User.objects.filter(
                role=User.Role.STUDENT,
                academic_program__isnull=False,
            )
            .select_related(
                "academic_program",
                "academic_program__program",
                "academic_program__program__department",
                "academic_program__program__department__faculty",
            )
        )

    return [
        calculate_situation(student, academic_year, reference_dt)
        for student in students
    ]


# ============================================================
# SÉRIALISATION JSON (pour injection dans le template)
# ============================================================

def _payment_bank_name(payment):
    claim = payment.claim
    if claim and claim.bank_transaction and claim.bank_transaction.bank_account:
        return claim.bank_transaction.bank_account.bank.name
    if claim and claim.bank:
        return claim.bank.name
    return None


def _payment_reference(payment):
    claim = payment.claim
    if claim and claim.bank_transaction:
        return claim.bank_transaction.transaction_reference
    if claim:
        return claim.submitted_reference
    return None


def serialize_situation(situation, detailed=False):
    student = situation["student"]
    faculty = situation["faculty"]
    department = situation["department"]
    program = situation["program"]
    academic_program = situation["academic_program"]
    schedule = situation["schedule"]

    data = {
        "student": {
            "id": student.id,
            "matricule": student.registration_num or "",
            "fullName": student.full_congolese_name or student.username,
            "lastName": student.last_name,
            "firstName": student.first_name,
            "avatarUrl": student.get_avatar_url,
        },
        "faculty": {"id": faculty.id, "name": faculty.name} if faculty else None,
        "department": (
            {"id": department.id, "name": department.name}
            if department
            else None
        ),
        "program": {"id": program.id, "name": program.name} if program else None,
        "academicProgram": (
            {
                "id": academic_program.id,
                "level": academic_program.level,
                "levelDisplay": academic_program.get_level_display(),
                "name": str(academic_program),
                "academicYear": schedule.academic_year
                if schedule
                else situation.get("academic_year", DEFAULT_ACADEMIC_YEAR),
            }
            if academic_program
            else None
        ),
        "schedule": (
            {"id": schedule.id, "totalAmount": str(schedule.total_amount)}
            if schedule
            else None
        ),
        "annualAmount": str(situation["annual_amount"]),
        "requiredAmount": str(situation["required_amount"]),
        "paidAmount": str(situation["paid_amount"]),
        "annualRemaining": str(situation["annual_remaining"]),
        "overdueAmount": str(situation["overdue_amount"]),
        "status": situation["status"],
    }

    if detailed:
        data["installments"] = [
            {
                "id": installment.id,
                "sequence": installment.installment_number,
                "title": installment.title,
                "amount": str(installment.amount),
                "dueDate": installment.due_date.isoformat(),
            }
            for installment in situation["installments"]
        ]

        data["payments"] = [
            {
                "id": payment.id,
                "amount": str(payment.amount),
                "validatedAt": payment.payment_date.date().isoformat(),
                "bankName": _payment_bank_name(payment),
                "reference": _payment_reference(payment),
            }
            for payment in situation["payments"]
        ]

    return data


# ============================================================
# RÉFÉRENTIEL ACADÉMIQUE (pour les filtres en cascade)
# ============================================================

def serialize_academic_structure():
    faculties = list(Faculty.objects.filter(is_active=True).order_by("name"))
    departments = list(
        Department.objects.filter(is_active=True)
        .select_related("faculty")
        .order_by("name")
    )
    programs = list(
        Program.objects.filter(is_active=True)
        .select_related("department")
        .order_by("name")
    )
    academic_programs = list(
        AcademicProgram.objects.filter(is_active=True)
        .select_related("program")
        .order_by("program__name", "level")
    )

    academic_programs.sort(key=lambda ap: (ap.program_id, _level_rank(ap.level)))

    return {
        "faculties": [
            {"id": f.id, "name": f.name} for f in faculties
        ],
        "departments": [
            {"id": d.id, "name": d.name, "facultyId": d.faculty_id}
            for d in departments
        ],
        "programs": [
            {"id": p.id, "name": p.name, "departmentId": p.department_id}
            for p in programs
        ],
        "academicPrograms": [
            {
                "id": ap.id,
                "programId": ap.program_id,
                "level": ap.level,
                "levelDisplay": ap.get_level_display(),
            }
            for ap in academic_programs
        ],
    }


# ============================================================
# VUE — LISTE DES SITUATIONS FINANCIÈRES
# ============================================================

@login_required
@finance_staff_required
def finance_students(request):
    academic_year = request.GET.get("academic_year") or DEFAULT_ACADEMIC_YEAR
    reference_dt = _build_reference_datetime()

    situations = calculate_all_situations(academic_year, reference_dt)

    situations_json = [serialize_situation(s) for s in situations]
    academic_structure = serialize_academic_structure()
    banks = list(Bank.objects.filter(is_active=True).order_by("name"))

    context = {
        "academic_year": academic_year,
        "academic_year_choices": ACADEMIC_YEAR_CHOICES,
        "banks": banks,
        "bootstrap_data": _safe_json(
            {
                "academicYear": academic_year,
                "referenceDate": reference_dt.isoformat(),
                "situations": situations_json,
                "academicStructure": academic_structure,
                "banks": [{"id": b.id, "name": b.name} for b in banks],
            }
        ),
        # Aucune fiche pré-ouverte sur la page liste.
        "open_student_id": None,
    }

    return render(request, "espace_finance/finance-students.html", context)


# ============================================================
# VUE — FICHE INDIVIDUELLE (page dédiée, modale pré-ouverte)
# ============================================================

@login_required
@finance_staff_required
def finance_student_detail(request, student_id):
    student = get_object_or_404(
        User.objects.select_related(
            "academic_program",
            "academic_program__program",
            "academic_program__program__department",
            "academic_program__program__department__faculty",
        ),
        pk=student_id,
        role=User.Role.STUDENT,
    )

    academic_year = request.GET.get("academic_year") or DEFAULT_ACADEMIC_YEAR
    reference_dt = _build_reference_datetime()

    # La liste complète reste nécessaire : la page réutilise le même
    # tableau + les mêmes filtres que finance_students, avec en plus
    # la modale de `student` ouverte automatiquement.
    situations = calculate_all_situations(academic_year, reference_dt)
    situations_json = [serialize_situation(s) for s in situations]

    # Situation détaillée du student demandé (installments + payments).
    student_situation = calculate_situation(student, academic_year, reference_dt)
    detailed_json = serialize_situation(student_situation, detailed=True)

    # On l'injecte aussi en version détaillée dans la liste, pour que
    # la modale n'ait pas besoin d'un second appel réseau.
    for item in situations_json:
        if item["student"]["id"] == student.id:
            item["installments"] = detailed_json["installments"]
            item["payments"] = detailed_json["payments"]
            break

    academic_structure = serialize_academic_structure()
    banks = list(Bank.objects.filter(is_active=True).order_by("name"))

    context = {
        "academic_year": academic_year,
        "academic_year_choices": ACADEMIC_YEAR_CHOICES,
        "banks": banks,
        "bootstrap_data": _safe_json(
            {
                "academicYear": academic_year,
                "referenceDate": reference_dt.isoformat(),
                "situations": situations_json,
                "academicStructure": academic_structure,
                "banks": [{"id": b.id, "name": b.name} for b in banks],
            }
        ),
        "open_student_id": student.id,
    }

    return render(request, "espace_finance/finance-students.html", context)


# ============================================================
# EXPORT CSV (respecte les filtres actifs, passés en query params)
# ============================================================

def _apply_query_filters(situations, request):
    """
    Reproduit finance-students.js §23 (applyFilters) côté serveur,
    à partir des paramètres GET envoyés par le bouton "Exporter".
    """
    faculty_id = request.GET.get("faculty") or ""
    department_id = request.GET.get("department") or ""
    program_id = request.GET.get("program") or ""
    academic_program_id = request.GET.get("academic_program") or ""
    status = request.GET.get("status") or ""
    bank = request.GET.get("bank") or ""
    search = (request.GET.get("q") or "").strip().lower()

    def matches(situation):
        if faculty_id and (
            not situation["faculty"]
            or str(situation["faculty"].id) != faculty_id
        ):
            return False

        if department_id and (
            not situation["department"]
            or str(situation["department"].id) != department_id
        ):
            return False

        if program_id and (
            not situation["program"]
            or str(situation["program"].id) != program_id
        ):
            return False

        if academic_program_id and (
            not situation["academic_program"]
            or str(situation["academic_program"].id) != academic_program_id
        ):
            return False

        if status and situation["status"] != status:
            return False

        if bank:
            bank_names = {
                _payment_bank_name(p) for p in situation["payments"]
            }
            if bank not in bank_names:
                return False

        if search:
            student = situation["student"]
            haystack = " ".join(
                filter(
                    None,
                    [
                        student.full_congolese_name,
                        student.registration_num,
                        situation["faculty"].name if situation["faculty"] else "",
                        situation["department"].name
                        if situation["department"]
                        else "",
                        situation["program"].name if situation["program"] else "",
                        situation["academic_program"].level
                        if situation["academic_program"]
                        else "",
                        " ".join(
                            filter(
                                None,
                                (
                                    _payment_reference(p)
                                    for p in situation["payments"]
                                ),
                            )
                        ),
                    ],
                )
            ).lower()

            if search not in haystack:
                return False

        return True

    return [s for s in situations if matches(s)]


@login_required
@finance_staff_required
def finance_students_export_csv(request):
    academic_year = request.GET.get("academic_year") or DEFAULT_ACADEMIC_YEAR
    reference_dt = _build_reference_datetime()

    situations = calculate_all_situations(academic_year, reference_dt)
    situations = _apply_query_filters(situations, request)

    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = (
        f'attachment; filename="situations-financieres-{academic_year}.csv"'
    )
    response.write("\ufeff")  # BOM pour Excel

    writer = csv.writer(response, delimiter=";")
    writer.writerow(
        [
            "Matricule",
            "Nom complet",
            "Faculté",
            "Département",
            "Programme",
            "Niveau",
            "Année académique",
            "Frais annuels",
            "Exigible",
            "Payé",
            "Solde annuel",
            "Retard",
            "Situation",
        ]
    )

    for situation in situations:
        student = situation["student"]
        schedule = situation["schedule"]
        academic_program = situation["academic_program"]

        writer.writerow(
            [
                student.registration_num or "",
                student.full_congolese_name or student.username,
                situation["faculty"].name if situation["faculty"] else "",
                situation["department"].name if situation["department"] else "",
                situation["program"].name if situation["program"] else "",
                academic_program.level if academic_program else "",
                academic_year,
                situation["annual_amount"] if schedule else "",
                situation["required_amount"] if schedule else "",
                situation["paid_amount"],
                situation["annual_remaining"] if schedule else "",
                situation["overdue_amount"] if schedule else "",
                situation["status"],
            ]
        )

    return response
