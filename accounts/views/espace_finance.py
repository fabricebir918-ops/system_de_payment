from decimal import Decimal
from datetime import timedelta, date, datetime, time
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Sum, Count, Prefetch
from django.http import HttpResponseForbidden, JsonResponse, HttpResponse
from django.utils import timezone
from django.shortcuts import render, get_object_or_404
from django.views.decorators.http import require_http_methods
import json
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import csv
import openpyxl
import io
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.contrib.auth import update_session_auth_hash
from django.views.decorators.csrf import csrf_exempt
from django.core.serializers.json import DjangoJSONEncoder


from ..models import (
    User,
    BankTransaction,
    PaymentClaim,
    Payment,
    FeeSchedule,
    PaymentAnomaly,
    Faculty,
    Bank,
    VerificationLog,
    AcademicLevel,
    AcademicProgram,
    UniversityBankAccount,
    BankStatement,
    FeeInstallment,
    Department,
    Program,
)


# ============================================================
# CONFIGURATION
# ============================================================

ACADEMIC_YEAR = "2026-2027"

ACADEMIC_YEAR_START = timezone.datetime(
    2026, 9, 1,
    tzinfo=timezone.get_current_timezone(),
)

ACADEMIC_YEAR_END = timezone.datetime(
    2027, 8, 31,
    23, 59, 59,
    tzinfo=timezone.get_current_timezone(),
)

PREVIOUS_ACADEMIC_YEAR = "2025-2026"

PREVIOUS_ACADEMIC_YEAR_START = (
    ACADEMIC_YEAR_START.replace(
        year=ACADEMIC_YEAR_START.year - 1
    )
)

PREVIOUS_ACADEMIC_YEAR_END = (
    ACADEMIC_YEAR_END.replace(
        year=ACADEMIC_YEAR_END.year - 1
    )
)

ACADEMIC_YEAR_CHOICES = [
    ("2026-2027", "2026-2027"),
    ("2025-2026", "2025-2026"),
    ("2024-2025", "2024-2025"),
    ("2023-2024", "2023-2024"),
]

ZERO = Decimal("0.00")


# ============================================================
# AUTORISATION
# ============================================================

def finance_required(view_func):
    """
    Decorator to check if user is a Finance officer.
    """
    def wrapper(request, *args, **kwargs):
        if not (
            request.user.is_authenticated and
            request.user.role == User.Role.STAFF and
            request.user.staff_role == User.StaffRole.FINANCIER
        ):
            return HttpResponseForbidden("Accès réservé au Responsable financier.")
        return view_func(request, *args, **kwargs)
    return wrapper


# ============================================================
# HELPERS — DATES
# ============================================================

def _today():
    return timezone.localdate()


def _yesterday():
    return _today() - timedelta(days=1)


def _previous_period_date():
    today = _today()
    return today.replace(year=today.year - 1)


def build_reference_datetime():
    """
    Instant de référence pour déterminer ce qui est "exigible à ce
    jour" : fin de journée (23:59:59) de l'heure locale actuelle.
    """
    now = timezone.localtime()
    if timezone.is_naive(now):
        now = timezone.make_aware(now)
    return timezone.make_aware(
        datetime.combine(now.date(), time(23, 59, 59))
    )


# ============================================================
# HELPERS — CALCULS FINANCIERS GLOBAUX
# ============================================================

def calculate_expected_amount(academic_year):
    """
    Calculates the total amount expected for an academic year.

    Formula:

        FeeSchedule.total_amount
        ×
        number of students in that AcademicProgram

    Only active fee schedules are considered.
    """

    schedules = (
        FeeSchedule.objects
        .filter(
            academic_year=academic_year,
            status=FeeSchedule.Status.ACTIF,
        )
        .select_related("academic_program")
    )

    total = ZERO

    for schedule in schedules:

        student_count = User.objects.filter(
            role=User.Role.STUDENT,
            academic_program=schedule.academic_program,
        ).count()

        total += schedule.total_amount * student_count

    return total


def calculate_expected_amount_by_faculty(academic_year):
    """
    Calculates expected, collected and recovery rate
    for each faculty.
    """

    schedules = (
        FeeSchedule.objects
        .filter(
            academic_year=academic_year,
            status=FeeSchedule.Status.ACTIF,
        )
        .select_related(
            "academic_program__program__department__faculty"
        )
    )

    faculty_data = {}

    for schedule in schedules:

        academic_program = schedule.academic_program

        faculty = (
            academic_program
            .program
            .department
            .faculty
        )

        student_count = User.objects.filter(
            role=User.Role.STUDENT,
            academic_program=academic_program,
        ).count()

        expected = schedule.total_amount * student_count

        if faculty.id not in faculty_data:
            faculty_data[faculty.id] = {
                "id": faculty.id,
                "code": faculty.code,
                "name": faculty.name,
                "expected": ZERO,
                "collected": ZERO,
                "remaining": ZERO,
                "rate": ZERO,
            }

        faculty_data[faculty.id]["expected"] += expected

    # --------------------------------------------------------
    # Montants réellement encaissés par faculté
    # --------------------------------------------------------

    payments = (
        Payment.objects
        .filter(
            academic_year=academic_year,
            status=Payment.Status.PAID,
        )
        .select_related(
            "student__academic_program__program__department__faculty"
        )
    )

    for payment in payments:

        faculty = (
            payment.student
            .academic_program
            .program
            .department
            .faculty
        )

        if faculty.id not in faculty_data:
            faculty_data[faculty.id] = {
                "id": faculty.id,
                "code": faculty.code,
                "name": faculty.name,
                "expected": ZERO,
                "collected": ZERO,
                "remaining": ZERO,
                "rate": ZERO,
            }

        faculty_data[faculty.id]["collected"] += payment.amount

    # --------------------------------------------------------
    # Remaining + recovery rate
    # --------------------------------------------------------

    for data in faculty_data.values():

        data["remaining"] = max(
            data["expected"] - data["collected"],
            ZERO,
        )

        if data["expected"] > ZERO:
            data["rate"] = (
                data["collected"]
                / data["expected"]
                * Decimal("100")
            )
        else:
            data["rate"] = ZERO

    return sorted(
        faculty_data.values(),
        key=lambda item: item["rate"],
        reverse=True,
    )


def percentage_change(current, previous):
    """
    Calculates percentage evolution between two values.

    Returns None when there is no previous value.
    """

    if previous == ZERO:
        return None

    return (
        (current - previous)
        / previous
        * Decimal("100")
    )


# ============================================================
# TABLEAU DE BORD FINANCIER
# ============================================================


@login_required
@finance_required
def finance_dashboard(request):

    today = _today()
    yesterday = _yesterday()
    previous_period_date = _previous_period_date()

    # --------------------------------------------------------
    # Montant bancaire reçu aujourd'hui / hier
    # --------------------------------------------------------

    today_bank_amount = (
        BankTransaction.objects
        .filter(payment_date__date=today)
        .aggregate(total=Sum("amount"))
        ["total"]
        or ZERO
    )

    yesterday_bank_amount = (
        BankTransaction.objects
        .filter(payment_date__date=yesterday)
        .aggregate(total=Sum("amount"))
        ["total"]
        or ZERO
    )

    if yesterday_bank_amount > ZERO:
        today_income_evolution = (
            (today_bank_amount - yesterday_bank_amount)
            / yesterday_bank_amount
            * Decimal("100")
        )
    else:
        today_income_evolution = ZERO

    # ========================================================
    # PAIEMENTS VALIDÉS
    # ========================================================

    today_validated_payments = (
        PaymentClaim.objects
        .filter(
            payment_date__date=today,
            status=PaymentClaim.ClaimStatus.APPROVED,
            is_verified=True,
        )
        .count()
    )

    yesterday_validated_payments = (
        PaymentClaim.objects
        .filter(
            payment_date__date=yesterday,
            status=PaymentClaim.ClaimStatus.APPROVED,
            is_verified=True,
        )
        .count()
    )

    if yesterday_validated_payments > 0:
        validated_payments_evolution = (
            Decimal(
                today_validated_payments
                - yesterday_validated_payments
            )
            / Decimal(yesterday_validated_payments)
            * Decimal("100")
        )
    else:
        validated_payments_evolution = ZERO

    # ========================================================
    # CLAIMS EN ATTENTE AUJOURD'HUI
    # ========================================================

    today_pending_anomaly_count = (
        PaymentAnomaly.objects
        .filter(
            status=PaymentAnomaly.Status.OPEN,
            created_at__date=today,
        )
        .count()
    )

    # ========================================================
    # ÉCART BANCAIRE DU JOUR
    # ========================================================

    today_approved_amount = (
        PaymentClaim.objects
        .filter(
            payment_date__date=today,
            status=PaymentClaim.ClaimStatus.APPROVED,
            is_verified=True,
        )
        .aggregate(total=Sum("amount"))
        ["total"]
        or ZERO
    )

    reconciliation_gap = (
        today_bank_amount - today_approved_amount
    )

    # ========================================================
    # MONTANT ATTENDU / ENCAISSÉ / RESTANT
    # ========================================================

    expected_amount = calculate_expected_amount(ACADEMIC_YEAR)

    collected_data = (
        Payment.objects
        .filter(
            academic_year=ACADEMIC_YEAR,
            status=Payment.Status.PAID,
        )
        .aggregate(
            total=Sum("amount"),
            count=Count("id"),
        )
    )

    collected_amount = collected_data["total"] or ZERO

    remaining_amount = max(
        expected_amount - collected_amount,
        ZERO,
    )

    bank_amount = BankTransaction.objects.filter(
        claim__academic_year=ACADEMIC_YEAR,
    ).aggregate(
        total=Sum("amount")
    )["total"] or ZERO

    pending_anomalies = (
        PaymentAnomaly.objects
        .filter(
            status=PaymentAnomaly.Status.OPEN,
            claim__academic_year=ACADEMIC_YEAR,
        )
        .count()
    )

    # ========================================================
    # COMPARAISON ANNÉE PRÉCÉDENTE
    # ========================================================

    previous_expected_amount = ZERO
    previous_collected_amount = ZERO
    previous_remaining_amount = ZERO

    if PREVIOUS_ACADEMIC_YEAR:

        previous_expected_amount = calculate_expected_amount(
            PREVIOUS_ACADEMIC_YEAR
        )

        previous_collected_data = (
            Payment.objects
            .filter(
                academic_year=PREVIOUS_ACADEMIC_YEAR,
                status=Payment.Status.PAID,
                payment_date__date__lte=previous_period_date,
            )
            .aggregate(total=Sum("amount"))
        )

        previous_collected_amount = (
            previous_collected_data["total"]
            or ZERO
        )

        previous_remaining_amount = max(
            previous_expected_amount
            - previous_collected_amount,
            ZERO,
        )

    previous_pending_anomalies = 0

    if PREVIOUS_ACADEMIC_YEAR:

        previous_pending_anomalies = (
            PaymentAnomaly.objects
            .filter(
                claim__academic_year=PREVIOUS_ACADEMIC_YEAR,
                created_at__date__lte=previous_period_date,
                status=PaymentAnomaly.Status.OPEN,
            )
            .count()
        )

    if previous_pending_anomalies > 0:
        pending_evolution = (
            Decimal(
                pending_anomalies
                - previous_pending_anomalies
            )
            / Decimal(previous_pending_anomalies)
            * Decimal("100")
        )
    else:
        pending_evolution = ZERO

    expected_amount_evolution = percentage_change(
        expected_amount, previous_expected_amount
    )
    collected_amount_evolution = percentage_change(
        collected_amount, previous_collected_amount
    )
    remaining_amount_evolution = percentage_change(
        remaining_amount, previous_remaining_amount
    )

    # ============================================================
    # FACULTÉS
    # ============================================================

    faculty_recovery = calculate_expected_amount_by_faculty(ACADEMIC_YEAR)

    faculties = {
        faculty["code"]: {
            "code": faculty["code"],
            "name": faculty["name"],
            "collected": faculty["collected"],
            "expected": faculty["expected"],
        }
        for faculty in faculty_recovery
    }

    # ============================================================
    # GRAPHIQUES
    # ============================================================

    # ------------------------------------------------------------
    # 1D — AUJOURD'HUI, PAR HEURE
    # ------------------------------------------------------------

    hourly_transactions = (
        BankTransaction.objects
        .filter(payment_date__date=today)
        .values("payment_date__hour")
        .annotate(total=Sum("amount"))
        .order_by("payment_date__hour")
    )

    hourly_data = {
        item["payment_date__hour"]: item["total"] or ZERO
        for item in hourly_transactions
    }

    labels_1d = [f"{hour:02d}h" for hour in range(24)]
    values_1d = [hourly_data.get(hour, ZERO) for hour in range(24)]

    # ------------------------------------------------------------
    # 1W — 7 DERNIERS JOURS
    # ------------------------------------------------------------

    week_start = today - timedelta(days=6)

    daily_transactions = (
        BankTransaction.objects
        .filter(
            payment_date__date__gte=week_start,
            payment_date__date__lte=today,
        )
        .values("payment_date__date")
        .annotate(total=Sum("amount"))
        .order_by("payment_date__date")
    )

    daily_data = {
        item["payment_date__date"]: item["total"] or ZERO
        for item in daily_transactions
    }

    weekday_labels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

    labels_1w = []
    values_1w = []

    for i in range(7):
        current_date = week_start + timedelta(days=i)
        labels_1w.append(weekday_labels[current_date.weekday()])
        values_1w.append(daily_data.get(current_date, ZERO))

    # ------------------------------------------------------------
    # 1M — MOIS COURANT
    # ------------------------------------------------------------

    month_start = today - timedelta(days=29)

    daily_month_transactions = (
        BankTransaction.objects
        .filter(
            payment_date__date__gte=month_start,
            payment_date__date__lte=today,
        )
        .values("payment_date__date")
        .annotate(total=Sum("amount"))
        .order_by("payment_date__date")
    )

    month_data = {
        item["payment_date__date"]: item["total"] or ZERO
        for item in daily_month_transactions
    }

    labels_1m = []
    values_1m = []

    current_date = month_start

    while current_date <= today:
        labels_1m.append(current_date.strftime("%d %b"))
        values_1m.append(month_data.get(current_date, ZERO))
        current_date += timedelta(days=1)

    # ------------------------------------------------------------
    # 3M — 12 DERNIÈRES SEMAINES
    # ------------------------------------------------------------

    three_month_start = today - timedelta(weeks=11)

    weekly_transactions = (
        BankTransaction.objects
        .filter(
            payment_date__date__gte=three_month_start,
            payment_date__date__lte=today,
        )
        .values("payment_date__date")
        .annotate(total=Sum("amount"))
    )

    weekly_data = {}

    for item in weekly_transactions:

        transaction_date = item["payment_date__date"]

        week_start_date = (
            transaction_date
            - timedelta(days=transaction_date.weekday())
        )

        weekly_data[week_start_date] = (
            weekly_data.get(week_start_date, ZERO)
            + (item["total"] or ZERO)
        )

    labels_3m = []
    values_3m = []

    first_week = (
        three_month_start
        - timedelta(days=three_month_start.weekday())
    )

    for i in range(12):
        current_week = first_week + timedelta(weeks=i)
        labels_3m.append(current_week.strftime("%d %b"))
        values_3m.append(weekly_data.get(current_week, ZERO))

    # ------------------------------------------------------------
    # 1Y — 12 DERNIERS MOIS
    # ------------------------------------------------------------

    current_month = today.replace(day=1)

    months = []
    year = current_month.year
    month = current_month.month

    for _ in range(12):
        months.append((year, month))
        if month == 1:
            year -= 1
            month = 12
        else:
            month -= 1

    months.reverse()

    first_year, first_month = months[0]
    one_year_start = date(first_year, first_month, 1)
    one_year_end = today

    monthly_transactions = (
        BankTransaction.objects
        .filter(
            payment_date__date__gte=one_year_start,
            payment_date__date__lte=one_year_end,
        )
        .values("payment_date__year", "payment_date__month")
        .annotate(total=Sum("amount"))
    )

    monthly_data = {
        (item["payment_date__year"], item["payment_date__month"]):
            item["total"] or ZERO
        for item in monthly_transactions
    }

    month_labels = [
        "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
        "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
    ]

    labels_1y = []
    values_1y = []

    for year, month in months:
        labels_1y.append(month_labels[month - 1])
        values_1y.append(monthly_data.get((year, month), ZERO))

    recent_anomalies = (
        PaymentAnomaly.objects
        .filter(status=PaymentAnomaly.Status.OPEN)
        .select_related("claim", "claim__student")
        .order_by("-created_at")[:5]
    )

    # ============================================================
    # DICTIONNAIRE FINAL
    # ============================================================

    dashboard_data = {
        "expected": expected_amount,
        "collected": collected_amount,
        "validated": today_validated_payments,
        "anomalies": pending_anomalies,
        "bank": bank_amount,
        "today": today_bank_amount,

        "evolutions": {
            "todayIncome": today_income_evolution,
            "validatedPayments": validated_payments_evolution,
            "expectedAmount": expected_amount_evolution,
            "collectedAmount": collected_amount_evolution,
            "remainingAmount": remaining_amount_evolution,
            "anomalies": pending_evolution,
        },

        "faculties": faculties,

        "charts": {
            "1D": {
                "labels": labels_1d,
                "values": [float(value) for value in values_1d],
            },
            "1W": {
                "labels": labels_1w,
                "values": [float(value) for value in values_1w],
            },
            "1M": {
                "labels": labels_1m,
                "values": [float(value) for value in values_1m],
            },
            "3M": {
                "labels": labels_3m,
                "values": [float(value) for value in values_3m],
            },
            "1Y": {
                "labels": labels_1y,
                "values": [float(value) for value in values_1y],
            },
        },
    }

    return render(
        request,
        "espace_finance/finance-dashboard.html",
        {
            "dashboard_data": dashboard_data,
            "recent_anomalies": recent_anomalies,
        }
    )


# ================================================================
# RÉFÉRENTIELS
# ================================================================

def serialize_banks():

    return {
        bank.code: {
            "code": bank.code,
            "name": bank.name,
        }
        for bank in Bank.objects.filter(
            is_active=True
        ).order_by("name")
    }


def serialize_academic_structure():
    """
    Référentiel académique imbriqué (faculté -> département ->
    programme -> niveaux), utilisé par la page Paiements.
    """

    faculties = (
        Faculty.objects
        .filter(is_active=True)
        .prefetch_related(
            "departments",
            "departments__programs",
            "departments__programs__academic_programs",
        )
        .order_by("name")
    )

    structure = {}

    for faculty in faculties:

        departments = {}

        for department in faculty.departments.filter(
            is_active=True
        ).order_by("name"):

            programs = {}

            for program in department.programs.filter(
                is_active=True
            ).order_by("name"):

                levels = list(
                    program.academic_programs
                    .filter(is_active=True)
                    .order_by("level")
                    .values_list("level", flat=True)
                )

                programs[program.code] = {
                    "name": program.name,
                    "levels": levels,
                }

            departments[department.code] = {
                "name": department.name,
                "programs": programs,
            }

        structure[faculty.code] = {
            "name": faculty.name,
            "departments": departments,
        }

    return structure


def serialize_academic_structure_flat():
    """
    Référentiel académique à plat (listes de faculté/département/
    programme/parcours-niveau avec id et clés étrangères), utilisé
    par la page Échéancier (finance_schedule).
    """
    structure = []

    for faculty in Faculty.objects.filter(is_active=True):
        faculty_data = {
            "code": faculty.code,
            "name": faculty.name,
            "departments": []
        }

        for department in faculty.departments.filter(is_active=True):
            dept_data = {
                "code": department.code,
                "name": department.name,
                "programs": []
            }

            for program in department.programs.filter(is_active=True):
                levels = program.academic_programs.filter(
                    is_active=True
                ).values_list('level', flat=True)

                dept_data["programs"].append({
                    "code": program.code,
                    "name": program.name,
                    "levels": list(levels)
                })

            faculty_data["departments"].append(dept_data)

        structure.append(faculty_data)

    return structure


def serialize_promotions():

    return dict(AcademicLevel.choices)


# ================================================================
# DÉCLARATIONS DE PAIEMENT
# ================================================================

STATUS_TO_SCENARIO = {
    PaymentClaim.ClaimStatus.PENDING: "PENDING",
    PaymentClaim.ClaimStatus.APPROVED: "APPROVED",
    PaymentClaim.ClaimStatus.REJECTED: "ANOMALY",
}


def serialize_claim(claim):

    student = claim.student
    academic_program = student.academic_program

    program = (
        academic_program.program
        if academic_program
        else None
    )

    department = (
        program.department
        if program
        else None
    )

    faculty = (
        department.faculty
        if department
        else None
    )

    scenario = STATUS_TO_SCENARIO.get(
        claim.status,
        "PENDING",
    )

    anomaly_type = None

    if scenario == "ANOMALY":

        anomaly = (
            claim.anomalies
            .filter(status=PaymentAnomaly.Status.OPEN)
            .order_by("-created_at")
            .first()
        )

        if anomaly:
            anomaly_type = anomaly.anomaly_type

    return {
        "id": claim.id,
        "student": student.full_congolese_name,
        "matricule": student.registration_num,
        "reference": claim.submitted_reference,
        "bank": claim.bank.code,
        "faculty": faculty.code if faculty else None,
        "department": department.code if department else None,
        "departmentName": department.name if department else None,
        "program": program.code if program else None,
        "programName": program.name if program else None,
        "promotion": academic_program.level if academic_program else None,
        "semester": claim.semester,
        "amount": float(claim.amount),
        "date": claim.payment_date.date().isoformat(),
        "academicYear": claim.academic_year,
        "scenario": scenario,
        "transactionVerified": claim.is_verified,
        "paymentCreated": hasattr(claim, "payment"),
        "anomalyType": anomaly_type,
    }


def serialize_payment_claims():

    claims = (
        PaymentClaim.objects
        .select_related(
            "student",
            "student__academic_program",
            "student__academic_program__program",
            "student__academic_program__program__department",
            "student__academic_program__program__department__faculty",
            "bank",
        )
        .prefetch_related("anomalies", "payment")
        .filter(student__role=User.Role.STUDENT)
        .order_by("-payment_date", "-id")
    )

    return [
        serialize_claim(claim)
        for claim in claims
    ]


# ================================================================
# VUE — PAGE PAIEMENTS
# ================================================================

@login_required
@finance_required
def finance_payments(request):

    payments_data = {
        "banks": serialize_banks(),
        "academicStructure": serialize_academic_structure(),
        "promotions": serialize_promotions(),
        "claims": serialize_payment_claims(),
    }

    # Calculate bank summary
    claims = PaymentClaim.objects.filter(
        student__role=User.Role.STUDENT
    ).select_related('bank')

    bank_summary = []
    total_collected = 0

    for bank in Bank.objects.filter(is_active=True).order_by("name"):
        bank_claims = claims.filter(bank=bank)
        bank_total = bank_claims.aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')
        bank_count = bank_claims.count()

        bank_summary.append({
            'code': bank.code,
            'name': bank.name,
            'total': float(bank_total),
            'count': bank_count,
        })

        total_collected += float(bank_total)

    for bank in bank_summary:
        bank['percentage'] = (
            (bank['total'] / total_collected) * 100
            if total_collected > 0
            else 0
        )

    # Academic years for the dropdown
    current_year = datetime.now().year

    academic_years = []
    for year in range(current_year - 3, current_year + 1):
        academic_years.append({
            'value': f"{year}-{year+1}",
            'label': f"{year} - {year+1}"
        })

    return render(
        request,
        "espace_finance/finance-payments.html",
        {
            "payments_data": json.dumps(payments_data),
            "bank_summary": bank_summary,
            "academic_years": academic_years,
        }
    )


# ============================================================
# FINANCE STATEMENTS — EXTRAITS BANCAIRES
# ============================================================

STATEMENT_ACADEMIC_YEAR_CHOICES = [year for year, _ in ACADEMIC_YEAR_CHOICES]


def _statement_safe_json(data):
    """
    Sérialise en JSON pour injection directe dans un tag <script>.
    Échappe les séquences "</" pour éviter toute fermeture prématurée
    du tag si une valeur textuelle en contient.
    """
    return json.dumps(data, cls=DjangoJSONEncoder).replace("</", "<\\/")


def serialize_statement(statement, transaction_totals=None):
    """
    Sérialise un BankStatement pour le tableau / les KPI de la page
    Extraits bancaires. `transaction_totals` est un dict optionnel
    {statement_id: {"amount": Decimal, "count": int, "verified": int}}
    pré-calculé pour éviter une requête par ligne.
    """
    bank_account = statement.bank_account
    bank = bank_account.bank

    if transaction_totals is not None:
        totals = transaction_totals.get(
            statement.id,
            {"amount": ZERO, "count": 0, "verified": 0},
        )
    else:
        agg = statement.transactions.aggregate(
            total=Sum("amount"), count=Count("id")
        )
        verified = statement.transactions.filter(is_verified=True).count()
        totals = {
            "amount": agg["total"] or ZERO,
            "count": agg["count"] or 0,
            "verified": verified,
        }

    operations = totals["count"]
    verified_count = totals["verified"]
    unmatched_count = operations - verified_count

    return {
        "id": statement.id,
        "file": statement.file.name.split("/")[-1],
        "bank": {"code": bank.code, "name": bank.name},
        "account": bank_account.account_number,
        "currency": bank_account.currency,
        "startDate": statement.start_date.isoformat(),
        "endDate": statement.end_date.isoformat(),
        "operations": operations,
        "amount": str(totals["amount"]),
        "importedAt": statement.imported_at.date().isoformat(),
        "status": statement.status,
        "statusDisplay": statement.get_status_display(),
        "importedBy": statement.imported_by.full_congolese_name,
        "academicYear": statement.academic_year,
        "matched": verified_count,
        "unmatched": unmatched_count,
        # Les anomalies de rapprochement pour cet extrait sont gérées
        # sur la page "Rapprochement global" ; conservé à 0 ici tant
        # qu'un lien direct BankTransaction -> PaymentAnomaly n'existe
        # pas dans le modèle.
        "anomalies": 0,
    }


def _statement_bootstrap_payload(academic_year):
    statements_qs = (
        BankStatement.objects.filter(academic_year=academic_year)
        .select_related("bank_account", "bank_account__bank", "imported_by")
        .order_by("-imported_at")
    )

    statement_ids = list(statements_qs.values_list("id", flat=True))

    transaction_rows = (
        BankTransaction.objects.filter(statement_id__in=statement_ids)
        .values("statement_id")
        .annotate(
            total=Sum("amount"),
            count=Count("id"),
            verified=Count("id", filter=Q(is_verified=True)),
        )
    )

    transaction_totals = {
        row["statement_id"]: {
            "amount": row["total"] or ZERO,
            "count": row["count"] or 0,
            "verified": row["verified"] or 0,
        }
        for row in transaction_rows
    }

    statements_json = [
        serialize_statement(statement, transaction_totals)
        for statement in statements_qs
    ]

    banks = list(Bank.objects.filter(is_active=True).order_by("name"))

    bank_accounts = list(
        UniversityBankAccount.objects.filter(is_active=True)
        .select_related("bank")
        .order_by("bank__name")
    )

    total_amount = sum((Decimal(s["amount"]) for s in statements_json), ZERO)
    total_operations = sum(s["operations"] for s in statements_json)
    total_pending = sum(s["unmatched"] for s in statements_json)

    bank_summary = []
    for bank in banks:
        bank_statements = [s for s in statements_json if s["bank"]["code"] == bank.code]
        bank_summary.append({
            "code": bank.code,
            "name": bank.name,
            "count": len(bank_statements),
            "amount": str(sum((Decimal(s["amount"]) for s in bank_statements), ZERO)),
        })

    return {
        "academicYear": academic_year,
        "statements": statements_json,
        "banks": [
            {
                "code": b.code,
                "name": b.name,
            }
            for b in banks
        ],
        "bankAccounts": [
            {
                "bankCode": account.bank.code,
                "accountNumber": account.account_number,
                "currency": account.currency,
                "label": account.label,
            }
            for account in bank_accounts
        ],
        "bankSummary": bank_summary,
        "kpi": {
            "statementCount": len(statements_json),
            "operations": total_operations,
            "totalAmount": str(total_amount),
            "pendingReconciliation": total_pending,
        },
    }, banks


# ============================================================
# VUE — LISTE DES EXTRAITS BANCAIRES
# ============================================================

@login_required
@finance_required
def finance_statements(request):
    academic_year = request.GET.get("academic_year") or ACADEMIC_YEAR

    payload, banks = _statement_bootstrap_payload(academic_year)

    context = {
        "academic_year": academic_year,
        "academic_year_choices": STATEMENT_ACADEMIC_YEAR_CHOICES,
        "banks": banks,
        "bootstrap_data": _statement_safe_json(payload),
        "pending_anomalies": PaymentAnomaly.objects.filter(
            status=PaymentAnomaly.Status.OPEN
        ).count(),
        "current_academic_year": ACADEMIC_YEAR,
    }

    return render(request, "espace_finance/finance-statements.html", context)


# ============================================================
# IMPORT D'UN EXTRAIT BANCAIRE (AJAX)
# ============================================================

STATEMENT_ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx"]
STATEMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024


def _parse_statement_transactions(file_obj, file_name):
    """
    Extrait (référence, montant, date) de chaque ligne d'un fichier
    CSV/XLS/XLSX d'extrait bancaire. Retourne une liste de dicts
    {"reference": str, "amount": Decimal, "date": str}.
    """
    transactions_data = []

    if file_name.endswith(".csv"):
        file_content = file_obj.read().decode("utf-8")
        csv_reader = csv.DictReader(io.StringIO(file_content))
        for row in csv_reader:
            ref = row.get("reference") or row.get("Reference") or row.get("TRX") or ""
            amount = row.get("amount") or row.get("Amount") or row.get("Montant") or ""
            date_val = (
                row.get("date")
                or row.get("Date")
                or row.get("Date de transaction")
                or ""
            )

            if ref and amount:
                try:
                    amount_decimal = Decimal(str(amount).replace(",", ""))
                    transactions_data.append({
                        "reference": ref.strip(),
                        "amount": amount_decimal,
                        "date": date_val.strip(),
                    })
                except Exception:
                    pass

    elif file_name.endswith((".xls", ".xlsx")):
        workbook = openpyxl.load_workbook(io.BytesIO(file_obj.read()))
        sheet = workbook.active

        headers = []
        for col in range(1, sheet.max_column + 1):
            cell_value = sheet.cell(row=1, column=col).value
            if cell_value:
                headers.append(str(cell_value).lower())

        ref_col = None
        amount_col = None
        date_col = None

        for idx, header in enumerate(headers):
            if any(keyword in header for keyword in ["reference", "trx", "ref", "transaction"]):
                ref_col = idx + 1
            elif any(keyword in header for keyword in ["amount", "montant", "total"]):
                amount_col = idx + 1
            elif any(keyword in header for keyword in ["date", "date de transaction", "transaction date"]):
                date_col = idx + 1

        if ref_col is None or amount_col is None:
            for row in range(2, min(10, sheet.max_row) + 1):
                for col in range(1, min(10, sheet.max_column) + 1):
                    cell_value = str(sheet.cell(row=row, column=col).value or "")
                    if "TRX" in cell_value or len(cell_value) > 5:
                        if ref_col is None:
                            ref_col = col
                    try:
                        float(str(sheet.cell(row=row, column=col).value or "").replace(",", ""))
                        if amount_col is None and col != ref_col:
                            amount_col = col
                    except Exception:
                        pass

        for row in range(2, sheet.max_row + 1):
            try:
                ref = ""
                amount = None
                date_val = ""

                if ref_col:
                    ref = str(sheet.cell(row=row, column=ref_col).value or "").strip()
                if amount_col:
                    try:
                        amount_val = sheet.cell(row=row, column=amount_col).value
                        if amount_val:
                            amount = Decimal(str(amount_val).replace(",", ""))
                    except Exception:
                        pass
                if date_col:
                    date_cell = sheet.cell(row=row, column=date_col).value
                    if date_cell:
                        date_val = str(date_cell)

                if ref and amount and amount > 0:
                    transactions_data.append({
                        "reference": ref,
                        "amount": amount,
                        "date": date_val,
                    })
            except Exception:
                pass

    return transactions_data


def _parse_statement_date(date_str):
    for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"]:
        try:
            return datetime.strptime(date_str, fmt).date()
        except Exception:
            continue
    return None


# ============================================================
# RAPPROCHEMENT AUTOMATIQUE (déclenché à l'import d'un extrait)
# ============================================================

def _anomaly_type_for_mismatch(claim, transaction):
    """
    Détermine le type d'anomalie le plus pertinent quand une
    transaction bancaire porte la même référence qu'une déclaration
    mais ne correspond pas parfaitement (montant, banque, date).
    """
    if claim.amount != transaction.amount:
        return PaymentAnomaly.Type.AMOUNT_MISMATCH

    claim_bank_code = claim.bank.code if claim.bank else None
    transaction_bank_code = (
        transaction.bank_account.bank.code
        if transaction.bank_account and transaction.bank_account.bank
        else None
    )

    if claim_bank_code and transaction_bank_code and claim_bank_code != transaction_bank_code:
        return PaymentAnomaly.Type.BANK_MISMATCH

    return PaymentAnomaly.Type.OTHER


def auto_reconcile_transactions(transactions, academic_year):
    """
    Rapprochement automatique déclenché juste après l'import d'un
    extrait bancaire : pour chaque nouvelle BankTransaction,

    - si sa référence correspond à une PaymentClaim (même année
      académique) ET que les montants concordent : la claim est
      approuvée/vérifiée et liée à la transaction (paiement
      confirmé, sans action humaine) ;

    - si la référence correspond à une claim mais que quelque
      chose ne concorde pas (montant différent, banque différente,
      claim déjà liée à une autre transaction) : une PaymentAnomaly
      réelle est créée sur cette claim, prête à être traitée sur la
      page Anomalies ;

    - si aucune claim ne porte cette référence : rien n'est créé
      (PaymentAnomaly.claim est obligatoire ; sans déclaration
      étudiante correspondante, il n'y a rien à rattacher).

    Retourne un résumé {"approved": int, "anomalies_created": int}.
    """
    approved_count = 0
    anomalies_created = 0

    for transaction in transactions:

        claim = (
            PaymentClaim.objects.select_related("bank")
            .filter(
                submitted_reference=transaction.transaction_reference,
                academic_year=academic_year,
            )
            .exclude(status=PaymentClaim.ClaimStatus.REJECTED)
            .order_by("-created_at")
            .first()
        )

        if not claim:
            # Transaction bancaire sans déclaration correspondante :
            # rien à rattacher, on l'ignore silencieusement (elle
            # reste visible en tant que "banque uniquement" sur la
            # page Rapprochement global, calculée à la volée).
            continue

        if claim.bank_transaction_id:
            # Cette déclaration est déjà liée à une autre transaction
            # (paiement déjà rapproché précédemment, ou double envoi
            # du même extrait par la banque). On ne touche pas au
            # lien existant, mais on signale le doublon pour examen.
            PaymentAnomaly.objects.create(
                claim=claim,
                anomaly_type=PaymentAnomaly.Type.DUPLICATE_CLAIM,
                description=(
                    "Nouvelle transaction bancaire "
                    f"({transaction.transaction_reference}, "
                    f"{transaction.amount} $) reçue pour une "
                    "déclaration déjà rapprochée. Vérifier s'il "
                    "s'agit d'un double paiement ou d'un doublon "
                    "d'extrait."
                ),
                status=PaymentAnomaly.Status.OPEN,
            )
            anomalies_created += 1
            continue

        amount_matches = claim.amount == transaction.amount

        if amount_matches:
            claim.bank_transaction = transaction
            claim.status = PaymentClaim.ClaimStatus.APPROVED
            claim.is_verified = True
            claim.save(update_fields=["bank_transaction", "status", "is_verified"])

            transaction.is_verified = True
            transaction.save(update_fields=["is_verified"])

            Payment.objects.create(
                student=claim.student,
                claim=claim,
                bank_reference=transaction.transaction_reference,
                amount=transaction.amount,
                academic_year=academic_year,
                semester=claim.semester,
                status=Payment.Status.PAID,
                payment_date=transaction.payment_date,
            )

            approved_count += 1
            continue

        anomaly_type = _anomaly_type_for_mismatch(claim, transaction)

        PaymentAnomaly.objects.create(
            claim=claim,
            anomaly_type=anomaly_type,
            description=(
                "Écart détecté lors du rapprochement automatique : "
                f"déclaré {claim.amount} $, reçu {transaction.amount} $ "
                f"(référence {transaction.transaction_reference})."
            ),
            status=PaymentAnomaly.Status.OPEN,
        )
        anomalies_created += 1

    return {
        "approved": approved_count,
        "anomalies_created": anomalies_created,
    }


def flag_unmatched_pending_claims(statement, academic_year):
    """
    Complément de auto_reconcile_transactions, dans l'autre sens.

    auto_reconcile_transactions part des NOUVELLES BankTransaction
    et cherche une PaymentClaim correspondante.

    Cette fonction part des PaymentClaim encore PENDING dont la
    date de paiement déclarée est couverte par la période de
    l'extrait qui vient d'être importé (statement.start_date ->
    statement.end_date). Si, après le rapprochement automatique,
    aucune BankTransaction ne porte leur référence, cela signifie
    que la banque n'a rapporté aucune transaction sous cette
    référence alors qu'elle aurait dû figurer dans cet extrait :
    la déclaration est donc marquée comme anomalie
    (REFERENCE_NOT_FOUND).

    Les déclarations dont la date de paiement est postérieure à la
    période de l'extrait ne sont pas concernées : elles attendent
    simplement un extrait plus récent qui couvrira leur date, et
    restent PENDING.

    Ne crée pas de doublon si une anomalie REFERENCE_NOT_FOUND est
    déjà ouverte sur la même déclaration (import répété d'extraits
    successifs sans nouvelle info sur cette référence).

    Retourne le nombre d'anomalies créées.
    """
    anomalies_created = 0

    candidate_claims = (
        PaymentClaim.objects.select_related("bank")
        .filter(
            academic_year=academic_year,
            status=PaymentClaim.ClaimStatus.PENDING,
            payment_date__date__gte=statement.start_date,
            payment_date__date__lte=statement.end_date,
        )
        .exclude(
            anomalies__status=PaymentAnomaly.Status.OPEN,
            anomalies__anomaly_type=PaymentAnomaly.Type.REFERENCE_NOT_FOUND,
        )
        .distinct()
    )

    for claim in candidate_claims:
        reference_exists = BankTransaction.objects.filter(
            transaction_reference=claim.submitted_reference
        ).exists()

        if reference_exists:
            # Une transaction avec cette référence existe déjà
            # (rapprochée dans cet import ou un souci distinct déjà
            # traité) : on ne crée pas d'anomalie supplémentaire ici.
            continue

        PaymentAnomaly.objects.create(
            claim=claim,
            anomaly_type=PaymentAnomaly.Type.REFERENCE_NOT_FOUND,
            description=(
                "Aucune transaction bancaire correspondant à la "
                f"référence {claim.submitted_reference} n'a été "
                "trouvée dans l'extrait couvrant la période "
                f"{statement.start_date} → {statement.end_date}, "
                "bien que la date de paiement déclarée soit "
                "comprise dans cette période."
            ),
            status=PaymentAnomaly.Status.OPEN,
        )
        anomalies_created += 1

    return anomalies_created


@login_required
@finance_required
@require_http_methods(["POST"])
def finance_import_statement(request):
    """
    POST /finance/statements/import/
    multipart/form-data: bank (code Bank), academic_year, file
    """

    user = request.user

    bank_code = request.POST.get("bank")
    academic_year = request.POST.get("academic_year", ACADEMIC_YEAR)
    file_obj = request.FILES.get("file")

    errors = []

    if not bank_code:
        errors.append("Veuillez sélectionner la banque.")

    file_name = ""

    if not file_obj:
        errors.append("Veuillez sélectionner un fichier.")
    else:
        file_name = file_obj.name.lower()
        if not any(file_name.endswith(ext) for ext in STATEMENT_ALLOWED_EXTENSIONS):
            errors.append("Format non pris en charge. Utilisez CSV, XLS ou XLSX.")

        if file_obj.size > STATEMENT_MAX_SIZE_BYTES:
            errors.append("Le fichier dépasse la taille maximale de 10 Mo.")

    if errors:
        return JsonResponse({"success": False, "errors": errors}, status=400)

    try:
        bank = Bank.objects.get(code=bank_code, is_active=True)
        bank_account = UniversityBankAccount.objects.get(bank=bank, is_active=True)
    except Bank.DoesNotExist:
        return JsonResponse({"success": False, "errors": ["Banque non trouvée."]}, status=400)
    except UniversityBankAccount.DoesNotExist:
        return JsonResponse(
            {"success": False, "errors": ["Compte bancaire non trouvé pour cette banque."]},
            status=400,
        )

    try:
        transactions_data = _parse_statement_transactions(file_obj, file_name)
    except Exception as e:
        return JsonResponse(
            {"success": False, "errors": [f"Erreur lors de la lecture du fichier: {str(e)}"]},
            status=400,
        )

    if not transactions_data:
        return JsonResponse(
            {"success": False, "errors": ["Aucune transaction valide trouvée dans le fichier."]},
            status=400,
        )

    try:
        dates = [
            parsed
            for tx in transactions_data
            if tx.get("date")
            for parsed in [_parse_statement_date(tx["date"])]
            if parsed is not None
        ]

        if dates:
            start_date = min(dates)
            end_date = max(dates)
        else:
            start_date = timezone.now().date()
            end_date = timezone.now().date()

        file_path = (
            f'bank_statements/{timezone.now().strftime("%Y/%m/%d")}/{file_obj.name}'
        )
        saved_path = default_storage.save(file_path, ContentFile(file_obj.read()))

        statement = BankStatement.objects.create(
            file=saved_path,
            bank_account=bank_account,
            start_date=start_date,
            end_date=end_date,
            imported_by=user,
            academic_year=academic_year,
            status=BankStatement.Status.PENDING,
        )

        created_count = 0
        skipped_count = 0
        new_transactions = []

        for tx_data in transactions_data:
            parsed_date = _parse_statement_date(tx_data["date"]) if tx_data.get("date") else None
            payment_dt = (
                timezone.make_aware(datetime.combine(parsed_date, time(0, 0)))
                if parsed_date
                else timezone.now()
            )

            try:
                transaction = BankTransaction.objects.create(
                    transaction_reference=tx_data["reference"],
                    statement=statement,
                    bank_account=bank_account,
                    amount=tx_data["amount"],
                    payment_date=payment_dt,
                    is_verified=False,
                )
                created_count += 1
                new_transactions.append(transaction)
            except Exception:
                # Référence en doublon ou autre contrainte : on ignore
                # cette ligne et on continue l'import.
                skipped_count += 1
                continue

        reconciliation_summary = auto_reconcile_transactions(
            new_transactions, academic_year
        )

        unmatched_anomalies_count = flag_unmatched_pending_claims(
            statement, academic_year
        )
        reconciliation_summary["anomalies_created"] += unmatched_anomalies_count

        statement_totals = {
            statement.id: {
                "amount": sum((tx["amount"] for tx in transactions_data), ZERO),
                "count": created_count,
                "verified": reconciliation_summary["approved"],
            }
        }

        message_parts = [
            f"Extrait importé avec succès. {created_count} transaction(s) enregistrée(s)."
        ]

        if skipped_count:
            message_parts.append(
                f"{skipped_count} ligne(s) ignorée(s) (référence en doublon)."
            )

        if reconciliation_summary["approved"]:
            message_parts.append(
                f"{reconciliation_summary['approved']} paiement(s) rapproché(s) "
                "et validé(s) automatiquement."
            )

        if reconciliation_summary["anomalies_created"]:
            message_parts.append(
                f"{reconciliation_summary['anomalies_created']} anomalie(s) "
                "détectée(s) et enregistrée(s)."
            )

        return JsonResponse({
            "success": True,
            "message": " ".join(message_parts),
            "statement": serialize_statement(statement, statement_totals),
        })

    except Exception as e:
        return JsonResponse(
            {"success": False, "errors": [f"Erreur lors de l'importation: {str(e)}"]},
            status=500,
        )


# ============================================================
# DÉTAIL D'UN EXTRAIT (AJAX)
# ============================================================

@login_required
@finance_required
def finance_statement_detail(request, statement_id):
    """
    GET /finance/statements/<id>/
    Retourne le détail JSON d'un extrait bancaire.
    """

    statement = get_object_or_404(
        BankStatement.objects.select_related(
            "bank_account", "bank_account__bank", "imported_by"
        ),
        id=statement_id,
    )

    return JsonResponse(serialize_statement(statement))

# ============================================================
# FEE SCHEDULE — SÉRIALISATION
# ============================================================

def serialize_fee_schedule(schedule):
    """Serialize a FeeSchedule object to match JavaScript format"""
    installments = schedule.installments.all().order_by('installment_number')

    return {
        "id": schedule.id,
        "facultyCode": schedule.academic_program.program.department.faculty.code,
        "departmentCode": schedule.academic_program.program.department.code,
        "programCode": schedule.academic_program.program.code,
        "promotion": schedule.academic_program.level,
        "academicYear": schedule.academic_year,
        "totalAmount": float(schedule.total_amount),
        "status": schedule.get_status_display(),
        "installments": [
            {
                "number": inst.installment_number,
                "amount": float(inst.amount),
                "dueDate": inst.due_date.strftime("%Y-%m-%d")
            }
            for inst in installments
        ]
    }


# ============================================================
# FEE SCHEDULE — SAUVEGARDE / SUPPRESSION (FORMULAIRE, LEGACY)
#
# Ancien endpoint basé sur des données de formulaire classiques
# (installment1_amount / installment2_amount / ...). Conservé
# pour compatibilité si un ancien formulaire l'utilise encore.
# Pour toute nouvelle intégration, préférez finance_schedule_save
# et finance_schedule_delete (JSON) plus bas.
# ============================================================

@login_required
@finance_required
@require_http_methods(["POST"])
def finance_schedule_save_legacy(request):
    """
    AJAX endpoint (formulaire classique) to create or update a fee
    schedule.
    """

    user = request.user

    schedule_id = request.POST.get('schedule_id', '')
    academic_year = request.POST.get('academic_year', ACADEMIC_YEAR)
    faculty_id = request.POST.get('faculty_id')
    department_id = request.POST.get('department_id')
    program_id = request.POST.get('program_id')
    promotion = request.POST.get('promotion')
    total_amount = request.POST.get('total_amount')
    status = request.POST.get('status', FeeSchedule.Status.ACTIF)
    installment1_amount = request.POST.get('installment1_amount')
    installment1_due_date = request.POST.get('installment1_due_date')
    installment2_amount = request.POST.get('installment2_amount')
    installment2_due_date = request.POST.get('installment2_due_date')

    errors = []

    if not faculty_id:
        errors.append("Veuillez sélectionner une faculté.")
    if not department_id:
        errors.append("Veuillez sélectionner un département.")
    if not program_id:
        errors.append("Veuillez sélectionner une spécialisation.")
    if not promotion:
        errors.append("Veuillez sélectionner une promotion.")
    if not total_amount or float(total_amount) <= 0:
        errors.append("Le montant annuel doit être supérieur à zéro.")
    if not installment1_amount or float(installment1_amount) <= 0:
        errors.append("Le montant de la tranche 1 doit être supérieur à zéro.")
    if not installment2_amount or float(installment2_amount) <= 0:
        errors.append("Le montant de la tranche 2 doit être supérieur à zéro.")
    if not installment1_due_date:
        errors.append("Veuillez définir la date limite de la tranche 1.")
    if not installment2_due_date:
        errors.append("Veuillez définir la date limite de la tranche 2.")

    if not errors:
        total = float(total_amount)
        inst1 = float(installment1_amount)
        inst2 = float(installment2_amount)
        if abs(total - (inst1 + inst2)) > 0.01:
            errors.append("La somme des deux tranches doit être exactement égale au montant annuel.")

    if not errors:
        try:
            date1 = datetime.strptime(installment1_due_date, '%Y-%m-%d').date()
            date2 = datetime.strptime(installment2_due_date, '%Y-%m-%d').date()
            if date2 <= date1:
                errors.append("La deuxième échéance doit être postérieure à la première.")
        except ValueError:
            errors.append("Format de date invalide.")

    if not errors:
        try:
            academic_program = AcademicProgram.objects.get(
                program_id=program_id,
                level=promotion,
                is_active=True
            )
        except AcademicProgram.DoesNotExist:
            errors.append("Ce programme académique n'existe pas.")
        else:
            existing = FeeSchedule.objects.filter(
                academic_program=academic_program,
                academic_year=academic_year
            )
            if schedule_id:
                existing = existing.exclude(id=schedule_id)
            if existing.exists():
                errors.append(
                    "Un échéancier existe déjà pour cette spécialisation, "
                    "cette promotion et cette année académique."
                )

    if errors:
        return JsonResponse({'success': False, 'errors': errors}, status=400)

    try:
        academic_program = AcademicProgram.objects.get(
            program_id=program_id,
            level=promotion,
            is_active=True
        )
    except AcademicProgram.DoesNotExist:
        return JsonResponse({'success': False, 'errors': ['Programme académique non trouvé.']}, status=400)

    try:
        if schedule_id:
            schedule = FeeSchedule.objects.get(id=schedule_id)
            schedule.academic_program = academic_program
            schedule.academic_year = academic_year
            schedule.total_amount = total_amount
            schedule.status = status
            schedule.save()
            message = "Échéancier modifié avec succès."
        else:
            schedule = FeeSchedule.objects.create(
                created_by=user,
                academic_program=academic_program,
                academic_year=academic_year,
                total_amount=total_amount,
                status=status,
            )
            message = "Échéancier créé avec succès."

        schedule.installments.all().delete()

        FeeInstallment.objects.create(
            fee_schedule=schedule,
            title="Tranche 1",
            amount=installment1_amount,
            due_date=installment1_due_date,
            installment_number=1,
        )
        FeeInstallment.objects.create(
            fee_schedule=schedule,
            title="Tranche 2",
            amount=installment2_amount,
            due_date=installment2_due_date,
            installment_number=2,
        )

        return JsonResponse({
            'success': True,
            'message': message,
            'schedule_id': schedule.id,
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'errors': [f"Erreur lors de l'enregistrement: {str(e)}"]
        }, status=500)


@login_required
@finance_required
@require_http_methods(["POST"])
def finance_schedule_delete_legacy(request):
    """
    AJAX endpoint (formulaire classique) to delete a fee schedule.
    """

    schedule_id = request.POST.get('schedule_id')

    if not schedule_id:
        return JsonResponse({'success': False, 'errors': ["ID de l'échéancier manquant."]}, status=400)

    try:
        schedule = FeeSchedule.objects.get(id=schedule_id)
        schedule.delete()
        return JsonResponse({
            'success': True,
            'message': 'Échéancier supprimé avec succès.',
        })
    except FeeSchedule.DoesNotExist:
        return JsonResponse({'success': False, 'errors': ['Échéancier non trouvé.']}, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'errors': [f"Erreur lors de la suppression: {str(e)}"]
        }, status=500)


# ============================================================
# FINANCE SCHEDULE — VUE LISTE
# ============================================================

@login_required
@finance_required
def finance_schedule(request):

    schedules_qs = FeeSchedule.objects.all().select_related(
        'academic_program__program__department__faculty'
    )

    schedules_data = [serialize_fee_schedule(s) for s in schedules_qs]

    context = {
        'academic_structure': json.dumps(serialize_academic_structure_flat()),
        'schedules': json.dumps(schedules_data),
    }
    return render(request, 'espace_finance/finance-schedule.html', context)


# ============================================================
# FEE SCHEDULE — SAUVEGARDE / SUPPRESSION (JSON, RECOMMANDÉ)
# ============================================================

@csrf_exempt
@login_required
@finance_required
@require_http_methods(["POST"])
def finance_schedule_save(request):
    """
    POST /finance/schedule/save/
    Creates a new fee schedule.
    """
    try:
        data = json.loads(request.body)

        academic_program = AcademicProgram.objects.get(
            program__code=data['programCode'],
            level=data['promotion']
        )

        if FeeSchedule.objects.filter(
            academic_program=academic_program,
            academic_year=data['academicYear']
        ).exists():
            return JsonResponse({
                "error": (
                    "Un échéancier existe déjà pour cette spécialisation, "
                    "cette promotion et cette année académique."
                )
            }, status=400)

        status_map = {
            'Actif': FeeSchedule.Status.ACTIF,
            'Brouillon': FeeSchedule.Status.BROUILLON,
            'Fermé': FeeSchedule.Status.CLOTUREE,
        }
        status = status_map.get(data['status'], FeeSchedule.Status.BROUILLON)

        schedule = FeeSchedule.objects.create(
            created_by=request.user,
            academic_program=academic_program,
            academic_year=data['academicYear'],
            total_amount=Decimal(str(data['totalAmount'])),
            status=status
        )

        for inst_data in data['installments']:
            FeeInstallment.objects.create(
                fee_schedule=schedule,
                title=f"Tranche {inst_data['number']}",
                amount=Decimal(str(inst_data['amount'])),
                due_date=datetime.strptime(inst_data['dueDate'], '%Y-%m-%d').date(),
                installment_number=inst_data['number']
            )

        return JsonResponse(serialize_fee_schedule(schedule), status=201)

    except AcademicProgram.DoesNotExist:
        return JsonResponse({
            "error": "Programme académique non trouvé."
        }, status=400)
    except KeyError as e:
        return JsonResponse({
            "error": f"Champ manquant: {str(e)}"
        }, status=400)
    except Exception as e:
        return JsonResponse({
            "error": str(e)
        }, status=400)


@csrf_exempt
@login_required
@finance_required
@require_http_methods(["POST"])
def finance_schedule_delete(request):
    """
    POST /finance/schedule/delete/
    Deletes a fee schedule.
    """
    try:
        data = json.loads(request.body)
        schedule_id = data.get('schedule_id')

        if not schedule_id:
            return JsonResponse({
                "error": "ID de l'échéancier manquant."
            }, status=400)

        schedule = get_object_or_404(FeeSchedule, id=schedule_id)
        schedule.delete()
        return JsonResponse({"success": True}, status=200)

    except json.JSONDecodeError as e:
        return JsonResponse({"error": f"Invalid JSON: {str(e)}"}, status=400)
    except FeeSchedule.DoesNotExist:
        return JsonResponse({"error": "Échéancier non trouvé."}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=400)


# ============================================================
# FINANCE STUDENTS — SITUATIONS FINANCIÈRES
# ============================================================

STUDENT_LEVEL_ORDER = [
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


def _student_level_rank(level):
    try:
        return STUDENT_LEVEL_ORDER.index(level)
    except ValueError:
        return len(STUDENT_LEVEL_ORDER)


def _student_safe_json(data):
    """
    Sérialise en JSON pour injection directe dans un tag <script>.
    Échappe les séquences "</" pour éviter toute fermeture prématurée
    du tag si une valeur textuelle (nom, référence...) en contient.
    """
    return json.dumps(data, cls=DjangoJSONEncoder).replace("</", "<\\/")


def get_student_validated_payments(student, academic_year=None):
    """
    Retourne les paiements validés (Payment.status == PAID) d'un
    étudiant, triés du plus récent au plus ancien.
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


def get_student_fee_schedule(academic_program, academic_year):
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
                queryset=FeeInstallment.objects.order_by("installment_number"),
            )
        )
        .first()
    )


def get_student_required_amount(installments, reference_dt):
    total = ZERO
    for installment in installments:
        due = timezone.make_aware(
            datetime.combine(installment.due_date, time(23, 59, 59))
        )
        if due <= reference_dt:
            total += installment.amount
    return total


def calculate_student_situation(student, academic_year, reference_dt):
    """
    Calcule la situation financière complète d'un étudiant pour une
    année académique donnée (échéancier, exigible, payé, retard).
    """
    academic_program = student.academic_program
    faculty = student.faculty
    department = student.department
    program = academic_program.program if academic_program else None

    schedule = get_student_fee_schedule(academic_program, academic_year)
    installments = list(schedule.installments.all()) if schedule else []

    payments = get_student_validated_payments(student, academic_year=academic_year)
    paid_amount = sum((p.amount for p in payments), ZERO)

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
            "annual_amount": ZERO,
            "required_amount": ZERO,
            "paid_amount": paid_amount,
            "annual_remaining": ZERO,
            "overdue_amount": ZERO,
            "status": "Non configuré",
        }

    annual_amount = schedule.total_amount
    required_amount = get_student_required_amount(installments, reference_dt)
    annual_remaining = max(annual_amount - paid_amount, ZERO)
    overdue_amount = max(required_amount - paid_amount, ZERO)

    if overdue_amount > ZERO:
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


def calculate_all_student_situations(academic_year, reference_dt, students=None):
    if students is None:
        students = (
            User.objects.filter(
                role=User.Role.STUDENT,
                is_active=True,
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
        calculate_student_situation(student, academic_year, reference_dt)
        for student in students
    ]


def _student_payment_bank_name(payment):
    claim = payment.claim
    if claim and claim.bank_transaction and claim.bank_transaction.bank_account:
        return claim.bank_transaction.bank_account.bank.name
    if claim and claim.bank:
        return claim.bank.name
    return None


def _student_payment_reference(payment):
    claim = payment.claim
    if claim and claim.bank_transaction:
        return claim.bank_transaction.transaction_reference
    if claim:
        return claim.submitted_reference
    return None


def serialize_student_situation(situation, detailed=False):
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
                else situation.get("academic_year", ACADEMIC_YEAR),
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
                "bankName": _student_payment_bank_name(payment),
                "reference": _student_payment_reference(payment),
            }
            for payment in situation["payments"]
        ]

    return data


def serialize_student_academic_structure():
    """
    Référentiel académique à plat (id + clés étrangères) pour les
    filtres en cascade de la page Situations financières.
    """
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

    academic_programs.sort(
        key=lambda ap: (ap.program_id, _student_level_rank(ap.level))
    )

    return {
        "faculties": [{"id": f.id, "name": f.name} for f in faculties],
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


def _student_bootstrap_payload(academic_year, reference_dt, situations_json):
    banks = list(Bank.objects.filter(is_active=True).order_by("name"))

    return {
        "payload": {
            "academicYear": academic_year,
            "referenceDate": reference_dt.isoformat(),
            "situations": situations_json,
            "academicStructure": serialize_student_academic_structure(),
            "banks": [{"id": b.id, "name": b.name} for b in banks],
        },
        "banks": banks,
    }


STUDENT_ACADEMIC_YEAR_CHOICES = [year for year, _ in ACADEMIC_YEAR_CHOICES]


# ============================================================
# VUE — LISTE DES SITUATIONS FINANCIÈRES
# ============================================================

@login_required
@finance_required
def finance_students(request):
    academic_year = request.GET.get("academic_year") or ACADEMIC_YEAR
    reference_dt = build_reference_datetime()

    situations = calculate_all_student_situations(academic_year, reference_dt)
    situations_json = [serialize_student_situation(s) for s in situations]

    bootstrap = _student_bootstrap_payload(
        academic_year, reference_dt, situations_json
    )

    context = {
        "academic_year": academic_year,
        "academic_year_choices": STUDENT_ACADEMIC_YEAR_CHOICES,
        "banks": bootstrap["banks"],
        "bootstrap_data": _student_safe_json(bootstrap["payload"]),
        "open_student_id": None,
        "pending_anomalies": PaymentAnomaly.objects.filter(
            status=PaymentAnomaly.Status.OPEN
        ).count(),
        "current_academic_year": ACADEMIC_YEAR,
    }

    return render(request, "espace_finance/finance-students.html", context)


# ============================================================
# VUE — FICHE INDIVIDUELLE (page dédiée, modale pré-ouverte)
# ============================================================

@login_required
@finance_required
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

    academic_year = request.GET.get("academic_year") or ACADEMIC_YEAR
    reference_dt = build_reference_datetime()

    situations = calculate_all_student_situations(academic_year, reference_dt)
    situations_json = [serialize_student_situation(s) for s in situations]

    student_situation = calculate_student_situation(
        student, academic_year, reference_dt
    )
    detailed_json = serialize_student_situation(student_situation, detailed=True)

    for item in situations_json:
        if item["student"]["id"] == student.id:
            item["installments"] = detailed_json["installments"]
            item["payments"] = detailed_json["payments"]
            break

    bootstrap = _student_bootstrap_payload(
        academic_year, reference_dt, situations_json
    )

    context = {
        "academic_year": academic_year,
        "academic_year_choices": STUDENT_ACADEMIC_YEAR_CHOICES,
        "banks": bootstrap["banks"],
        "bootstrap_data": _student_safe_json(bootstrap["payload"]),
        "open_student_id": student.id,
        "pending_anomalies": PaymentAnomaly.objects.filter(
            status=PaymentAnomaly.Status.OPEN
        ).count(),
        "current_academic_year": ACADEMIC_YEAR,
    }

    return render(request, "espace_finance/finance-students.html", context)


# ============================================================
# EXPORT CSV (respecte les filtres actifs, passés en query params)
# ============================================================

def _student_apply_query_filters(situations, request):
    faculty_id = request.GET.get("faculty") or ""
    department_id = request.GET.get("department") or ""
    program_id = request.GET.get("program") or ""
    academic_program_id = request.GET.get("academic_program") or ""
    status = request.GET.get("status") or ""
    bank = request.GET.get("bank") or ""
    search = (request.GET.get("q") or "").strip().lower()

    def matches(situation):
        if faculty_id and (
            not situation["faculty"] or str(situation["faculty"].id) != faculty_id
        ):
            return False

        if department_id and (
            not situation["department"]
            or str(situation["department"].id) != department_id
        ):
            return False

        if program_id and (
            not situation["program"] or str(situation["program"].id) != program_id
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
                _student_payment_bank_name(p) for p in situation["payments"]
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
                                    _student_payment_reference(p)
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
@finance_required
def finance_students_export_csv(request):
    academic_year = request.GET.get("academic_year") or ACADEMIC_YEAR
    reference_dt = build_reference_datetime()

    situations = calculate_all_student_situations(academic_year, reference_dt)
    situations = _student_apply_query_filters(situations, request)

    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = (
        f'attachment; filename="situations-financieres-{academic_year}.csv"'
    )
    response.write("\ufeff")

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


# ============================================================
# FINANCE RECONCILIATION — RAPPROCHEMENT GLOBAL
# ============================================================

RECONCILIATION_ACADEMIC_YEAR_CHOICES = [year for year, _ in ACADEMIC_YEAR_CHOICES]

RECONCILIATION_STATUS_LABELS = {
    "matched": "Rapproché",
    "amount_mismatch": "Écart de montant",
    "bank_only": "Banque uniquement",
    "system_only": "AcademicPay uniquement",
}


def _reconciliation_safe_json(data):
    """
    Sérialise en JSON pour injection directe dans un tag <script>.
    Échappe les séquences "</" pour éviter toute fermeture prématurée
    du tag si une valeur textuelle en contient.
    """
    return json.dumps(data, cls=DjangoJSONEncoder).replace("</", "<\\/")


def _reconciliation_academic_year_range(academic_year):
    start_year, end_year = academic_year.split("-")
    start_date = datetime(int(start_year), 7, 1)
    end_date = datetime(int(end_year), 6, 30, 23, 59, 59)
    return start_date, end_date


def build_reconciliation_items(academic_year):
    """
    Compare les BankTransaction de l'année académique donnée avec
    les PaymentClaim approuvées et vérifiées de la même année, et
    construit une liste d'items de rapprochement — un par
    transaction bancaire (matched / amount_mismatch / bank_only)
    plus un par claim sans transaction bancaire (system_only).

    Reproduit la logique déjà en place dans l'ancienne vue
    finance_reconciliation, avec les mêmes règles de statut.
    """
    start_date, end_date = _reconciliation_academic_year_range(academic_year)

    bank_transactions = (
        BankTransaction.objects.select_related(
            "bank_account", "bank_account__bank"
        )
        .filter(
            bank_account__is_active=True,
            payment_date__range=[start_date, end_date],
        )
        .order_by("-payment_date")
    )

    claims = (
        PaymentClaim.objects.select_related("student", "bank", "bank_transaction")
        .filter(
            academic_year=academic_year,
            status=PaymentClaim.ClaimStatus.APPROVED,
            is_verified=True,
        )
    )

    claims_by_transaction_id = {
        claim.bank_transaction_id: claim
        for claim in claims
        if claim.bank_transaction_id
    }

    items = []

    for tx in bank_transactions:
        claim = claims_by_transaction_id.get(tx.id)

        if claim:
            if claim.amount != tx.amount:
                status = "amount_mismatch"
                difference = abs(claim.amount - tx.amount)
            else:
                status = "matched"
                difference = ZERO

            items.append({
                "id": f"tx-{tx.id}",
                "date": tx.payment_date.date(),
                "reference": tx.transaction_reference,
                "bankCode": tx.bank_account.bank.code,
                "bankName": tx.bank_account.bank.name,
                "bankAmount": tx.amount,
                "systemAmount": claim.amount,
                "difference": difference,
                "student": claim.student.full_congolese_name,
                "matricule": claim.student.registration_num or "",
                "status": status,
                "claimId": claim.id,
            })
        else:
            items.append({
                "id": f"tx-{tx.id}",
                "date": tx.payment_date.date(),
                "reference": tx.transaction_reference,
                "bankCode": tx.bank_account.bank.code,
                "bankName": tx.bank_account.bank.name,
                "bankAmount": tx.amount,
                "systemAmount": ZERO,
                "difference": tx.amount,
                "student": "",
                "matricule": "",
                "status": "bank_only",
                "claimId": None,
            })

    for claim in claims:
        if not claim.bank_transaction_id:
            items.append({
                "id": f"claim-{claim.id}",
                "date": claim.payment_date.date(),
                "reference": claim.submitted_reference,
                "bankCode": claim.bank.code,
                "bankName": claim.bank.name,
                "bankAmount": ZERO,
                "systemAmount": claim.amount,
                "difference": claim.amount,
                "student": claim.student.full_congolese_name,
                "matricule": claim.student.registration_num or "",
                "status": "system_only",
                "claimId": claim.id,
            })

    items.sort(key=lambda item: item["date"], reverse=True)

    return items


def serialize_reconciliation_item(item):
    return {
        "id": item["id"],
        "date": item["date"].isoformat(),
        "reference": item["reference"],
        "bank": {"code": item["bankCode"], "name": item["bankName"]},
        "bankAmount": str(item["bankAmount"]),
        "systemAmount": str(item["systemAmount"]),
        "difference": str(item["difference"]),
        "student": item["student"],
        "matricule": item["matricule"],
        "status": item["status"],
        "statusLabel": RECONCILIATION_STATUS_LABELS.get(
            item["status"], item["status"]
        ),
        "claimId": item["claimId"],
    }


def build_reconciliation_bank_summary(items, banks):
    """
    Agrège les items de rapprochement par banque : montant banque,
    montant système, écart, taux de couverture, nb transactions,
    nb anomalies (tout ce qui n'est pas "matched").
    """
    by_code = {
        bank.code: {
            "code": bank.code,
            "name": bank.name,
            "bankAmount": ZERO,
            "systemAmount": ZERO,
            "transactions": 0,
            "anomalies": 0,
        }
        for bank in banks
    }

    for item in items:
        code = item["bankCode"]

        if code not in by_code:
            by_code[code] = {
                "code": code,
                "name": item["bankName"],
                "bankAmount": ZERO,
                "systemAmount": ZERO,
                "transactions": 0,
                "anomalies": 0,
            }

        entry = by_code[code]
        entry["bankAmount"] += item["bankAmount"]
        entry["systemAmount"] += item["systemAmount"]
        entry["transactions"] += 1

        if item["status"] != "matched":
            entry["anomalies"] += 1

    summary = []

    for entry in by_code.values():
        difference = abs(entry["bankAmount"] - entry["systemAmount"])
        coverage = (
            (entry["systemAmount"] / entry["bankAmount"] * Decimal("100"))
            if entry["bankAmount"] > ZERO
            else ZERO
        )

        summary.append({
            "code": entry["code"],
            "name": entry["name"],
            "bankAmount": str(entry["bankAmount"]),
            "systemAmount": str(entry["systemAmount"]),
            "difference": str(difference),
            "coverage": str(coverage.quantize(Decimal("0.1"))),
            "transactions": entry["transactions"],
            "anomalies": entry["anomalies"],
        })

    summary.sort(key=lambda entry: entry["name"])

    return summary


def _reconciliation_bootstrap_payload(academic_year):
    items = build_reconciliation_items(academic_year)
    items_json = [serialize_reconciliation_item(item) for item in items]

    banks = list(Bank.objects.filter(is_active=True).order_by("name"))
    bank_summary = build_reconciliation_bank_summary(items, banks)

    total_bank_amount = sum((item["bankAmount"] for item in items), ZERO)
    total_system_amount = sum((item["systemAmount"] for item in items), ZERO)
    total_difference = abs(total_bank_amount - total_system_amount)

    coverage_rate = (
        (total_system_amount / total_bank_amount * Decimal("100"))
        if total_bank_amount > ZERO
        else ZERO
    )

    matched_count = sum(1 for item in items if item["status"] == "matched")
    anomaly_count = sum(1 for item in items if item["status"] != "matched")

    return {
        "academicYear": academic_year,
        "items": items_json,
        "banks": [{"code": b.code, "name": b.name} for b in banks],
        "bankSummary": bank_summary,
        "kpi": {
            "totalBankAmount": str(total_bank_amount),
            "totalSystemAmount": str(total_system_amount),
            "totalDifference": str(total_difference),
            "coverageRate": str(coverage_rate.quantize(Decimal("0.1"))),
            "matchedCount": matched_count,
            "anomalyCount": anomaly_count,
            "bankCount": len(banks),
        },
    }, banks


# ============================================================
# VUE — RAPPROCHEMENT GLOBAL
# ============================================================

@login_required
@finance_required
def finance_reconciliation(request):
    academic_year = request.GET.get("academic_year") or ACADEMIC_YEAR

    payload, banks = _reconciliation_bootstrap_payload(academic_year)

    context = {
        "academic_year": academic_year,
        "academic_year_choices": RECONCILIATION_ACADEMIC_YEAR_CHOICES,
        "banks": banks,
        "bootstrap_data": _reconciliation_safe_json(payload),
        "pending_anomalies": PaymentAnomaly.objects.filter(
            status=PaymentAnomaly.Status.OPEN
        ).count(),
        "current_academic_year": ACADEMIC_YEAR,
    }

    return render(request, "espace_finance/finance-reconciliation.html", context)
# ============================================================
# FINANCE ANOMALIES
# ============================================================

ANOMALY_HIGH_PRIORITY_TYPES = [
    PaymentAnomaly.Type.REFERENCE_NOT_FOUND,
    PaymentAnomaly.Type.REFERENCE_ALREADY_USED,
    PaymentAnomaly.Type.DUPLICATE_CLAIM,
]

ANOMALY_MEDIUM_PRIORITY_TYPES = [
    PaymentAnomaly.Type.AMOUNT_MISMATCH,
    PaymentAnomaly.Type.BANK_MISMATCH,
]

ANOMALY_LOW_PRIORITY_TYPES = [
    PaymentAnomaly.Type.DATE_MISMATCH,
    PaymentAnomaly.Type.OTHER,
]

ANOMALY_TYPE_FILTER_MAP = {
    'difference': PaymentAnomaly.Type.AMOUNT_MISMATCH,
    'unassigned': PaymentAnomaly.Type.REFERENCE_NOT_FOUND,
    'missing': PaymentAnomaly.Type.REFERENCE_NOT_FOUND,
    'duplicate': PaymentAnomaly.Type.REFERENCE_ALREADY_USED,
}


@login_required
@finance_required
def finance_anomalies(request):
    """
    View for anomalies management.
    Charge toutes les anomalies de l'année académique active et les
    injecte en JSON dans le template (filtrage/recherche entièrement
    côté client, comme les autres pages finance).
    """

    academic_year = request.GET.get("academic_year") or ACADEMIC_YEAR

    anomalies = (
        PaymentAnomaly.objects.select_related(
            "claim",
            "claim__student",
            "claim__bank",
            "claim__bank_transaction",
        )
        .filter(claim__academic_year=academic_year)
        .order_by("-created_at")
    )

    banks = Bank.objects.filter(is_active=True).order_by("name")

    anomalies_data = []

    for anomaly in anomalies:

        if anomaly.anomaly_type in ANOMALY_HIGH_PRIORITY_TYPES:
            priority = "high"
            priority_label = "Élevée"
        elif anomaly.anomaly_type in ANOMALY_MEDIUM_PRIORITY_TYPES:
            priority = "medium"
            priority_label = "Moyenne"
        else:
            priority = "low"
            priority_label = "Faible"

        if anomaly.anomaly_type == PaymentAnomaly.Type.REFERENCE_NOT_FOUND:
            type_value = "missing"
            type_label = "Référence introuvable"
        elif anomaly.anomaly_type == PaymentAnomaly.Type.AMOUNT_MISMATCH:
            type_value = "difference"
            type_label = "Montant incohérent"
        elif anomaly.anomaly_type == PaymentAnomaly.Type.REFERENCE_ALREADY_USED:
            type_value = "duplicate"
            type_label = "Doublon détecté"
        else:
            type_value = "other"
            type_label = anomaly.get_anomaly_type_display()

        if anomaly.status == PaymentAnomaly.Status.RESOLVED:
            status_value = "resolved"
        elif anomaly.description and "en cours" in anomaly.description.lower():
            status_value = "processing"
        else:
            status_value = "pending"

        claim = anomaly.claim
        student = claim.student
        bank = claim.bank
        bank_transaction = claim.bank_transaction

        anomalies_data.append({
            "id": anomaly.id,
            "student": student.full_congolese_name,
            "matricule": student.registration_num or "Sans ID",
            "reference": claim.submitted_reference,
            "bank": {
                "code": bank.code if bank else "",
                "name": bank.name if bank else "—",
            },
            "type": type_value,
            "typeLabel": type_label,
            "amount": str(claim.amount),
            "priority": priority,
            "priorityLabel": priority_label,
            "status": status_value,
            "date": anomaly.created_at.strftime("%d/%m/%Y"),
            "time": anomaly.created_at.strftime("%H:%M"),
            "description": anomaly.description or "Aucune description fournie.",
            "note": anomaly.description or "",
            "claimId": claim.id,
            "bankReference": (
                bank_transaction.transaction_reference
                if bank_transaction
                else "—"
            ),
            "bankAmount": (
                str(bank_transaction.amount) if bank_transaction else None
            ),
        })

    type_counts = {
        "difference": sum(1 for a in anomalies_data if a["type"] == "difference" and a["status"] != "resolved"),
        "unassigned": sum(1 for a in anomalies_data if a["type"] == "missing" and a["status"] != "resolved"),
        "missing": sum(1 for a in anomalies_data if a["type"] == "missing" and a["status"] != "resolved"),
        "duplicate": sum(1 for a in anomalies_data if a["type"] == "duplicate" and a["status"] != "resolved"),
    }

    kpi = {
        "total": len(anomalies_data),
        "pending": sum(1 for a in anomalies_data if a["status"] == "pending"),
        "processing": sum(1 for a in anomalies_data if a["status"] == "processing"),
        "resolved": sum(1 for a in anomalies_data if a["status"] == "resolved"),
    }

    bootstrap_payload = {
        "academicYear": academic_year,
        "anomalies": anomalies_data,
        "banks": [{"code": b.code, "name": b.name} for b in banks],
        "typeCounts": type_counts,
        "kpi": kpi,
    }

    context = {
        "academic_year": academic_year,
        "academic_year_choices": [year for year, _ in ACADEMIC_YEAR_CHOICES],
        "banks": banks,
        "bootstrap_data": json.dumps(
            bootstrap_payload, cls=DjangoJSONEncoder
        ).replace("</", "<\\/"),
        "pending_anomalies": kpi["pending"] + kpi["processing"],
        "current_academic_year": ACADEMIC_YEAR,
    }

    return render(request, "espace_finance/finance-anomalies.html", context)
# ============================================================
# UPDATE ANOMALY (AJAX)
# ============================================================

@login_required
@finance_required
@require_http_methods(["POST"])
def finance_anomaly_update(request):
    """
    AJAX endpoint to update an anomaly (status and note).
    """

    anomaly_id = request.POST.get('anomaly_id')
    status = request.POST.get('status')
    note = request.POST.get('note', '').strip()

    errors = []

    if not anomaly_id:
        errors.append("ID de l'anomalie manquant.")

    if not status:
        errors.append("Statut manquant.")

    if errors:
        return JsonResponse({'success': False, 'errors': errors}, status=400)

    try:
        anomaly = PaymentAnomaly.objects.select_related('claim').get(id=anomaly_id)
    except PaymentAnomaly.DoesNotExist:
        return JsonResponse({'success': False, 'errors': ['Anomalie non trouvée.']}, status=404)

    status_mapping = {
        'pending': PaymentAnomaly.Status.OPEN,
        'processing': PaymentAnomaly.Status.OPEN,
        'resolved': PaymentAnomaly.Status.RESOLVED,
    }

    if status not in status_mapping:
        return JsonResponse({'success': False, 'errors': ['Statut invalide.']}, status=400)

    try:
        if status == 'resolved':
            anomaly.status = PaymentAnomaly.Status.RESOLVED
            anomaly.resolved_at = timezone.now()
        else:
            anomaly.status = PaymentAnomaly.Status.OPEN
            if status == 'processing':
                note = f"En cours de traitement. {note}" if note else "En cours de traitement."

        if note:
            timestamp = timezone.now().strftime('%d/%m/%Y %H:%M')
            current_desc = anomaly.description or ''
            if current_desc:
                anomaly.description = f"{current_desc}\n\n[{timestamp}] {note}"
            else:
                anomaly.description = f"[{timestamp}] {note}"

        anomaly.save()

        if status == 'resolved':
            claim = anomaly.claim
            open_anomalies = PaymentAnomaly.objects.filter(
                claim=claim,
                status=PaymentAnomaly.Status.OPEN
            ).count()

            if open_anomalies == 0:
                claim.status = PaymentClaim.ClaimStatus.APPROVED
                claim.is_verified = True
                claim.save()

        return JsonResponse({
            'success': True,
            'message': 'Anomalie mise à jour avec succès.',
            'status_display': 'Résolue' if status == 'resolved' else ('En cours' if status == 'processing' else 'À traiter'),
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'errors': [f"Erreur lors de la mise à jour: {str(e)}"]
        }, status=500)


# ============================================================
# FINANCE REPORTS
# ============================================================

REPORTS_ACADEMIC_YEAR_CHOICES = [year for year, _ in ACADEMIC_YEAR_CHOICES]


def _reports_safe_json(data):
    """
    Sérialise en JSON pour injection directe dans un tag <script>.
    Échappe les séquences "</" pour éviter toute fermeture prématurée
    du tag si une valeur textuelle en contient.
    """
    return json.dumps(data, cls=DjangoJSONEncoder).replace("</", "<\\/")


def build_reports_revenue_series(academic_year):
    """
    Montants encaissés (Payment validés) et attendus (FeeSchedule,
    répartis sur 12 mois) pour les 11 derniers mois glissants,
    pour le graphique "Évolution des recettes".
    """
    today = timezone.now().date()

    total_expected = FeeSchedule.objects.filter(
        academic_year=academic_year,
        status=FeeSchedule.Status.ACTIF,
    ).aggregate(total=Sum("total_amount"))["total"] or ZERO

    monthly_expected = (total_expected / 12) if total_expected > 0 else ZERO

    labels = []
    collected_values = []
    expected_values = []

    for i in range(10, -1, -1):

        month_date = today.replace(day=1) - timedelta(days=i * 30)
        month_start = month_date.replace(day=1)

        if month_date.month == 12:
            month_end = month_date.replace(year=month_date.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            month_end = month_date.replace(month=month_date.month + 1, day=1) - timedelta(days=1)

        monthly_collected = (
            Payment.objects.filter(
                academic_year=academic_year,
                status=Payment.Status.PAID,
                payment_date__date__gte=month_start,
                payment_date__date__lte=month_end,
            ).aggregate(total=Sum("amount"))["total"]
            or ZERO
        )

        labels.append(month_start.strftime("%b"))
        collected_values.append(float(monthly_collected))
        expected_values.append(float(monthly_expected))

    return {
        "labels": labels,
        "collected": collected_values,
        "expected": expected_values,
    }


def build_reports_bank_data(academic_year):
    """
    Un enregistrement par banque : encaissé (Payment), montant
    système (PaymentClaim), attendu (part de l'échéancier total,
    répartie au prorata des transactions bancaires), nombre de
    transactions, anomalies ouvertes, taux de rapprochement.
    """
    banks = Bank.objects.filter(is_active=True).order_by("name")

    payments = Payment.objects.filter(
        academic_year=academic_year, status=Payment.Status.PAID
    )
    claims = PaymentClaim.objects.filter(academic_year=academic_year)

    total_expected = FeeSchedule.objects.filter(
        academic_year=academic_year,
        status=FeeSchedule.Status.ACTIF,
    ).aggregate(total=Sum("total_amount"))["total"] or ZERO

    bank_data = {}
    total_transactions_all_banks = 0

    bank_transaction_counts = {}

    for bank in banks:

        bank_payments = payments.filter(claim__bank=bank)
        bank_claims = claims.filter(bank=bank)

        collected = bank_payments.aggregate(total=Sum("amount"))["total"] or ZERO
        system_amount = bank_claims.aggregate(total=Sum("amount"))["total"] or ZERO

        transaction_count = BankTransaction.objects.filter(
            bank_account__bank=bank,
        ).count()

        matched_count = bank_claims.filter(bank_transaction__isnull=False).count()

        reconciliation_rate = (
            (Decimal(matched_count) / Decimal(transaction_count) * Decimal("100"))
            if transaction_count > 0
            else ZERO
        )

        open_anomalies = PaymentAnomaly.objects.filter(
            claim__bank=bank,
            claim__academic_year=academic_year,
            status=PaymentAnomaly.Status.OPEN,
        ).count()

        bank_transaction_counts[bank.code] = transaction_count
        total_transactions_all_banks += transaction_count

        bank_data[bank.code] = {
            "name": bank.name,
            "collected": collected,
            "system": system_amount,
            "expected": ZERO,  # complété ci-dessous, au prorata
            "transactions": transaction_count,
            "anomalies": open_anomalies,
            "reconciliation": reconciliation_rate.quantize(Decimal("0.1")),
        }

    if total_transactions_all_banks > 0 and total_expected > 0:
        for code, data in bank_data.items():
            share = Decimal(bank_transaction_counts[code]) / Decimal(total_transactions_all_banks)
            data["expected"] = (total_expected * share).quantize(Decimal("0.01"))

    return bank_data


def build_reports_faculty_data(academic_year):
    """
    Un enregistrement par faculté (clé = id de la faculté, pour
    rester cohérent avec le filtre "Faculté" alimenté par
    serialize_student_academic_structure) : nb étudiants, montant
    attendu (FeeSchedule des programmes de la faculté), montant
    payé.
    """
    faculties = Faculty.objects.filter(is_active=True).order_by("name")

    fee_schedules = FeeSchedule.objects.filter(
        academic_year=academic_year,
        status=FeeSchedule.Status.ACTIF,
    )

    payments = Payment.objects.filter(
        academic_year=academic_year, status=Payment.Status.PAID
    )

    faculty_data = {}

    for faculty in faculties:

        faculty_students = User.objects.filter(
            role=User.Role.STUDENT,
            is_active=True,
            academic_program__program__department__faculty=faculty,
        )

        faculty_payments = payments.filter(student__in=faculty_students)
        collected = faculty_payments.aggregate(total=Sum("amount"))["total"] or ZERO

        expected = fee_schedules.filter(
            academic_program__program__department__faculty=faculty
        ).aggregate(total=Sum("total_amount"))["total"] or ZERO

        faculty_data[str(faculty.id)] = {
            "name": faculty.name,
            "students": faculty_students.count(),
            "expected": expected,
            "collected": collected,
        }

    return faculty_data


def _reports_bootstrap_payload(academic_year):

    bank_data = build_reports_bank_data(academic_year)
    faculty_data = build_reports_faculty_data(academic_year)
    revenue = build_reports_revenue_series(academic_year)

    total_collected = sum((b["collected"] for b in bank_data.values()), ZERO)
    total_expected = sum((b["expected"] for b in bank_data.values()), ZERO)

    total_transactions = sum(b["transactions"] for b in bank_data.values())
    total_matched = sum(
        round(b["transactions"] * float(b["reconciliation"]) / 100)
        for b in bank_data.values()
    )

    open_anomalies = PaymentAnomaly.objects.filter(
        claim__academic_year=academic_year,
        status=PaymentAnomaly.Status.OPEN,
    ).count()

    missing_references = PaymentAnomaly.objects.filter(
        claim__academic_year=academic_year,
        anomaly_type=PaymentAnomaly.Type.REFERENCE_NOT_FOUND,
        status=PaymentAnomaly.Status.OPEN,
    ).count()

    amount_mismatches = PaymentAnomaly.objects.filter(
        claim__academic_year=academic_year,
        anomaly_type=PaymentAnomaly.Type.AMOUNT_MISMATCH,
        status=PaymentAnomaly.Status.OPEN,
    ).count()

    return {
        "academicYear": academic_year,
        "banks": {
            code: {
                "name": data["name"],
                "collected": str(data["collected"]),
                "system": str(data["system"]),
                "expected": str(data["expected"]),
                "transactions": data["transactions"],
                "anomalies": data["anomalies"],
                "reconciliation": str(data["reconciliation"]),
            }
            for code, data in bank_data.items()
        },
        "faculties": {
            code: {
                "name": data["name"],
                "students": data["students"],
                "expected": str(data["expected"]),
                "collected": str(data["collected"]),
            }
            for code, data in faculty_data.items()
        },
        "revenue": revenue,
        "kpi": {
            "totalCollected": str(total_collected),
            "totalExpected": str(total_expected),
            "totalTransactions": total_transactions,
            "totalMatched": total_matched,
            "openAnomalies": open_anomalies,
            "missingReferences": missing_references,
            "amountMismatches": amount_mismatches,
        },
    }


@login_required
@finance_required
def finance_reports(request):
    """
    View for financial reports. Charge l'intégralité des données de
    l'année académique active (banques, facultés, courbe de
    recettes) en une fois ; les filtres banque/faculté/période
    s'appliquent ensuite entièrement côté client, sur les données
    déjà chargées.
    """
    academic_year = request.GET.get("academic_year") or ACADEMIC_YEAR

    payload = _reports_bootstrap_payload(academic_year)
    academic_structure = serialize_student_academic_structure()

    context = {
        "academic_year": academic_year,
        "academic_year_choices": REPORTS_ACADEMIC_YEAR_CHOICES,
        "banks": Bank.objects.filter(is_active=True).order_by("name"),
        "faculties": Faculty.objects.filter(is_active=True).order_by("name"),
        "bootstrap_data": _reports_safe_json({
            "report": payload,
            "academicStructure": academic_structure,
        }),
        "pending_anomalies": PaymentAnomaly.objects.filter(
            status=PaymentAnomaly.Status.OPEN
        ).count(),
        "current_academic_year": ACADEMIC_YEAR,
    }

    return render(request, "espace_finance/finance-reports.html", context)
# ============================================================
# EXPORT REPORT CSV
# ============================================================

@login_required
@finance_required
def finance_export_report(request):
    """
    Export financial report as CSV.
    """

    academic_year = request.GET.get('academic_year', ACADEMIC_YEAR)

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="rapport-financier-{academic_year}.csv"'

    writer = csv.writer(response)

    writer.writerow(['RAPPORT FINANCIER ACADEMICPAY'])
    writer.writerow([])
    writer.writerow(['Année académique', academic_year])
    writer.writerow(["Date d'exportation", timezone.now().strftime('%d/%m/%Y %H:%M')])
    writer.writerow([])

    writer.writerow(['INDICATEURS CLÉS'])

    payments = Payment.objects.filter(academic_year=academic_year, status=Payment.Status.PAID)
    total_collected = payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')

    fee_schedules = FeeSchedule.objects.filter(academic_year=academic_year, status=FeeSchedule.Status.ACTIF)
    total_expected = fee_schedules.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')

    recovery_rate = 0
    if total_expected > 0:
        recovery_rate = (total_collected / total_expected) * 100

    writer.writerow(['Total encaissé', f'{float(total_collected):,.2f} $'])
    writer.writerow(['Taux de recouvrement', f'{float(recovery_rate):.1f} %'])
    writer.writerow([])

    writer.writerow(['PERFORMANCE DES BANQUES'])
    writer.writerow(['Banque', 'Extrait bancaire', 'AcademicPay', 'Écart', 'Transactions', 'Anomalies', 'Rapprochement'])

    banks = Bank.objects.filter(is_active=True)
    for bank in banks:
        bank_payments = payments.filter(claim__bank=bank)
        bank_collected = bank_payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        if bank_collected > 0:
            writer.writerow([
                bank.name,
                f'{float(bank_collected):,.2f} $',
                f'{float(bank_collected):,.2f} $',
                '0',
                bank_payments.count(),
                0,
                '100.0%'
            ])

    writer.writerow([])

    writer.writerow(['SITUATION PAR FACULTÉ'])
    writer.writerow(['Faculté', 'Étudiants', 'Montant attendu', 'Montant payé', 'Reste', 'Recouvrement'])

    faculties = Faculty.objects.filter(is_active=True)
    for faculty in faculties:
        faculty_students = User.objects.filter(
            role=User.Role.STUDENT,
            academic_program__program__department__faculty=faculty,
            is_active=True
        )

        faculty_payments = payments.filter(student__in=faculty_students)
        faculty_collected = faculty_payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')

        faculty_expected = fee_schedules.filter(
            academic_program__program__department__faculty=faculty
        ).aggregate(total=Sum('total_amount'))['total'] or Decimal('0')

        faculty_rate = 0
        if faculty_expected > 0:
            faculty_rate = (faculty_collected / faculty_expected) * 100

        if faculty_collected > 0 or faculty_expected > 0:
            writer.writerow([
                faculty.name,
                faculty_students.count(),
                f'{float(faculty_expected):,.2f} $',
                f'{float(faculty_collected):,.2f} $',
                f'{float(faculty_expected - faculty_collected):,.2f} $',
                f'{float(faculty_rate):.1f} %'
            ])

    return response


# ============================================================
# FINANCE HISTORY
# ============================================================

def _history_safe_json(data):
    """
    Sérialise en JSON pour injection directe dans un tag <script>.
    Échappe les séquences "</" pour éviter toute fermeture prématurée
    du tag si une valeur textuelle en contient.
    """
    return json.dumps(data, cls=DjangoJSONEncoder).replace("</", "<\\/")


def build_history_entries(academic_year):
    """
    Construit le journal d'audit à partir de plusieurs modèles :
    déclarations soumises, paiements auto-approuvés (rapprochement
    automatique), extraits importés, échéanciers créés, anomalies
    (ouvertes ou résolues), vérifications de situation. Reproduit
    exactement la logique déjà en place dans l'ancienne vue
    finance_history.
    """
    history_entries = []

    claims = PaymentClaim.objects.select_related(
        'student', 'bank'
    ).filter(
        academic_year=academic_year
    ).order_by('-created_at')

    for claim in claims:
        history_entries.append({
            'id': f"CLM-{claim.id:05d}",
            'date': claim.created_at,
            'actor': 'student',
            'actor_display': claim.student.full_congolese_name,
            'module': 'payment',
            'module_display': 'Paiements',
            'action': 'create',
            'action_display': 'Création',
            'reference': claim.submitted_reference,
            'description': f"Déclaration de paiement soumise par {claim.student.full_congolese_name}",
            'status': 'success',
            'status_display': 'Réussie',
            'icon': 'bi-credit-card',
            'module_class': 'payment',
        })

    approved_claims = PaymentClaim.objects.select_related(
        'student', 'bank', 'bank_transaction'
    ).filter(
        academic_year=academic_year,
        status=PaymentClaim.ClaimStatus.APPROVED,
        is_verified=True
    ).order_by('-created_at')

    for claim in approved_claims:
        history_entries.append({
            'id': f"APP-{claim.id:05d}",
            'date': claim.created_at,
            'actor': 'system',
            'actor_display': 'Système',
            'module': 'payment',
            'module_display': 'Paiements',
            'action': 'validate',
            'action_display': 'Validation',
            'reference': claim.submitted_reference,
            'description': f"Paiement validé pour {claim.student.full_congolese_name}",
            'status': 'success',
            'status_display': 'Réussie',
            'icon': 'bi-check2-circle',
            'module_class': 'payment',
        })

    statements = BankStatement.objects.filter(
        academic_year=academic_year
    ).select_related(
        'bank_account', 'bank_account__bank', 'imported_by'
    ).order_by('-imported_at')

    for statement in statements:
        history_entries.append({
            'id': f"EXT-{statement.id:05d}",
            'date': statement.imported_at,
            'actor': 'finance',
            'actor_display': statement.imported_by.full_congolese_name,
            'module': 'statement',
            'module_display': 'Extraits bancaires',
            'action': 'import',
            'action_display': 'Importation',
            'reference': statement.file.name.split('/')[-1][:20],
            'description': f"Import de l'extrait {statement.bank_account.bank.name}",
            'status': 'success',
            'status_display': 'Réussie',
            'icon': 'bi-bank',
            'module_class': 'statement',
        })

    schedules = FeeSchedule.objects.filter(
        academic_year=academic_year
    ).select_related(
        'created_by', 'academic_program'
    ).order_by('-created_at')

    for schedule in schedules:
        history_entries.append({
            'id': f"ECH-{schedule.id:05d}",
            'date': schedule.created_at,
            'actor': 'finance',
            'actor_display': schedule.created_by.full_congolese_name,
            'module': 'schedule',
            'module_display': 'Échéancier',
            'action': 'create',
            'action_display': 'Création',
            'reference': f"ECH-{schedule.academic_year}",
            'description': f"Échéancier créé pour {schedule.academic_program}",
            'status': 'success',
            'status_display': 'Réussie',
            'icon': 'bi-calendar3',
            'module_class': 'schedule',
        })

    anomalies = PaymentAnomaly.objects.select_related(
        'claim', 'claim__student'
    ).filter(
        claim__academic_year=academic_year
    ).order_by('-created_at')

    for anomaly in anomalies:
        if anomaly.status == PaymentAnomaly.Status.RESOLVED:
            status = 'success'
            status_display = 'Réussie'
            action = 'resolve'
            action_display = 'Résolution'
        else:
            status = 'warning'
            status_display = 'À vérifier'
            action = 'create'
            action_display = 'Création'

        history_entries.append({
            'id': f"ANO-{anomaly.id:05d}",
            'date': anomaly.created_at,
            'actor': 'system' if anomaly.status == PaymentAnomaly.Status.OPEN else 'finance',
            'actor_display': 'Système' if anomaly.status == PaymentAnomaly.Status.OPEN else 'Responsable financier',
            'module': 'anomaly',
            'module_display': 'Anomalies',
            'action': action,
            'action_display': action_display,
            'reference': anomaly.claim.submitted_reference,
            'description': anomaly.get_anomaly_type_display(),
            'status': status,
            'status_display': status_display,
            'icon': 'bi-exclamation-triangle',
            'module_class': 'anomaly',
        })

    verifications = VerificationLog.objects.select_related(
        'staff', 'student'
    ).order_by('-verified_at')

    for verification in verifications:
        history_entries.append({
            'id': f"VRF-{verification.id:05d}",
            'date': verification.verified_at,
            'actor': 'system',
            'actor_display': 'Système',
            'module': 'student',
            'module_display': 'Situation financière',
            'action': 'validate',
            'action_display': 'Validation',
            'reference': verification.student.registration_num or 'Sans ID',
            'description': f"Vérification de {verification.student.full_congolese_name}",
            'status': 'success' if verification.is_financially_clear else 'warning',
            'status_display': 'Réussie' if verification.is_financially_clear else 'À vérifier',
            'icon': 'bi-people',
            'module_class': 'student',
        })

    history_entries.sort(key=lambda entry: entry['date'], reverse=True)

    return history_entries


def serialize_history_entry(entry):
    return {
        'id': entry['id'],
        'date': entry['date'].isoformat(),
        'actor': entry['actor'],
        'actorDisplay': entry['actor_display'],
        'module': entry['module'],
        'moduleDisplay': entry['module_display'],
        'action': entry['action'],
        'actionDisplay': entry['action_display'],
        'reference': entry['reference'],
        'description': entry['description'],
        'status': entry['status'],
        'statusDisplay': entry['status_display'],
        'icon': entry['icon'],
        'moduleClass': entry['module_class'],
    }


@login_required
@finance_required
def finance_history(request):
    """
    View for finance history/audit log. Charge l'intégralité du
    journal d'audit de l'année académique active en une fois ;
    recherche et filtres s'appliquent ensuite entièrement côté
    client (comme les autres pages finance).
    """
    academic_year = request.GET.get('academic_year') or ACADEMIC_YEAR

    history_entries = build_history_entries(academic_year)
    entries_json = [serialize_history_entry(entry) for entry in history_entries]

    kpi = {
        'total': len(history_entries),
        'successful': sum(1 for e in history_entries if e['status'] == 'success'),
        'warning': sum(1 for e in history_entries if e['status'] == 'warning'),
        'failed': sum(1 for e in history_entries if e['status'] == 'failed'),
    }

    context = {
        'academic_year': academic_year,
        'academic_year_choices': [year for year, _ in ACADEMIC_YEAR_CHOICES],
        'bootstrap_data': _history_safe_json({
            'academicYear': academic_year,
            'entries': entries_json,
            'kpi': kpi,
        }),
        'pending_anomalies': PaymentAnomaly.objects.filter(
            status=PaymentAnomaly.Status.OPEN
        ).count(),
        'current_academic_year': ACADEMIC_YEAR,
    }

    return render(request, 'espace_finance/finance-history.html', context)
# ============================================================
# EXPORT HISTORY CSV
# ============================================================

@login_required
@finance_required
def finance_export_history(request):
    """
    Export history entries as CSV.
    """

    search_query = request.GET.get('search', '').strip()

    history_entries = []

    claims = PaymentClaim.objects.select_related('student', 'bank').filter(
        academic_year=ACADEMIC_YEAR
    ).order_by('-created_at')

    for claim in claims:
        history_entries.append({
            'id': f"CLM-{claim.id:05d}",
            'date': claim.created_at,
            'actor_display': claim.student.full_congolese_name,
            'module_display': 'Paiements',
            'action_display': 'Création',
            'reference': claim.submitted_reference,
            'description': f"Déclaration de paiement soumise par {claim.student.full_congolese_name}",
            'status_display': 'Réussie',
        })

    statements = BankStatement.objects.select_related('bank_account__bank', 'imported_by').order_by('-imported_at')
    for statement in statements:
        history_entries.append({
            'id': f"EXT-{statement.id:05d}",
            'date': statement.imported_at,
            'actor_display': statement.imported_by.full_congolese_name,
            'module_display': 'Extraits bancaires',
            'action_display': 'Importation',
            'reference': statement.file.name.split('/')[-1][:20],
            'description': f"Import de l'extrait {statement.bank_account.bank.name}",
            'status_display': 'Réussie',
        })

    schedules = FeeSchedule.objects.select_related('created_by', 'academic_program').order_by('-created_at')
    for schedule in schedules:
        history_entries.append({
            'id': f"ECH-{schedule.id:05d}",
            'date': schedule.created_at,
            'actor_display': schedule.created_by.full_congolese_name,
            'module_display': 'Échéancier',
            'action_display': 'Création',
            'reference': f"ECH-{schedule.academic_year}",
            'description': f"Échéancier créé pour {schedule.academic_program}",
            'status_display': 'Réussie',
        })

    history_entries.sort(key=lambda x: x['date'], reverse=True)

    if search_query:
        search_lower = search_query.lower()
        history_entries = [
            e for e in history_entries
            if search_lower in e['reference'].lower() or search_lower in e['description'].lower()
        ]

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="historique-financier-{timezone.now().strftime("%Y%m%d")}.csv"'

    writer = csv.writer(response)

    writer.writerow(['HISTORIQUE FINANCIER ACADEMICPAY'])
    writer.writerow([])
    writer.writerow(["Date d'exportation", timezone.now().strftime('%d/%m/%Y %H:%M')])
    writer.writerow([])

    writer.writerow(['Identifiant', 'Date et heure', 'Acteur', 'Module', 'Action', 'Référence', 'Description', 'Résultat'])

    for entry in history_entries:
        writer.writerow([
            entry['id'],
            entry['date'].strftime('%d/%m/%Y %H:%M'),
            entry['actor_display'],
            entry['module_display'],
            entry['action_display'],
            entry['reference'],
            entry['description'],
            entry['status_display'],
        ])

    return response


# ============================================================
# FINANCE PROFILE
# ============================================================

@login_required
@finance_required
def finance_profile(request):

    user = request.user

    # ========================================================
    # HANDLE PROFILE UPDATE (AJAX)
    # ========================================================

    if request.method == 'POST' and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        action = request.POST.get('action')

        if action == 'update_profile':
            first_name = request.POST.get('first_name', '').strip()
            last_name = request.POST.get('last_name', '').strip()
            email = request.POST.get('email', '').strip()
            phone = request.POST.get('phone', '').strip()

            errors = []

            if not first_name:
                errors.append("Veuillez renseigner le prénom.")

            if not last_name:
                errors.append("Veuillez renseigner le nom.")

            if not email:
                errors.append("Veuillez renseigner votre adresse e-mail.")
            else:
                try:
                    validate_email(email)
                except ValidationError:
                    errors.append("Veuillez introduire une adresse e-mail valide.")
                else:
                    if User.objects.exclude(id=user.id).filter(email=email).exists():
                        errors.append("Cette adresse e-mail est déjà utilisée.")

            if not phone:
                errors.append("Veuillez renseigner votre numéro de téléphone.")
            else:
                digits = ''.join(filter(str.isdigit, phone))
                if len(digits) < 9:
                    errors.append("Le numéro de téléphone semble incomplet.")
                elif len(digits) > 15:
                    errors.append("Le numéro de téléphone est trop long.")

            if errors:
                return JsonResponse({'success': False, 'errors': errors}, status=400)

            user.first_name = first_name
            user.last_name = last_name
            user.email = email

            try:
                user.save()
                return JsonResponse({
                    'success': True,
                    'message': "Vos informations ont été mises à jour.",
                    'full_name': user.full_congolese_name,
                })
            except Exception:
                return JsonResponse({
                    'success': False,
                    'errors': ["Une erreur est survenue lors de la mise à jour."]
                }, status=500)

        elif action == 'change_password':
            current_password = request.POST.get('current_password', '')
            new_password = request.POST.get('new_password', '')
            confirm_password = request.POST.get('confirm_password', '')

            errors = []

            if not user.check_password(current_password):
                errors.append("Le mot de passe actuel est incorrect.")

            if not new_password:
                errors.append("Veuillez renseigner un nouveau mot de passe.")
            elif len(new_password) < 8:
                errors.append("Le nouveau mot de passe doit contenir au moins 8 caractères.")
            elif new_password.isdigit():
                errors.append("Le mot de passe ne peut pas contenir uniquement des chiffres.")

            if new_password != confirm_password:
                errors.append("La confirmation ne correspond pas au nouveau mot de passe.")

            if new_password and current_password == new_password:
                errors.append("Le nouveau mot de passe doit être différent du mot de passe actuel.")

            if errors:
                return JsonResponse({'success': False, 'errors': errors}, status=400)

            try:
                user.set_password(new_password)
                user.save()
                update_session_auth_hash(request, user)
                return JsonResponse({
                    'success': True,
                    'message': "Votre mot de passe a été modifié avec succès."
                })
            except Exception:
                return JsonResponse({
                    'success': False,
                    'errors': ["Une erreur est survenue lors du changement de mot de passe."]
                }, status=500)

        return JsonResponse({
            'success': False,
            'errors': ["Action non reconnue."]
        }, status=400)

    # ========================================================
    # GET USER INFORMATION
    # ========================================================

    full_name = user.full_congolese_name
    first_name = user.first_name
    last_name = user.last_name
    post_name = user.post_name or ''
    email = user.email
    registration = user.registration_num or 'Sans ID'

    role_display = user.get_staff_role_display() or "Responsable financier"

    last_login = user.last_login
    last_login_display = "Première connexion" if not last_login else last_login.strftime("%d %B %Y · %H:%M")

    name_parts = full_name.split()
    initials = ''.join([part[0] for part in name_parts[:2]]) if name_parts else '?'

    if user.staff_role == User.StaffRole.FINANCIER:
        service = "Service financier"
        role_system = "Responsable Finance"
    elif user.staff_role == User.StaffRole.CAISSIER:
        service = "Service de caisse"
        role_system = "Agent de caisse"
    elif user.staff_role == User.StaffRole.SURVEILLANT:
        service = "Service de surveillance"
        role_system = "Surveillant"
    else:
        service = "Service inconnu"
        role_system = "Personnel"

    pending_anomalies = PaymentAnomaly.objects.filter(
        status=PaymentAnomaly.Status.OPEN
    ).count()

    context = {
        'user': user,
        'full_name': full_name,
        'first_name': first_name,
        'last_name': last_name,
        'post_name': post_name,
        'email': email,
        'registration': registration,
        'initials': initials.upper(),
        'role_display': role_display,
        'service': service,
        'role_system': role_system,
        'last_login': last_login_display,
        'pending_anomalies': pending_anomalies,
        'current_academic_year': ACADEMIC_YEAR,
        'avatar_url': user.get_avatar_url,
        'is_active': user.is_active,
    }

    return render(request, 'espace_finance/finance-profile.html', context)
