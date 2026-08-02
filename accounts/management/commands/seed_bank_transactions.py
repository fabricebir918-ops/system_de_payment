from django.core.management.base import BaseCommand
from accounts.models import BankTransaction
from datetime import datetime, timedelta
from decimal import Decimal

class Command(BaseCommand):
    help = 'Creates bank transactions including the ones needed for payments plus 10 extra records'

    def handle(self, *args, **kwargs):
        # Base list containing the 8 references used in the payment seed script, plus 10 extra records
        transactions_data = [
            # The 8 connected to existing payments
            {"ref": "COAB5405", "amount": 150.00, "days_ago": 10},
            {"ref": "COAB5406", "amount": 120.50, "days_ago": 9},
            {"ref": "COAB5407", "amount": 75.00, "days_ago": 8},
            {"ref": "COAB5408", "amount": 200.00, "days_ago": 7},
            {"ref": "COAB5409", "amount": 50.00, "days_ago": 6},
            {"ref": "COAB5410", "amount": 150.00, "days_ago": 5},
            {"ref": "COAB5411", "amount": 100.00, "days_ago": 4},
            {"ref": "COAB5412", "amount": 175.25, "days_ago": 3},
            
            # 10 additional extra bank transactions
            {"ref": "COAB5413", "amount": 220.00, "days_ago": 2},
            {"ref": "COAB5414", "amount": 90.00, "days_ago": 2},
            {"ref": "COAB5415", "amount": 310.50, "days_ago": 1},
            {"ref": "COAB5416", "amount": 45.00, "days_ago": 1},
            {"ref": "COAB5417", "amount": 150.00, "days_ago": 1},
            {"ref": "COAB5418", "amount": 400.00, "days_ago": 0},
            {"ref": "COAB5419", "amount": 65.25, "days_ago": 0},
            {"ref": "COAB5420", "amount": 125.00, "days_ago": 0},
            {"ref": "COAB5421", "amount": 180.00, "days_ago": 0},
            {"ref": "COAB5422", "amount": 250.00, "days_ago": 0},
        ]

        created_count = 0
        now = datetime.now()

        for data in transactions_data:
            if not BankTransaction.objects.filter(transaction_reference=data["ref"]).exists():
                tx_date = now - timedelta(days=data["days_ago"])
                BankTransaction.objects.create(
                    transaction_reference=data["ref"],
                    amount=Decimal(str(data["amount"])),
                    payment_date=tx_date
                )
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f'Successfully created {created_count} bank transactions (including payment matches + 10 extras)!'))
