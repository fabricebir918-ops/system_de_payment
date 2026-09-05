import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction

from accounts.models import (
    Bank,
    BankTransaction,
    Payment,
    PaymentAnomaly,
    PaymentClaim,
)

from .rdc_data import (
    ACADEMIC_YEARS,
    ANOMALY_TYPES,
    DEFAULT_RANDOM_SEED,
    PAYMENT_SCENARIO_WEIGHTS,
    PAYMENT_SEED_OFFSET,
)


User = get_user_model()

CLAIM_RATIO_BY_YEAR = {
    "2023-2024": 0.75,
    "2024-2025": 0.78,
    "2025-2026": 0.82,
    "2026-2027": 0.85,
}


def get_test_students():
    return list(
        User.objects.filter(
            role=User.Role.STUDENT,
            registration_num__startswith="UCB-TEST-",
            academic_program__isnull=False,
            is_active=True,
        ).order_by("registration_num")
    )


def get_transactions_for_year(academic_year):
    year = academic_year.split("-")[0]

    return list(
        BankTransaction.objects.filter(
            transaction_reference__startswith=f"TEST-TXN-{year}-"
        )
        .select_related("bank_account__bank")
        .order_by("transaction_reference")
    )


def choose_semester(bank_transaction):
    return (
        PaymentClaim.Semester.S1
        if bank_transaction.payment_date.month in (9, 10, 11, 12, 1, 2)
        else PaymentClaim.Semester.S2
    )


def build_scenarios(count, rng):
    scenarios = tuple(PAYMENT_SCENARIO_WEIGHTS)
    raw = {
        scenario: count * PAYMENT_SCENARIO_WEIGHTS[scenario]
        for scenario in scenarios
    }

    quantities = {
        scenario: int(raw[scenario])
        for scenario in scenarios
    }

    remaining = count - sum(quantities.values())

    ranked = sorted(
        scenarios,
        key=lambda s: raw[s] - quantities[s],
        reverse=True,
    )

    for scenario in ranked[:remaining]:
        quantities[scenario] += 1

    result = [
        scenario
        for scenario, quantity in quantities.items()
        for _ in range(quantity)
    ]

    rng.shuffle(result)
    return result


def create_claim(
    student,
    bank_transaction,
    academic_year,
    *,
    status,
    reference=None,
    amount=None,
    payment_date=None,
    bank=None,
    verified=False,
    link_transaction=False,
):
    claim = PaymentClaim(
        student=student,
        submitted_reference=(
            reference
            if reference is not None
            else bank_transaction.transaction_reference
        ),
        amount=(
            amount
            if amount is not None
            else bank_transaction.amount
        ),
        payment_date=(
            payment_date
            if payment_date is not None
            else bank_transaction.payment_date
        ),
        bank=(
            bank
            if bank is not None
            else bank_transaction.bank_account.bank
        ),
        academic_year=academic_year,
        semester=choose_semester(bank_transaction),
        bank_transaction=(
            bank_transaction if link_transaction else None
        ),
        status=status,
        is_verified=verified,
    )

    claim.full_clean()
    claim.save()

    return claim


def approve_claim(student, bank_transaction, academic_year):
    claim = create_claim(
        student,
        bank_transaction,
        academic_year,
        status=PaymentClaim.ClaimStatus.APPROVED,
        verified=True,
        link_transaction=True,
    )

    payment = Payment(
        student=student,
        claim=claim,
        bank_reference=bank_transaction.transaction_reference,
        amount=claim.amount,
        academic_year=academic_year,
        semester=claim.semester,
        payment_date=bank_transaction.payment_date,
    )

    payment.full_clean()
    payment.save()

    bank_transaction.is_verified = True
    bank_transaction.full_clean()
    bank_transaction.save(update_fields=["is_verified"])

    return claim, payment


def create_pending_claim(student, bank_transaction, academic_year):
    return create_claim(
        student,
        bank_transaction,
        academic_year,
        status=PaymentClaim.ClaimStatus.PENDING,
    )


def create_anomaly_scenario(
    student,
    bank_transaction,
    academic_year,
    rng,
):
    anomaly_type = rng.choice(ANOMALY_TYPES)

    kwargs = {}

    if anomaly_type == "REFERENCE_NOT_FOUND":
        kwargs["reference"] = (
            f"TEST-NOT-FOUND-{academic_year[:4]}-"
            f"{bank_transaction.pk:08d}"
        )

    elif anomaly_type == "AMOUNT_MISMATCH":
        kwargs["amount"] = (
            bank_transaction.amount + Decimal("10.00")
        )

    elif anomaly_type == "BANK_MISMATCH":
        banks = list(
            Bank.objects.filter(is_active=True).exclude(
                pk=bank_transaction.bank_account.bank_id
            )
        )

        if banks:
            kwargs["bank"] = rng.choice(banks)
        else:
            anomaly_type = "AMOUNT_MISMATCH"
            kwargs["amount"] = (
                bank_transaction.amount + Decimal("10.00")
            )

    elif anomaly_type == "DATE_MISMATCH":
        kwargs["payment_date"] = (
            bank_transaction.payment_date + timedelta(days=7)
        )

    elif anomaly_type == "REFERENCE_ALREADY_USED":
        used_claim = (
            PaymentClaim.objects.filter(
                bank_transaction__isnull=False
            )
            .select_related("bank_transaction")
            .order_by("id")
            .first()
        )

        if used_claim:
            kwargs.update(
                reference=used_claim.submitted_reference,
                amount=used_claim.amount,
                payment_date=used_claim.payment_date,
                bank=used_claim.bank,
            )
        else:
            anomaly_type = "REFERENCE_NOT_FOUND"
            kwargs["reference"] = (
                f"TEST-NOT-FOUND-{academic_year[:4]}-"
                f"{bank_transaction.pk:08d}"
            )

    # DUPLICATE_CLAIM utilise volontairement la même
    # transaction de référence pour le même étudiant.

    claim = create_claim(
        student,
        bank_transaction,
        academic_year,
        status=PaymentClaim.ClaimStatus.REJECTED,
        **kwargs,
    )

    anomaly = PaymentAnomaly(
        claim=claim,
        anomaly_type=getattr(
            PaymentAnomaly.Type,
            anomaly_type,
        ),
        description=f"Anomalie synthétique : {anomaly_type}.",
        status=PaymentAnomaly.Status.OPEN,
        resolved_at=None,
    )

    anomaly.full_clean()
    anomaly.save()

    return claim, anomaly


def claims_exist_for_year(academic_year):
    return PaymentClaim.objects.filter(
        academic_year=academic_year,
        student__registration_num__startswith="UCB-TEST-",
    ).exists()


def validate_configuration():
    if set(PAYMENT_SCENARIO_WEIGHTS) != {
        "APPROVED",
        "PENDING",
        "ANOMALY",
    }:
        raise ValueError("Configuration des scénarios invalide.")

    if abs(sum(PAYMENT_SCENARIO_WEIGHTS.values()) - 1.0) > 1e-9:
        raise ValueError(
            "La somme des poids des scénarios doit être égale à 1."
        )

    if any(weight < 0 for weight in PAYMENT_SCENARIO_WEIGHTS.values()):
        raise ValueError("Les poids des scénarios doivent être positifs.")

    for year in ACADEMIC_YEARS:
        ratio = CLAIM_RATIO_BY_YEAR.get(year)

        if ratio is None or not 0 < ratio <= 1:
            raise ValueError(
                f"Ratio de déclaration invalide pour {year}."
            )


@transaction.atomic
def seed_payments_for_year(
    academic_year,
    seed=DEFAULT_RANDOM_SEED,
    skip_existing=True,
):
    validate_configuration()

    if academic_year not in ACADEMIC_YEARS:
        raise ValueError(f"Année non configurée : {academic_year}")

    if skip_existing and claims_exist_for_year(academic_year):
        return {
            "academic_year": academic_year,
            "skipped": True,
            "claims": 0,
            "approved": 0,
            "pending": 0,
            "anomalies": 0,
            "payments": 0,
        }

    students = get_test_students()
    bank_transactions = get_transactions_for_year(academic_year)

    if not students:
        raise RuntimeError(
            "Aucun étudiant synthétique disponible."
        )

    if not bank_transactions:
        raise RuntimeError(
            f"Aucune transaction disponible pour {academic_year}."
        )

    year_index = ACADEMIC_YEARS.index(academic_year)

    rng = random.Random(
        seed + PAYMENT_SEED_OFFSET + year_index * 1_000
    )

    claim_count = int(
        len(bank_transactions) * CLAIM_RATIO_BY_YEAR[academic_year]
    )

    selected = rng.sample(bank_transactions, claim_count)
    scenarios = build_scenarios(claim_count, rng)

    counters = {
        "claims": 0,
        "approved": 0,
        "pending": 0,
        "anomalies": 0,
        "payments": 0,
    }

    for bank_transaction, scenario in zip(selected, scenarios):
        student = rng.choice(students)

        if scenario == "APPROVED":
            approve_claim(
                student,
                bank_transaction,
                academic_year,
            )

            counters["approved"] += 1
            counters["payments"] += 1

        elif scenario == "PENDING":
            create_pending_claim(
                student,
                bank_transaction,
                academic_year,
            )

            counters["pending"] += 1

        else:
            create_anomaly_scenario(
                student,
                bank_transaction,
                academic_year,
                rng,
            )

            counters["anomalies"] += 1

        counters["claims"] += 1

    return {
        "academic_year": academic_year,
        "skipped": False,
        **counters,
    }


def seed_payments(
    academic_years=ACADEMIC_YEARS,
    seed=DEFAULT_RANDOM_SEED,
    skip_existing=True,
):
    return {
        year: seed_payments_for_year(
            year,
            seed=seed,
            skip_existing=skip_existing,
        )
        for year in academic_years
    }