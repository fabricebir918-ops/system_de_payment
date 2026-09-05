from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Bank, UniversityBankAccount

from ...reference_data.ucb_banks import UCB_BANKS


class Command(BaseCommand):
    help = "Charge le référentiel bancaire UCB."

    @transaction.atomic
    def handle(self, *args, **options):
        banks_created = 0
        accounts_created = 0

        for data in UCB_BANKS:
            bank, created = Bank.objects.update_or_create(
                code=data["code"],
                defaults={
                    "name": data["name"],
                    "swift_code": data["swift_code"],
                    "is_active": data["is_active"],
                },
            )
            banks_created += created

            for account in data["accounts"]:
                _, created = UniversityBankAccount.objects.update_or_create(
                    account_number=account["account_number"],
                    defaults={
                        "bank": bank,
                        "currency": account["currency"],
                        "label": account["label"],
                        "is_active": account["is_active"],
                    },
                )
                accounts_created += created

        self.stdout.write(
            self.style.SUCCESS(
                f"Référentiel bancaire chargé : "
                f"{banks_created} banque(s), "
                f"{accounts_created} compte(s) créé(s)."
            )
        )