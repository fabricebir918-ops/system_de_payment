import random
import re
import unicodedata
from dataclasses import dataclass

from .rdc_data import (
    CONGOLESE_NAMES,
    FEMALE,
    FEMALE_FIRST_NAMES,
    MALE,
    MALE_FIRST_NAMES,
    SEXES,
    SEX_WEIGHTS,
    STAFF_EMAIL_DOMAIN,
    STAFF_REGISTRATION_PREFIX,
    STAFF_USERNAME_PREFIX,
    STUDENT_EMAIL_DOMAIN,
    STUDENT_REGISTRATION_PREFIX,
    STUDENT_USERNAME_PREFIX,
)


@dataclass(frozen=True)
class SyntheticIdentity:
    first_name: str
    last_name: str
    post_name: str
    sex: str
    username: str
    email: str
    registration_num: str

    @property
    def full_name(self):
        return f"{self.last_name} {self.post_name} {self.first_name}"


def normalize_identifier(value):
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", ".", value.lower()).strip(".")


def _generate_identity(sequence, user_type, academic_year=None, rng=None):
    if sequence < 1:
        raise ValueError("sequence doit être supérieure ou égale à 1.")

    rng = rng or random.Random()
    sex = rng.choices(SEXES, weights=SEX_WEIGHTS, k=1)[0]

    first_name = rng.choice(
        MALE_FIRST_NAMES if sex == MALE else FEMALE_FIRST_NAMES
    )
    last_name, post_name = rng.sample(CONGOLESE_NAMES, 2)

    if user_type == "student":
        if not academic_year:
            raise ValueError("academic_year est obligatoire pour un étudiant.")

        try:
            start_year, end_year = academic_year.split("-")
        except ValueError:
            raise ValueError(f"Année académique invalide : {academic_year}")

        if (
            len(start_year) != 4
            or len(end_year) != 4
            or not start_year.isdigit()
            or not end_year.isdigit()
            or int(end_year) != int(start_year) + 1
        ):
            raise ValueError(f"Année académique invalide : {academic_year}")

        prefix = STUDENT_USERNAME_PREFIX
        domain = STUDENT_EMAIL_DOMAIN
        registration_num = (
            f"{STUDENT_REGISTRATION_PREFIX}-"
            f"{start_year}-{sequence:06d}"
        )

    elif user_type == "staff":
        prefix = STAFF_USERNAME_PREFIX
        domain = STAFF_EMAIL_DOMAIN
        registration_num = (
            f"{STAFF_REGISTRATION_PREFIX}-{sequence:06d}"
        )

    else:
        raise ValueError(f"Type utilisateur inconnu : {user_type}")

    first = normalize_identifier(first_name)
    last = normalize_identifier(last_name)

    username = f"{prefix}.{first}.{last}.{sequence:06d}"
    email = f"{username}@{domain}"

    return SyntheticIdentity(
        first_name=first_name,
        last_name=last_name,
        post_name=post_name,
        sex=sex,
        username=username,
        email=email,
        registration_num=registration_num,
    )


def generate_student_identity(sequence, academic_year, rng=None):
    return _generate_identity(
        sequence=sequence,
        user_type="student",
        academic_year=academic_year,
        rng=rng,
    )


def generate_staff_identity(sequence, rng=None):
    return _generate_identity(
        sequence=sequence,
        user_type="staff",
        rng=rng,
    )