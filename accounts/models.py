from django.db import models
from django.contrib.auth.models import AbstractUser

# 1. Custom User Model (Étudiants & Personnel / Inspecteurs)
class User(AbstractUser):
    class Role(models.TextChoices):
        STUDENT = 'STUDENT', 'Étudiant'
        STAFF = 'STAFF', 'Personnel / Inspecteur'
        ADMIN = 'ADMIN', 'Administrateur'

    email = models.EmailField(unique=True)
    registration_num = models.CharField(
        max_length=50, 
        unique=True, 
        null=True, 
        blank=True,
        help_text="Matricule de l'étudiant ou ID du personnel"
    )
    role = models.CharField(
        max_length=10, 
        choices=Role.choices, 
        default=Role.STUDENT
    )
    
    # Photos / Avatars
    avatar = models.ImageField(
        upload_to='avatars/', 
        null=True, 
        blank=True,
        help_text="Photo d'identité officielle"
    )
    avatar_url = models.URLField(
        max_length=500,
        null=True, 
        blank=True,
        help_text="Lien photo (utilisé pour les tests/avatars générés)"
    )

    @property
    def get_avatar_url(self):
        if self.avatar:
            return self.avatar.url
        if self.avatar_url:
            return self.avatar_url
        name_query = f"{self.first_name}+{self.last_name}" if self.first_name else self.username
        return f"https://ui-avatars.com/api/?name={name_query}&background=0D8ABC&color=fff&size=256"

    def __str__(self):
        full_name = f"{self.first_name} {self.last_name}".strip()
        display_name = full_name if full_name else self.username
        return f"{display_name} - {self.registration_num or 'Sans ID'} ({self.role})"


# 2. Payment Model (Bordereaux bancaires)
class Payment(models.Model):
    class Status(models.TextChoices):
        PAID = 'PAID', 'Payé'
        PENDING = 'PENDING', 'En attente'
        FAILED = 'FAILED', 'Échoué'

    class Semester(models.TextChoices):
        S1 = 'S1', 'Semestre 1'
        S2 = 'S2', 'Semestre 2'

    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payments')
    bank_reference = models.CharField(max_length=100, unique=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    
    academic_year = models.CharField(
        max_length=9, 
        default='2025-2026', 
        help_text="Exemple: 2025-2026"
    )
    semester = models.CharField(
        max_length=2, 
        choices=Semester.choices, 
        default=Semester.S1
    )
    
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PAID)
    payment_date = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.student.registration_num} - {self.academic_year} {self.semester} - ${self.amount}"


# 3. Verification Log Model (Historique des contrôles d'accès)
class VerificationLog(models.Model):
    staff = models.ForeignKey(User, on_delete=models.CASCADE, related_name='verifications_performed')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='verifications_received')
    verified_at = models.DateTimeField(auto_now_add=True)
    method = models.CharField(max_length=20, default='MANUAL_SEARCH') # QR_SCAN ou MANUAL_SEARCH

    def __str__(self):
        return f"Contrôle par {self.staff.username} sur {self.student.registration_num}"



# 4. Bank Transaction Model (Cloned directly from the bank's extrait bancaire)
class BankTransaction(models.Model):
    transaction_reference = models.CharField(max_length=100, unique=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_date = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.transaction_reference} - ${self.amount} ({self.payment_date.strftime('%Y-%m-%d')})"


# 5. Payment Claim / Staging Model (Student submissions waiting for verification)
class PaymentClaim(models.Model):
    class ClaimStatus(models.TextChoices):
        PENDING = 'PENDING', 'En attente'
        APPROVED = 'APPROVED', 'Approuvé'
        REJECTED = 'REJECTED', 'Rejeté'

    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payment_claims')
    submitted_reference = models.CharField(max_length=100)
    bank_transaction = models.OneToOneField(
        BankTransaction, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='claim'
    )
    status = models.CharField(max_length=20, choices=ClaimStatus.choices, default=ClaimStatus.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Claim: {self.student.registration_num} - {self.submitted_reference} [{self.status}]"



