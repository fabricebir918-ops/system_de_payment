from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from accounts.models import PaymentClaim, BankTransaction

User = get_user_model()

class Command(BaseCommand):
    help = 'Creates student payment claims linked to existing students and bank transactions'

    def handle(self, *args, **kwargs):
        # 1. Verify that students and bank transactions exist
        students = User.objects.filter(role=User.Role.STUDENT)
        bank_transactions = BankTransaction.objects.all()

        if not students.exists():
            self.stdout.write(self.style.ERROR('No students found! Run python manage.py seed_users first.'))
            return

        if not bank_transactions.exists():
            self.stdout.write(self.style.ERROR('No bank transactions found! Run python manage.py seed_bank_transactions first.'))
            return

        # 2. Define payment claims data using the exact bank transaction references we created earlier
        claims_data = [
            {"ref": "COAB5405", "status": PaymentClaim.ClaimStatus.APPROVED},
            {"ref": "COAB5406", "status": PaymentClaim.ClaimStatus.PENDING},
            {"ref": "COAB5407", "status": PaymentClaim.ClaimStatus.APPROVED},
            {"ref": "COAB5408", "status": PaymentClaim.ClaimStatus.APPROVED},
            {"ref": "COAB5409", "status": PaymentClaim.ClaimStatus.REJECTED},
            {"ref": "COAB5413", "status": PaymentClaim.ClaimStatus.PENDING},  # Extra unlinked-to-payment transactions used here
            {"ref": "COAB5414", "status": PaymentClaim.ClaimStatus.PENDING},
        ]

        created_count = 0
        for index, data in enumerate(claims_data):
            # Check if the bank transaction exists in the database
            try:
                tx = BankTransaction.objects.get(transaction_reference=data["ref"])
            except BankTransaction.DoesNotExist:
                self.stdout.write(self.style.WARNING(f"Bank transaction {data['ref']} not found, skipping."))
                continue

            # Assign claims circularly to available students
            student = students[index % students.count()]

            # Prevent duplicate claims for the same reference
            if not PaymentClaim.objects.filter(submitted_reference=data["ref"]).exists():
                PaymentClaim.objects.create(
                    student=student,
                    submitted_reference=data["ref"],
                    bank_transaction=tx,
                    status=data["status"]
                )
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f'Successfully created {created_count} payment claims!'))
