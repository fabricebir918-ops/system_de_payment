from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from ...seeders.banking import seed_bank_transactions_for_years
from ...seeders.payments import seed_payments
from ...seeders.schedules import seed_schedules
from ...seeders.staff import seed_staff
from ...seeders.students import seed_students
from ...seeders.validators import validate_dataset
from ...seeders.verifications import seed_verifications


class Command(BaseCommand):
    help = "Génère et valide les données de test AcademicPay."

    @transaction.atomic
    def handle(self, *args, **options):
        call_command("seed_ucb")
        call_command("seed_banks")

        seed_students()
        seed_staff()
        seed_bank_transactions_for_years()
        seed_schedules()
        seed_payments()
        seed_verifications()

        report = validate_dataset()

        if not report.is_valid:
            raise CommandError(
                "Dataset invalide :\n" + "\n".join(report.errors)
            )

        self.stdout.write(
            self.style.SUCCESS(
                "Dataset AcademicPay généré et validé."
            )
        )