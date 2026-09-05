import random

from django.contrib.auth import get_user_model
from django.db import transaction

from .people import generate_student_identity
from .rdc_data import (
    CURRENT_ACADEMIC_YEAR,
    DEFAULT_RANDOM_SEED,
    DEFAULT_STUDENT_COUNT,
    DEFAULT_TEST_PASSWORD,
)


User = get_user_model()


def get_available_academic_programs():
    AcademicProgram = User._meta.get_field(
        "academic_program"
    ).remote_field.model

    return list(
        AcademicProgram.objects.filter(
            is_active=True,
            program__is_active=True,
            program__department__is_active=True,
            program__department__faculty__is_active=True,
        )
        .select_related(
            "program",
            "program__department",
            "program__department__faculty",
        )
        .order_by("id")
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


def create_student(
    sequence,
    academic_program,
    academic_year,
    rng,
    password,
):
    identity = generate_student_identity(
        sequence,
        academic_year,
        rng,
    )

    student = User(
        username=identity.username,
        email=identity.email,
        first_name=identity.first_name,
        last_name=identity.last_name,
        post_name=identity.post_name,
        registration_num=identity.registration_num,
        role=User.Role.STUDENT,
        academic_program=academic_program,
        is_active=True,
    )

    student.set_password(password)
    student.full_clean()
    student.save()

    return student


@transaction.atomic
def seed_students(
    count=DEFAULT_STUDENT_COUNT,
    academic_year=CURRENT_ACADEMIC_YEAR,
    seed=DEFAULT_RANDOM_SEED,
    password=DEFAULT_TEST_PASSWORD,
    skip_existing=True,
):
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        raise ValueError("count doit être un entier supérieur ou égal à 1.")

    validate_academic_year(academic_year)

    programs = get_available_academic_programs()

    if not programs:
        raise RuntimeError(
            "Aucun AcademicProgram actif. "
            "Chargez d'abord le référentiel académique UCB."
        )

    rng = random.Random(seed)
    created = []
    skipped = 0
    start_year = academic_year.split("-")[0]

    for sequence in range(1, count + 1):
        academic_program = rng.choice(programs)

        registration_num = (
            f"UCB-TEST-{start_year}-{sequence:06d}"
        )

        exists = User.objects.filter(
            registration_num=registration_num
        ).exists()

        if skip_existing and exists:
            # Préserve exactement la progression du générateur aléatoire.
            generate_student_identity(
                sequence,
                academic_year,
                rng,
            )
            skipped += 1
            continue

        created.append(
            create_student(
                sequence=sequence,
                academic_program=academic_program,
                academic_year=academic_year,
                rng=rng,
                password=password,
            )
        )

    return {
        "requested": count,
        "created": len(created),
        "skipped": skipped,
        "students": created,
    }