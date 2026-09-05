import random
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from accounts.models import BankTransaction, UniversityBankAccount

from .rdc_data import (
    ACADEMIC_YEARS,
    BANKING_SEED_OFFSET,
    CURRENT_ACADEMIC_YEAR,
    DEFAULT_RANDOM_SEED,
    PAYMENT_AMOUNTS,
    TRANSACTION_COUNT_BY_YEAR,
)


def validate_academic_year(academic_year):
    try:
        start, end = academic_year.split("-")
        valid = (
            len(start) == 4
            and len(end) == 4
            and start.isdigit()
            and end.isdigit()
            and int(end) == int(start) + 1
        )
    except (ValueError, AttributeError):
        valid = False

    if not valid:
        raise ValueError(
            "L'année académique doit respecter le format YYYY-YYYY."
        )


def get_available_bank_accounts():
    return list(
        UniversityBankAccount.objects.filter(
            is_active=True,
            bank__is_active=True,
        )
        .select_related("bank")
        .order_by("id")
    )


def build_transaction_reference(sequence, academic_year):
    if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 1:
        raise ValueError("sequence doit être un entier supérieur ou égal à 1.")

    validate_academic_year(academic_year)
    year = academic_year.split("-")[0]

    return f"TEST-TXN-{year}-{sequence:08d}"


def generate_transaction_date(academic_year, rng):
    validate_academic_year(academic_year)
    start_year, end_year = map(int, academic_year.split("-"))

    start = timezone.make_aware(datetime(start_year, 9, 1))
    end = timezone.make_aware(
        datetime(end_year, 8, 31, 23, 59, 59)
    )

    seconds = int((end - start).total_seconds())
    return start + timedelta(seconds=rng.randint(0, seconds))


def create_bank_transaction(
    sequence,
    bank_account,
    academic_year,
    rng,
):
    transaction_obj = BankTransaction(
        transaction_reference=build_transaction_reference(
            sequence,
            academic_year,
        ),
        bank_account=bank_account,
        amount=rng.choice(PAYMENT_AMOUNTS),
        payment_date=generate_transaction_date(
            academic_year,
            rng,
        ),
        is_verified=False,
    )

    transaction_obj.full_clean()
    transaction_obj.save()

    return transaction_obj


@transaction.atomic
def seed_bank_transactions(
    count,
    academic_year=CURRENT_ACADEMIC_YEAR,
    seed=DEFAULT_RANDOM_SEED,
    skip_existing=True,
):
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        raise ValueError("count doit être un entier supérieur ou égal à 1.")

    validate_academic_year(academic_year)

    accounts = get_available_bank_accounts()

    if not accounts:
        raise RuntimeError(
            "Aucun compte bancaire universitaire actif. "
            "Chargez d'abord le référentiel bancaire."
        )

    rng = random.Random(seed + BANKING_SEED_OFFSET)
    created = []
    skipped = 0
    by_bank = {account.bank.code: 0 for account in accounts}

    for sequence in range(1, count + 1):
        reference = build_transaction_reference(
            sequence,
            academic_year,
        )

        exists = BankTransaction.objects.filter(
            transaction_reference=reference
        ).exists()

        if skip_existing and exists:
            # Reproduit les appels RNG d'une création normale.
            rng.choice(accounts)
            rng.choice(PAYMENT_AMOUNTS)
            generate_transaction_date(academic_year, rng)

            skipped += 1
            continue

        account = rng.choice(accounts)

        transaction_obj = create_bank_transaction(
            sequence,
            account,
            academic_year,
            rng,
        )

        created.append(transaction_obj)
        by_bank[account.bank.code] += 1

    return {
        "academic_year": academic_year,
        "requested": count,
        "created": len(created),
        "skipped": skipped,
        "by_bank": by_bank,
        "transactions": created,
    }


def seed_bank_transactions_for_years(
    academic_years=ACADEMIC_YEARS,
    count_by_year=TRANSACTION_COUNT_BY_YEAR,
    seed=DEFAULT_RANDOM_SEED,
    skip_existing=True,
):
    results = {}

    for index, academic_year in enumerate(academic_years):
        validate_academic_year(academic_year)

        if academic_year not in count_by_year:
            raise ValueError(
                f"Aucun volume défini pour {academic_year}."
            )

        results[academic_year] = seed_bank_transactions(
            count=count_by_year[academic_year],
            academic_year=academic_year,
            seed=seed + index * 1_000,
            skip_existing=skip_existing,
        )

    return results


def get_test_bank_transactions(academic_year=None, verified=None):
    queryset = BankTransaction.objects.filter(
        transaction_reference__startswith="TEST-TXN-"
    ).select_related(
        "bank_account",
        "bank_account__bank",
    )

    if academic_year:
        validate_academic_year(academic_year)
        year = academic_year.split("-")[0]

        queryset = queryset.filter(
            transaction_reference__startswith=f"TEST-TXN-{year}-"
        )

    if verified is not None:
        queryset = queryset.filter(is_verified=verified)

    return queryset.order_by(
        "payment_date",
        "transaction_reference",
    )