import random

from django.contrib.auth import get_user_model
from django.db import transaction

from accounts.models import VerificationLog

from .rdc_data import DEFAULT_RANDOM_SEED


User = get_user_model()

VERIFICATION_METHODS = ("MANUAL_SEARCH", "QR_SCAN")


def get_supervisors():
    return list(
        User.objects.filter(
            role=User.Role.STAFF,
            staff_role=User.StaffRole.SURVEILLANT,
            registration_num__startswith="UCB-STAFF-TEST-",
            is_active=True,
        ).order_by("registration_num")
    )


def get_students():
    return list(
        User.objects.filter(
            role=User.Role.STUDENT,
            registration_num__startswith="UCB-TEST-",
            is_active=True,
        ).order_by("registration_num")
    )


@transaction.atomic
def seed_verifications(
    count=100,
    seed=DEFAULT_RANDOM_SEED,
):
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        raise ValueError(
            "count doit être un entier supérieur ou égal à 1."
        )

    supervisors = get_supervisors()
    students = get_students()

    if not supervisors:
        raise RuntimeError(
            "Aucun surveillant synthétique disponible."
        )

    if not students:
        raise RuntimeError(
            "Aucun étudiant synthétique disponible."
        )

    rng = random.Random(seed)
    created = []

    for _ in range(count):
        log = VerificationLog(
            staff=rng.choice(supervisors),
            student=rng.choice(students),
            method=rng.choice(VERIFICATION_METHODS),
        )

        log.full_clean()
        log.save()
        created.append(log)

    return {
        "requested": count,
        "created": len(created),
        "verifications": created,
    }