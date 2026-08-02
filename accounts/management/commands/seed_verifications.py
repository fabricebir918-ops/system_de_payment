from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from accounts.models import VerificationLog  # Adjust app name if needed

User = get_user_model()

class Command(BaseCommand):
    help = 'Creates realistic verification logs linking staff and students'

    def handle(self, *args, **kwargs):
        # 1. Verify that staff and students actually exist in the database
        staff_members = User.objects.filter(role=User.Role.STAFF)
        students = User.objects.filter(role=User.Role.STUDENT)

        if not staff_members.exists():
            self.stdout.write(self.style.ERROR('No staff members found! Run python manage.py seed_users first.'))
            return

        if not students.exists():
            self.stdout.write(self.style.ERROR('No students found! Run python manage.py seed_users first.'))
            return

        # 2. Define sample verification data
        verifications_data = [
            {"method": "QR_SCAN"},
            {"method": "MANUAL_SEARCH"},
            {"method": "QR_SCAN"},
            {"method": "MANUAL_SEARCH"},
            {"method": "QR_SCAN"},
        ]

        created_count = 0
        for index, data in enumerate(verifications_data):
            # Safely loop through available staff and students circularly
            staff = staff_members[index % staff_members.count()]
            student = students[index % students.count()]

            # Create the verification log entry
            VerificationLog.objects.create(
                staff=staff,
                student=student,
                method=data["method"]
            )
            created_count += 1

        self.stdout.write(self.style.SUCCESS(f'Successfully created {created_count} verification logs (verified by staff on students)!'))
