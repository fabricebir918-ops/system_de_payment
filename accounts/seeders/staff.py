import random

from django.contrib.auth import get_user_model
from django.db import transaction

from .people import generate_staff_identity
from .rdc_data import (
    DEFAULT_RANDOM_SEED,
    DEFAULT_STAFF_COUNT,
    DEFAULT_TEST_PASSWORD,
    STAFF_ROLE_WEIGHTS,
    STAFF_SEED_OFFSET,
)


User = get_user_model()

STAFF_ROLES = (
    User.StaffRole.SURVEILLANT,
    User.StaffRole.CAISSIER,
    User.StaffRole.FINANCIER,
)


def validate_staff_config(count):
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        raise ValueError("count doit être un entier supérieur ou égal à 1.")

    if set(STAFF_ROLE_WEIGHTS) != set(STAFF_ROLES):
        raise ValueError(
            "STAFF_ROLE_WEIGHTS ne correspond pas aux rôles du modèle User."
        )

    if (
        any(weight < 0 for weight in STAFF_ROLE_WEIGHTS.values())
        or abs(sum(STAFF_ROLE_WEIGHTS.values()) - 1.0) > 1e-9
    ):
        raise ValueError("Les poids des rôles sont invalides.")


def build_role_sequence(count, rng):
    validate_staff_config(count)

    # Garantit un représentant de chaque rôle lorsque possible.
    distribution = {role: 0 for role in STAFF_ROLES}
    remaining = count

    if count >= len(STAFF_ROLES):
        for role in STAFF_ROLES:
            distribution[role] = 1
        remaining -= len(STAFF_ROLES)

    # Répartition proportionnelle du reste.
    raw = {
        role: remaining * STAFF_ROLE_WEIGHTS[role]
        for role in STAFF_ROLES
    }

    floors = {role: int(value) for role, value in raw.items()}

    for role, quantity in floors.items():
        distribution[role] += quantity

    leftover = remaining - sum(floors.values())

    ranked = sorted(
        STAFF_ROLES,
        key=lambda role: raw[role] - floors[role],
        reverse=True,
    )

    for role in ranked[:leftover]:
        distribution[role] += 1

    roles = [
        role
        for role, quantity in distribution.items()
        for _ in range(quantity)
    ]

    rng.shuffle(roles)
    return roles


def create_staff_member(sequence, staff_role, rng, password):
    if staff_role not in STAFF_ROLES:
        raise ValueError(f"Rôle du personnel invalide : {staff_role}")

    identity = generate_staff_identity(sequence, rng)

    staff = User(
        username=identity.username,
        email=identity.email,
        first_name=identity.first_name,
        last_name=identity.last_name,
        post_name=identity.post_name,
        registration_num=identity.registration_num,
        role=User.Role.STAFF,
        staff_role=staff_role,
        academic_program=None,
        is_staff=False,
        is_superuser=False,
        is_active=True,
    )

    staff.set_password(password)
    staff.full_clean()
    staff.save()

    return staff


@transaction.atomic
def seed_staff(
    count=DEFAULT_STAFF_COUNT,
    seed=DEFAULT_RANDOM_SEED,
    password=DEFAULT_TEST_PASSWORD,
    skip_existing=True,
):
    validate_staff_config(count)

    rng = random.Random(seed + STAFF_SEED_OFFSET)
    roles = build_role_sequence(count, rng)

    created = []
    skipped = 0
    by_role = {role: 0 for role in STAFF_ROLES}

    for sequence, staff_role in enumerate(roles, start=1):
        registration_num = f"UCB-STAFF-TEST-{sequence:06d}"

        exists = User.objects.filter(
            registration_num=registration_num
        ).exists()

        if skip_existing and exists:
            # Maintient la reproductibilité du générateur.
            generate_staff_identity(sequence, rng)
            skipped += 1
            continue

        staff = create_staff_member(
            sequence,
            staff_role,
            rng,
            password,
        )

        created.append(staff)
        by_role[staff_role] += 1

    return {
        "requested": count,
        "created": len(created),
        "skipped": skipped,
        "by_role": by_role,
        "staff": created,
    }


def get_test_staff(staff_role=None):
    queryset = User.objects.filter(
        role=User.Role.STAFF,
        registration_num__startswith="UCB-STAFF-TEST-",
        is_active=True,
    )

    if staff_role:
        if staff_role not in STAFF_ROLES:
            raise ValueError(f"Rôle du personnel invalide : {staff_role}")
        queryset = queryset.filter(staff_role=staff_role)

    return queryset