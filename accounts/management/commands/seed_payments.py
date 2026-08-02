from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from accounts.models import Payment  # Adjust app name if needed
from datetime import datetime
from decimal import Decimal

User = get_user_model()

class Command(BaseCommand):
    help = 'Creates realistic payment records exclusively for students with lower amounts'

    def handle(self, *args, **kwargs):
        # Fetch ONLY students (ensuring staff have zero payments)
        students = User.objects.filter(role=User.Role.STUDENT)

        if not students.exists():
            self.stdout.write(self.style.ERROR('No students found! Run python manage.py seed_users first.'))
            return

        # Realistic payment data with amounts under 500
        payments_data = [
            {"bank_ref": "COAB5405", "amount": 150.00, "semester": Payment.Semester.S1, "status": Payment.Status.PAID},
            {"bank_ref": "COAB5406", "amount": 120.50, "semester": Payment.Semester.S2, "status": Payment.Status.PENDING},
            {"bank_ref": "COAB5407", "amount": 75.00, "semester": Payment.Semester.S1, "status": Payment.Status.PAID},
            {"bank_ref": "COAB5408", "amount": 200.00, "semester": Payment.Semester.S1, "status": Payment.Status.PAID},
            {"bank_ref": "COAB5409", "amount": 50.00, "semester": Payment.Semester.S2, "status": Payment.Status.FAILED},
            {"bank_ref": "COAB5410", "amount": 150.00, "semester": Payment.Semester.S1, "status": Payment.Status.PAID},
            {"bank_ref": "COAB5411", "amount": 100.00, "semester": Payment.Semester.S2, "status": Payment.Status.PAID},
            {"bank_ref": "COAB5412", "amount": 175.25, "semester": Payment.Semester.S1, "status": Payment.Status.PAID},
        ]

        created_count = 0
        for index, data in enumerate(payments_data):
            # Safely loop through only the available student accounts
            student = students[index % students.count()]

            if not Payment.objects.filter(bank_reference=data["bank_ref"]).exists():
                Payment.objects.create(
                    student=student,
                    bank_reference=data["bank_ref"],
                    amount=Decimal(str(data["amount"])),
                    academic_year="2025-2026",
                    semester=data["semester"],
                    status=data["status"],
                    payment_date=datetime.now()
                )
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f'Successfully created {created_count} payment records for students with amounts under 500!'))
