from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import (
    AcademicProgram,
    Department,
    Faculty,
    Program,
)

from ...reference_data.ucb_academic import UCB_ACADEMIC_STRUCTURE


class Command(BaseCommand):
    help = "Charge le référentiel académique UCB."

    @transaction.atomic
    def handle(self, *args, **options):
        counts = {
            "faculties": 0,
            "departments": 0,
            "programs": 0,
            "academic_programs": 0,
        }

        for faculty_data in UCB_ACADEMIC_STRUCTURE:
            faculty, created = Faculty.objects.update_or_create(
                code=faculty_data["code"],
                defaults={
                    "name": faculty_data["name"],
                    "is_active": True,
                },
            )
            counts["faculties"] += created

            for department_data in faculty_data["departments"]:
                department, created = Department.objects.update_or_create(
                    faculty=faculty,
                    code=department_data["code"],
                    defaults={
                        "name": department_data["name"],
                        "is_active": True,
                    },
                )
                counts["departments"] += created

                for program_data in department_data["programs"]:
                    program, created = Program.objects.update_or_create(
                        department=department,
                        code=program_data["code"],
                        defaults={
                            "name": program_data["name"],
                            "is_active": True,
                        },
                    )
                    counts["programs"] += created

                    for level in program_data["levels"]:
                        _, created = AcademicProgram.objects.update_or_create(
                            program=program,
                            level=level,
                            defaults={"is_active": True},
                        )
                        counts["academic_programs"] += created

        self.stdout.write(
            self.style.SUCCESS(
                "Référentiel UCB chargé : "
                f"{counts['faculties']} facultés, "
                f"{counts['departments']} départements, "
                f"{counts['programs']} programmes, "
                f"{counts['academic_programs']} niveaux créés."
            )
        )