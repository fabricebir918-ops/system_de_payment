from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q

from accounts.models import (
    BankTransaction,
    FeeInstallment,
    FeeSchedule,
    Payment,
    PaymentAnomaly,
    PaymentClaim,
    VerificationLog,
)

from .rdc_data import ACADEMIC_YEARS


User = get_user_model()


class ValidationReport:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.checks = []

    @property
    def is_valid(self):
        return not self.errors

    def error(self, message):
        self.errors.append(message)

    def warning(self, message):
        self.warnings.append(message)

    def check(self, message):
        self.checks.append(message)

    def as_dict(self):
        return {
            "is_valid": self.is_valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "checks": self.checks,
        }


# ============================================================
# UTILISATEURS
# ============================================================

def validate_users(report):
    students = User.objects.filter(
        role=User.Role.STUDENT,
        registration_num__startswith="UCB-TEST-",
    )

    staff = User.objects.filter(
        role=User.Role.STAFF,
        registration_num__startswith="UCB-STAFF-TEST-",
    )

    if not students.exists():
        report.error("Aucun étudiant synthétique.")

    if not staff.exists():
        report.error("Aucun personnel synthétique.")

    if students.filter(academic_program__isnull=True).exists():
        report.error("Étudiant sans AcademicProgram.")

    if students.exclude(staff_role__isnull=True).exists():
        report.error("Étudiant possédant un staff_role.")

    if staff.filter(staff_role__isnull=True).exists():
        report.error("Personnel sans staff_role.")

    if staff.exclude(academic_program__isnull=True).exists():
        report.error("Personnel possédant un AcademicProgram.")

    # Vérification de toute la chaîne académique.
    inactive_academic_structure = students.filter(
        Q(academic_program__is_active=False)
        | Q(academic_program__program__is_active=False)
        | Q(academic_program__program__department__is_active=False)
        | Q(
            academic_program__program__department__faculty__is_active=False
        )
    )

    if inactive_academic_structure.exists():
        report.error(
            "Étudiant rattaché à une structure académique inactive."
        )

    # Tous les rôles nécessaires aux tests doivent exister.
    for role in (
        User.StaffRole.SURVEILLANT,
        User.StaffRole.CAISSIER,
        User.StaffRole.FINANCIER,
    ):
        if not staff.filter(staff_role=role).exists():
            report.error(
                f"Aucun personnel synthétique pour {role}."
            )

    # Contrôle d'unicité.
    for field in ("username", "email", "registration_num"):
        duplicates = (
            User.objects
            .exclude(**{f"{field}__isnull": True})
            .values(field)
            .annotate(total=Count("id"))
            .filter(total__gt=1)
        )

        if duplicates.exists():
            report.error(
                f"Doublons détectés dans User.{field}."
            )

    report.check(
        f"{students.count()} étudiants et "
        f"{staff.count()} personnels contrôlés."
    )


# ============================================================
# TRANSACTIONS BANCAIRES
# ============================================================

def validate_transactions(report):
    transactions = BankTransaction.objects.filter(
        transaction_reference__startswith="TEST-TXN-"
    )

    if not transactions.exists():
        report.error("Aucune transaction synthétique.")
        return

    if transactions.filter(
        amount__lte=Decimal("0.00")
    ).exists():
        report.error(
            "Transaction avec montant non positif."
        )

    duplicates = (
        transactions
        .values("transaction_reference")
        .annotate(total=Count("id"))
        .filter(total__gt=1)
    )

    if duplicates.exists():
        report.error(
            "Références bancaires dupliquées."
        )

    # Toute transaction vérifiée doit provenir
    # d'un rapprochement approuvé.
    for bank_transaction in transactions.filter(
        is_verified=True
    ):
        approved_claim = PaymentClaim.objects.filter(
            bank_transaction=bank_transaction,
            status=PaymentClaim.ClaimStatus.APPROVED,
            is_verified=True,
        ).exists()

        if not approved_claim:
            report.error(
                f"Transaction #{bank_transaction.pk} vérifiée "
                "sans claim APPROVED."
            )

    report.check(
        f"{transactions.count()} transactions contrôlées."
    )


# ============================================================
# DÉCLARATIONS DE PAIEMENT
# ============================================================

def validate_claims(report):
    claims = PaymentClaim.objects.filter(
        student__registration_num__startswith="UCB-TEST-"
    ).select_related(
        "bank",
        "bank_transaction__bank_account__bank",
    )

    if not claims.exists():
        report.error(
            "Aucune déclaration de paiement synthétique."
        )
        return

    for claim in claims:

        # ----------------------------------------------------
        # APPROVED
        # ----------------------------------------------------

        if claim.status == PaymentClaim.ClaimStatus.APPROVED:

            if not claim.is_verified:
                report.error(
                    f"Claim #{claim.pk} APPROVED non vérifié."
                )

            if not claim.bank_transaction_id:
                report.error(
                    f"Claim #{claim.pk} APPROVED sans transaction."
                )
                continue

            bank_transaction = claim.bank_transaction

            if (
                claim.submitted_reference
                != bank_transaction.transaction_reference
            ):
                report.error(
                    f"Claim #{claim.pk} : référence incohérente."
                )

            if claim.amount != bank_transaction.amount:
                report.error(
                    f"Claim #{claim.pk} : montant incohérent."
                )

            if (
                claim.bank_id
                != bank_transaction.bank_account.bank_id
            ):
                report.error(
                    f"Claim #{claim.pk} : banque incohérente."
                )

            if not bank_transaction.is_verified:
                report.error(
                    f"Transaction #{bank_transaction.pk} "
                    "non vérifiée."
                )

            if Payment.objects.filter(
                claim=claim
            ).count() != 1:
                report.error(
                    f"Claim #{claim.pk} doit avoir "
                    "exactement un Payment."
                )

        # ----------------------------------------------------
        # PENDING
        # ----------------------------------------------------

        elif claim.status == PaymentClaim.ClaimStatus.PENDING:

            if claim.is_verified:
                report.error(
                    f"Claim PENDING #{claim.pk} marqué vérifié."
                )

            if claim.bank_transaction_id:
                report.error(
                    f"Claim PENDING #{claim.pk} déjà rattaché "
                    "à une transaction."
                )

            if Payment.objects.filter(
                claim=claim
            ).exists():
                report.error(
                    f"Claim PENDING #{claim.pk} possède un Payment."
                )

        # ----------------------------------------------------
        # REJECTED
        # ----------------------------------------------------

        elif claim.status == PaymentClaim.ClaimStatus.REJECTED:

            if claim.is_verified:
                report.error(
                    f"Claim REJECTED #{claim.pk} marqué vérifié."
                )

            if not PaymentAnomaly.objects.filter(
                claim=claim
            ).exists():
                report.error(
                    f"Claim REJECTED #{claim.pk} sans anomalie."
                )

            if Payment.objects.filter(
                claim=claim
            ).exists():
                report.error(
                    f"Claim REJECTED #{claim.pk} possède un Payment."
                )

        else:
            report.error(
                f"Claim #{claim.pk} possède un statut inconnu."
            )

    report.check(
        f"{claims.count()} claims contrôlés."
    )


# ============================================================
# PAIEMENTS VALIDÉS
# ============================================================

def validate_payments(report):
    payments = Payment.objects.filter(
        student__registration_num__startswith="UCB-TEST-"
    ).select_related(
        "claim",
        "claim__bank_transaction",
    )

    if not payments.exists():
        report.error(
            "Aucun paiement synthétique validé."
        )
        return

    for payment in payments:
        claim = payment.claim

        if (
            claim.status
            != PaymentClaim.ClaimStatus.APPROVED
        ):
            report.error(
                f"Payment #{payment.pk} issu "
                "d'un claim non APPROVED."
            )

        if not claim.is_verified:
            report.error(
                f"Payment #{payment.pk} issu "
                "d'un claim non vérifié."
            )

        if not claim.bank_transaction_id:
            report.error(
                f"Payment #{payment.pk} sans "
                "transaction bancaire associée."
            )

        if payment.student_id != claim.student_id:
            report.error(
                f"Payment #{payment.pk} : étudiant incohérent."
            )

        if payment.amount != claim.amount:
            report.error(
                f"Payment #{payment.pk} : montant incohérent."
            )

        if payment.academic_year != claim.academic_year:
            report.error(
                f"Payment #{payment.pk} : année incohérente."
            )

        if payment.semester != claim.semester:
            report.error(
                f"Payment #{payment.pk} : semestre incohérent."
            )

    report.check(
        f"{payments.count()} paiements contrôlés."
    )


# ============================================================
# ANOMALIES
# ============================================================

def validate_anomalies(report):
    anomalies = PaymentAnomaly.objects.filter(
        claim__student__registration_num__startswith="UCB-TEST-"
    ).select_related("claim")

    if not anomalies.exists():
        report.error(
            "Aucune anomalie synthétique."
        )
        return

    for anomaly in anomalies:

        if (
            anomaly.claim.status
            != PaymentClaim.ClaimStatus.REJECTED
        ):
            report.error(
                f"Anomalie #{anomaly.pk} "
                "sur claim non REJECTED."
            )

        if anomaly.claim.is_verified:
            report.error(
                f"Anomalie #{anomaly.pk} "
                "sur claim vérifié."
            )

        if Payment.objects.filter(
            claim=anomaly.claim
        ).exists():
            report.error(
                f"Anomalie #{anomaly.pk} associée "
                "à un Payment."
            )

    report.check(
        f"{anomalies.count()} anomalies contrôlées."
    )


# ============================================================
# ÉCHÉANCIERS
# ============================================================

def validate_schedules(report):
    schedules = FeeSchedule.objects.filter(
        academic_year__in=ACADEMIC_YEARS
    ).select_related(
        "created_by",
        "academic_program",
    )

    if not schedules.exists():
        report.error(
            "Aucun échéancier synthétique."
        )
        return

    duplicates = (
        schedules
        .values(
            "academic_program",
            "academic_year",
        )
        .annotate(total=Count("id"))
        .filter(total__gt=1)
    )

    if duplicates.exists():
        report.error(
            "Échéanciers AcademicProgram/année dupliqués."
        )

    for schedule in schedules:
        creator = schedule.created_by

        if (
            creator is None
            or creator.role != User.Role.STAFF
            or creator.staff_role != User.StaffRole.FINANCIER
        ):
            report.error(
                f"FeeSchedule #{schedule.pk} : "
                "créateur invalide."
            )

        if schedule.total_amount <= Decimal("0.00"):
            report.error(
                f"FeeSchedule #{schedule.pk} : "
                "montant total non positif."
            )

        installments = list(
            FeeInstallment.objects.filter(
                fee_schedule=schedule
            ).order_by("installment_number")
        )

        # AcademicPay utilise exactement deux tranches
        # dans le dataset synthétique.
        if len(installments) != 2:
            report.error(
                f"FeeSchedule #{schedule.pk} doit contenir "
                "exactement 2 tranches."
            )
            continue

        if [
            item.installment_number
            for item in installments
        ] != [1, 2]:
            report.error(
                f"FeeSchedule #{schedule.pk} : "
                "numérotation des tranches invalide."
            )

        total = sum(
            (
                item.amount
                for item in installments
            ),
            Decimal("0.00"),
        )

        if total != schedule.total_amount:
            report.error(
                f"FeeSchedule #{schedule.pk} : "
                "total des tranches incohérent."
            )

        previous_date = None

        for installment in installments:

            if installment.amount <= Decimal("0.00"):
                report.error(
                    f"Tranche #{installment.pk} : "
                    "montant non positif."
                )

            if (
                previous_date
                and installment.due_date <= previous_date
            ):
                report.error(
                    f"FeeSchedule #{schedule.pk} : "
                    "dates des tranches invalides."
                )

            previous_date = installment.due_date

    report.check(
        f"{schedules.count()} échéanciers contrôlés."
    )


# ============================================================
# VÉRIFICATIONS PAR LES SURVEILLANTS
# ============================================================

def validate_verification_logs(report):
    logs = VerificationLog.objects.filter(
        staff__registration_num__startswith="UCB-STAFF-TEST-",
        student__registration_num__startswith="UCB-TEST-",
    ).select_related(
        "staff",
        "student",
    )

    if not logs.exists():
        report.error(
            "Aucune vérification synthétique."
        )
        return

    for log in logs:

        if (
            log.staff.role != User.Role.STAFF
            or log.staff.staff_role
            != User.StaffRole.SURVEILLANT
        ):
            report.error(
                f"VerificationLog #{log.pk} : "
                "surveillant invalide."
            )

        if log.student.role != User.Role.STUDENT:
            report.error(
                f"VerificationLog #{log.pk} : "
                "étudiant invalide."
            )

        if log.method not in {
            "MANUAL_SEARCH",
            "QR_SCAN",
        }:
            report.error(
                f"VerificationLog #{log.pk} : "
                "méthode invalide."
            )

    report.check(
        f"{logs.count()} vérifications contrôlées."
    )


# ============================================================
# COUVERTURE DES ANNÉES ACADÉMIQUES
# ============================================================

def validate_year_coverage(report):
    for academic_year in ACADEMIC_YEARS:
        start_year = academic_year.split("-")[0]

        transactions = BankTransaction.objects.filter(
            transaction_reference__startswith=(
                f"TEST-TXN-{start_year}-"
            )
        ).count()

        claims = PaymentClaim.objects.filter(
            academic_year=academic_year,
            student__registration_num__startswith="UCB-TEST-",
        ).count()

        payments = Payment.objects.filter(
            academic_year=academic_year,
            student__registration_num__startswith="UCB-TEST-",
        ).count()

        schedules = FeeSchedule.objects.filter(
            academic_year=academic_year
        ).count()

        if not transactions:
            report.error(
                f"{academic_year} : aucune transaction."
            )

        if not claims:
            report.error(
                f"{academic_year} : aucun claim."
            )

        if not payments:
            report.error(
                f"{academic_year} : aucun paiement."
            )

        if not schedules:
            report.error(
                f"{academic_year} : aucun échéancier."
            )

        report.check(
            f"{academic_year}: "
            f"{transactions} transactions, "
            f"{claims} claims, "
            f"{payments} paiements, "
            f"{schedules} échéanciers."
        )


# ============================================================
# VALIDATION GLOBALE
# ============================================================

def validate_dataset():
    report = ValidationReport()

    validate_users(report)
    validate_transactions(report)
    validate_claims(report)
    validate_payments(report)
    validate_anomalies(report)
    validate_schedules(report)
    validate_verification_logs(report)
    validate_year_coverage(report)

    return report


# ============================================================
# AFFICHAGE DU RAPPORT
# ============================================================

def print_validation_report(report):
    print("\nACADEMICPAY - VALIDATION DU DATASET")
    print("=" * 50)

    for error in report.errors:
        print(f"[ERREUR] {error}")

    for warning in report.warnings:
        print(f"[AVERTISSEMENT] {warning}")

    for check in report.checks:
        print(f"[OK] {check}")

    print("=" * 50)

    print(
        "RÉSULTAT : "
        + (
            "DATASET COHÉRENT"
            if report.is_valid
            else "DATASET INVALIDE"
        )
    )

    return report.is_valid