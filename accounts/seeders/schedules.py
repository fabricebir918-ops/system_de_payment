import random
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction

from accounts.models import FeeInstallment, FeeSchedule

from .rdc_data import (
    ACADEMIC_YEARS,
    DEFAULT_RANDOM_SEED,
    FEE_SCHEDULE_TOTAL_AMOUNTS,
)


User = get_user_model()


def get_academic_programs():
    AcademicProgram = User._meta.get_field(
        "academic_program"
    ).remote_field.model

    return list(
        AcademicProgram.objects.filter(
            is_active=True,
            program__is_active=True,
            program__department__is_active=True,
            program__department__faculty__is_active=True,
        ).order_by("id")
    )


def get_financial_managers():
    return list(
        User.objects.filter(
            role=User.Role.STAFF,
            staff_role=User.StaffRole.FINANCIER,
            is_active=True,
            registration_num__startswith="UCB-STAFF-TEST-",
        ).order_by("registration_num")
    )


def installment_dates(academic_year):
    start_year, end_year = map(int, academic_year.split("-"))

    return (
        date(start_year, 11, 30),
        date(end_year, 3, 31),
    )


def create_schedule(
    academic_program,
    academic_year,
    total_amount,
    created_by,
):
    schedule = FeeSchedule(
        academic_program=academic_program,
        academic_year=academic_year,
        total_amount=total_amount,
        created_by=created_by,
        status=FeeSchedule.Status.ACTIF,
    )
    schedule.full_clean()
    schedule.save()

    first_amount = (
        total_amount / Decimal("2")
    ).quantize(Decimal("0.01"))

    amounts = (
        first_amount,
        total_amount - first_amount,
    )

    for number, (amount, due_date) in enumerate(
        zip(amounts, installment_dates(academic_year)),
        start=1,
    ):
        installment = FeeInstallment(
            fee_schedule=schedule,
            installment_number=number,
            amount=amount,
            due_date=due_date,
        )

        installment.full_clean()
        installment.save()

    return schedule


@transaction.atomic
def seed_schedules(
    academic_years=ACADEMIC_YEARS,
    seed=DEFAULT_RANDOM_SEED,
    skip_existing=True,
):
    programs = get_academic_programs()
    managers = get_financial_managers()

    if not programs:
        raise RuntimeError(
            "Aucun AcademicProgram actif disponible."
        )

    if not managers:
        raise RuntimeError(
            "Aucun responsable financier synthétique disponible."
        )

    rng = random.Random(seed)
    created = []
    skipped = 0

    for academic_year in academic_years:
        for academic_program in programs:
            exists = FeeSchedule.objects.filter(
                academic_program=academic_program,
                academic_year=academic_year,
            ).exists()

            # Ces choix sont consommés même en cas de relance.
            total_amount = rng.choice(
                FEE_SCHEDULE_TOTAL_AMOUNTS
            )
            manager = rng.choice(managers)

            if skip_existing and exists:
                skipped += 1
                continue

            created.append(
                create_schedule(
                    academic_program=academic_program,
                    academic_year=academic_year,
                    total_amount=total_amount,
                    created_by=manager,
                )
            )

    return {
        "created": len(created),
        "skipped": skipped,
        "schedules": created,
    }