from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

class Command(BaseCommand):
    help = 'Creates 8 students and 2 staff with realistic names and sequential registration numbers'

    def handle(self, *args, **kwargs):
        # 8 Realistic Students
        students_data = [
            {"first_name": "Fabrice", "last_name": "Birindwa"},
            {"first_name": "Alice", "last_name": "Uwase"},
            {"first_name": "Patrick", "last_name": "Mugabo"},
            {"first_name": "Divine", "last_name": "Ineza"},
            {"first_name": "Cedric", "last_name": "Ndayisaba"},
            {"first_name": "Clarisse", "last_name": "Mutoni"},
            {"first_name": "Eric", "last_name": "Habimana"},
            {"first_name": "Aline", "last_name": "Uwera"},
        ]

        # 2 Realistic Staff Members
        staff_data = [
            {"first_name": "Jean-Paul", "last_name": "Bizimana"},
            {"first_name": "Marie-Chantal", "last_name": "Mukamana"},
        ]

        users_to_create = []
        base_reg_num = 738  # Starts at 06/22.00738

        # Build 8 Student records
        for index, data in enumerate(students_data):
            reg_num = f"06/22.00{base_reg_num + index}"
            username = f"{data['first_name'].lower()}.{data['last_name'].lower()}"
            users_to_create.append({
                'username': username,
                'email': f"{username}@example.com",
                'password': 'password123',
                'first_name': data['first_name'],
                'last_name': data['last_name'],
                'registration_num': reg_num,
                'role': User.Role.STUDENT,
            })

        # Build 2 Staff records
        for index, data in enumerate(staff_data):
            reg_num = f"06/22.00{base_reg_num + 8 + index}"
            username = f"{data['first_name'].lower()}.{data['last_name'].lower()}"
            users_to_create.append({
                'username': username,
                'email': f"{username}@example.com",
                'password': 'password123',
                'first_name': data['first_name'],
                'last_name': data['last_name'],
                'registration_num': reg_num,
                'role': User.Role.STAFF,
            })

        created_count = 0
        for user_data in users_to_create:
            # Prevent duplicate creation crashes if run multiple times
            if not User.objects.filter(registration_num=user_data['registration_num']).exists():
                User.objects.create_user(
                    username=user_data['username'],
                    email=user_data['email'],
                    password=user_data['password'],
                    first_name=user_data['first_name'],
                    last_name=user_data['last_name'],
                    registration_num=user_data['registration_num'],
                    role=user_data['role']
                )
                created_count += 1

        self.stdout.write(self.style.SUCCESS(f'Successfully created {created_count} realistic records (8 students, 2 staff)!'))
