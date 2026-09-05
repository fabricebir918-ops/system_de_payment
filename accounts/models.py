from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


positive_amount = MinValueValidator(Decimal("0.01"))


# ============================================================
# RÉFÉRENTIEL ACADÉMIQUE
# ============================================================

class Faculty(models.Model):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=150, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Department(models.Model):
    faculty = models.ForeignKey(
        Faculty, on_delete=models.PROTECT, related_name="departments"
    )
    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["faculty__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["faculty", "name"],
                name="unique_department_per_faculty",
            )
        ]

    def __str__(self):
        return f"{self.faculty} - {self.name}"


class Program(models.Model):
    department = models.ForeignKey(
        Department, on_delete=models.PROTECT, related_name="programs"
    )
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["department__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["department", "name"],
                name="unique_program_per_department",
            )
        ]

    def __str__(self):
        return self.name


class AcademicLevel(models.TextChoices):
    PREPARATOIRE = "PREPA", "Préparatoire"
    BAC0 = "BAC0", "BAC0"
    BAC1 = "BAC1", "BAC1"
    BAC2 = "BAC2", "BAC2"
    BAC3 = "BAC3", "BAC3"
    M1 = "M1", "Master 1"
    M2 = "M2", "Master 2"
    M3 = "M3", "Master 3"
    DOC4 = "DOC4", "Doctorat 4"


class AcademicProgram(models.Model):
    program = models.ForeignKey(
        Program,
        on_delete=models.PROTECT,
        related_name="academic_programs",
    )
    level = models.CharField(max_length=10, choices=AcademicLevel.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["program__name", "level"]
        constraints = [
            models.UniqueConstraint(
                fields=["program", "level"],
                name="unique_program_level",
            )
        ]

    def __str__(self):
        return f"{self.get_level_display()} - {self.program}"


# ============================================================
# UTILISATEURS
# ============================================================

class User(AbstractUser):
    class Role(models.TextChoices):
        STUDENT = "STUDENT", "Étudiant"
        STAFF = "STAFF", "Personnel / Inspecteur"
        ADMIN = "ADMIN", "Administrateur"

    class StaffRole(models.TextChoices):
        SURVEILLANT = "SURVEILLANT", "Surveillant"
        CAISSIER = "CAISSIER", "Caissier"
        FINANCIER = "RESPONSABLE_FINANCIER", "Responsable financier"

    email = models.EmailField(unique=True)
    post_name = models.CharField(max_length=150, blank=True)

    registration_num = models.CharField(
        max_length=50,
        unique=True,
        null=True,
        blank=True,
    )

    role = models.CharField(
        max_length=30,
        choices=Role.choices,
        default=Role.STUDENT,
    )

    staff_role = models.CharField(
        max_length=30,
        choices=StaffRole.choices,
        null=True,
        blank=True,
    )

    # Situation académique actuelle uniquement.
    # AcademicPay ne gère pas les inscriptions.
    academic_program = models.ForeignKey(
        AcademicProgram,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="students",
    )

    avatar = models.ImageField(
        upload_to="avatars/",
        null=True,
        blank=True,
    )

    avatar_url = models.URLField(
        max_length=500,
        null=True,
        blank=True,
    )

    @property
    def faculty(self):
        return (
            self.academic_program.program.department.faculty
            if self.academic_program_id
            else None
        )

    @property
    def department(self):
        return (
            self.academic_program.program.department
            if self.academic_program_id
            else None
        )

    @property
    def promotion(self):
        return self.academic_program.level if self.academic_program_id else None

    @property
    def full_congolese_name(self):
        return " ".join(
            filter(
                None,
                [self.last_name, self.post_name, self.first_name],
            )
        )

    @property
    def get_avatar_url(self):
        if self.avatar:
            return self.avatar.url
        if self.avatar_url:
            return self.avatar_url

        name = self.full_congolese_name or self.username
        return (
            "https://ui-avatars.com/api/"
            f"?name={name}&background=0D8ABC&color=fff&size=256"
        )

    def clean(self):
        super().clean()

        if self.role == self.Role.STUDENT:
            if self.staff_role:
                raise ValidationError(
                    {"staff_role": "Un étudiant ne peut pas avoir un rôle du personnel."}
                )
            if not self.academic_program:
                raise ValidationError(
                    {"academic_program": "Le programme académique est obligatoire."}
                )

        elif self.role == self.Role.STAFF:
            if not self.staff_role:
                raise ValidationError(
                    {"staff_role": "Le rôle du personnel est obligatoire."}
                )
            if self.academic_program:
                raise ValidationError(
                    {"academic_program": "Le personnel ne peut pas avoir de programme académique."}
                )

    def __str__(self):
        name = self.full_congolese_name or self.username
        return f"{name} - {self.registration_num or 'Sans ID'} ({self.role})"


# ============================================================
# BANQUES
# ============================================================

class Bank(models.Model):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=100, unique=True)
    swift_code = models.CharField(max_length=20, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class UniversityBankAccount(models.Model):
    bank = models.ForeignKey(
        Bank,
        on_delete=models.PROTECT,
        related_name="university_accounts",
    )
    account_number = models.CharField(max_length=100)
    currency = models.CharField(max_length=3, default="USD")
    label = models.CharField(max_length=150, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["bank", "account_number"],
                name="unique_university_bank_account",
            )
        ]

    def __str__(self):
        return f"{self.bank} - {self.account_number} ({self.currency})"




# ============================================================
# EXTRAITS BANCAIRES
# ============================================================

class BankStatement(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "À traiter"
        PARTIAL = "PARTIAL", "Partiellement rapproché"
        PROCESSED = "PROCESSED", "Traité"
        ERROR = "ERROR", "Erreur"

    file = models.FileField(
        upload_to="bank_statements/"
    )

    bank_account = models.ForeignKey(
        UniversityBankAccount,
        on_delete=models.PROTECT,
        related_name="statements",
    )

    start_date = models.DateField()
    end_date = models.DateField()

    imported_at = models.DateTimeField(
        default=timezone.now
    )

    imported_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="bank_statements_imported",
    )

    academic_year = models.CharField(
        max_length=9,
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    created_at = models.DateTimeField(
        default=timezone.now
    )

    class Meta:
        ordering = ["-imported_at"]

    def __str__(self):
        return (
            f"{self.file.name} - "
            f"{self.bank_account.bank.name} - "
            f"{self.start_date} → {self.end_date}"
        )
# ============================================================
# TRANSACTIONS BANCAIRES
# ============================================================

class BankTransaction(models.Model):
    transaction_reference = models.CharField(max_length=100, unique=True)


    statement = models.ForeignKey(
        BankStatement,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="transactions",
    )

    bank_account = models.ForeignKey(
        UniversityBankAccount,
        on_delete=models.PROTECT,
        related_name="transactions",
    )

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[positive_amount],
    )

    payment_date = models.DateTimeField()
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    # Compatibilité avec le backend existant.
    @property
    def bank_name(self):
        return self.bank_account.bank.name

    @property
    def account_number(self):
        return self.bank_account.account_number

    def __str__(self):
        status = "Vérifié" if self.is_verified else "En attente"
        return (
            f"[{self.bank_name}] {self.transaction_reference} - "
            f"{self.amount} ({status})"
        )

    def clean(self):
        super().clean()

        if self.statement_id and self.bank_account_id:
            if self.statement.bank_account_id != self.bank_account_id:
                raise ValidationError(
                    {
                        "bank_account": (
                            "La transaction doit appartenir au même compte "
                            "bancaire que l'extrait."
                        )
                    }
                )


# ============================================================
# DÉCLARATIONS DE PAIEMENT
# ============================================================

class PaymentClaim(models.Model):
    class ClaimStatus(models.TextChoices):
        PENDING = "PENDING", "En attente"
        APPROVED = "APPROVED", "Validé"
        REJECTED = "REJECTED", "Anomalie"

    class Semester(models.TextChoices):
        S1 = "S1", "Semestre 1"
        S2 = "S2", "Semestre 2"

    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="payment_claims",
    )

    submitted_reference = models.CharField(max_length=100)

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[positive_amount],
    )

    payment_date = models.DateTimeField()

    bank = models.ForeignKey(
        Bank,
        on_delete=models.PROTECT,
        related_name="payment_claims",
    )

    academic_year = models.CharField(
        max_length=9,
        default="2026-2027",
    )

    semester = models.CharField(
        max_length=2,
        choices=Semester.choices,
        default=Semester.S1,
    )

    bank_transaction = models.OneToOneField(
        BankTransaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="claim",
    )

    status = models.CharField(
        max_length=20,
        choices=ClaimStatus.choices,
        default=ClaimStatus.PENDING,
    )

    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    # Compatibilité avec le backend utilisant claim.bank_name.
    @property
    def bank_name(self):
        return self.bank.code

    def clean(self):
        super().clean()

        if self.student_id and self.student.role != User.Role.STUDENT:
            raise ValidationError(
                {"student": "La déclaration doit appartenir à un étudiant."}
            )

        if self.status == self.ClaimStatus.APPROVED:
            if not self.bank_transaction or not self.is_verified:
                raise ValidationError(
                    "Une déclaration validée doit être rapprochée et vérifiée."
                )

        if self.is_verified and not self.bank_transaction:
            raise ValidationError(
                {"bank_transaction": "Une déclaration vérifiée exige une transaction."}
            )

    def __str__(self):
        return (
            f"Claim: {self.student.registration_num} - "
            f"{self.submitted_reference} "
            f"[{self.bank.name} : ${self.amount}]"
        )


# ============================================================
# PAIEMENTS VALIDÉS
# ============================================================

class Payment(models.Model):
    class Status(models.TextChoices):
        PAID = "PAID", "Payé"
        PENDING = "PENDING", "En attente"
        FAILED = "FAILED", "Échoué"

    class Semester(models.TextChoices):
        S1 = "S1", "Semestre 1"
        S2 = "S2", "Semestre 2"

    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="payments",
    )

    claim = models.OneToOneField(
        PaymentClaim,
        on_delete=models.PROTECT,
        related_name="payment",
    )

    bank_reference = models.CharField(
        max_length=100,
        unique=True,
    )

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[positive_amount],
    )

    academic_year = models.CharField(
        max_length=9,
        default="2026-2027",
    )

    semester = models.CharField(
        max_length=2,
        choices=Semester.choices,
        default=Semester.S1,
    )

    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PAID,
    )

    payment_date = models.DateTimeField()
    created_at = models.DateTimeField(default=timezone.now)

    def clean(self):
        super().clean()

        if self.student_id and self.student.role != User.Role.STUDENT:
            raise ValidationError(
                {"student": "Le paiement doit appartenir à un étudiant."}
            )

        if self.claim.student_id != self.student_id:
            raise ValidationError(
                {"claim": "Le claim appartient à un autre étudiant."}
            )

        if (
            self.claim.status != PaymentClaim.ClaimStatus.APPROVED
            or not self.claim.is_verified
        ):
            raise ValidationError(
                {"claim": "Seul un claim validé peut produire un paiement."}
            )

    def __str__(self):
        return (
            f"{self.student.registration_num} - "
            f"{self.academic_year} {self.semester} - ${self.amount}"
        )

# ============================================================
# ÉCHÉANCIERS
# ============================================================

class FeeSchedule(models.Model):
    class Status(models.TextChoices):
        ACTIF = "ACTIF", "Actif"
        BROUILLON = "BROUILLON", "Brouillon"
        CLOTUREE = "CLOTUREE", "Clôturée"

    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        limit_choices_to={"staff_role": User.StaffRole.FINANCIER},
        related_name="echeances_created",
    )

    academic_program = models.ForeignKey(
        AcademicProgram,
        on_delete=models.PROTECT,
        related_name="echeances",
    )

    academic_year = models.CharField(
        max_length=9,
        default="2026-2027",
    )

    total_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[positive_amount],
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.BROUILLON,
    )

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["academic_program", "academic_year"],
                name="unique_echeance_program_year",
            )
        ]

    # Compatibilité de lecture avec l'ancien modèle.
    @property
    def faculty(self):
        return self.academic_program.program.department.faculty

    @property
    def promotion(self):
        return self.academic_program.level

    def clean(self):
        super().clean()

        if self.created_by_id and (
            self.created_by.role != User.Role.STAFF
            or self.created_by.staff_role != User.StaffRole.FINANCIER
        ):
            raise ValidationError(
                {"created_by": "L'échéancier doit être créé par un responsable financier."}
            )

    def __str__(self):
        return (
            f"Échéancier {self.academic_year} - "
            f"{self.academic_program} : ${self.total_amount}"
        )


class FeeInstallment(models.Model):
    fee_schedule = models.ForeignKey(
        FeeSchedule,
        on_delete=models.CASCADE,
        related_name="installments",
    )

    title = models.CharField(
        max_length=100,
        default="Tranche",
    )

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[positive_amount],
    )

    due_date = models.DateField()
    installment_number = models.PositiveSmallIntegerField(default=1)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["installment_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["fee_schedule", "installment_number"],
                name="unique_installment_number",
            )
        ]

    def __str__(self):
        return (
            f"{self.title} - {self.amount}$ "
            f"(Limite: {self.due_date})"
        )

# ============================================================
# ANOMALIES
# ============================================================

class PaymentAnomaly(models.Model):
    class Type(models.TextChoices):
        REFERENCE_NOT_FOUND = "REFERENCE_NOT_FOUND", "Référence introuvable"
        REFERENCE_ALREADY_USED = "REFERENCE_ALREADY_USED", "Référence déjà utilisée"
        AMOUNT_MISMATCH = "AMOUNT_MISMATCH", "Montant incohérent"
        BANK_MISMATCH = "BANK_MISMATCH", "Banque incohérente"
        DATE_MISMATCH = "DATE_MISMATCH", "Date incohérente"
        DUPLICATE_CLAIM = "DUPLICATE_CLAIM", "Déclaration en double"
        OTHER = "OTHER", "Autre"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Ouverte"
        RESOLVED = "RESOLVED", "Résolue"
        REJECTED = "REJECTED", "Rejetée"

    claim = models.ForeignKey(
        PaymentClaim,
        on_delete=models.CASCADE,
        related_name="anomalies",
    )

    anomaly_type = models.CharField(
        max_length=30,
        choices=Type.choices,
    )

    description = models.TextField(blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
    )

    created_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return (
            f"{self.get_anomaly_type_display()} - "
            f"{self.claim.submitted_reference}"
        )


# ============================================================
# CONTRÔLES DES SURVEILLANTS
# ============================================================

class VerificationLog(models.Model):
    class Method(models.TextChoices):
        MANUAL_SEARCH = "MANUAL_SEARCH", "Recherche manuelle"
        QR_SCAN = "QR_SCAN", "Scan QR"

    staff = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="verifications_performed",
    )

    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="verifications_received",
    )

    # default permet aussi de générer des historiques multi-années.
    verified_at = models.DateTimeField(default=timezone.now)

    method = models.CharField(
        max_length=20,
        choices=Method.choices,
        default=Method.MANUAL_SEARCH,
    )

    is_financially_clear = models.BooleanField(default=False)

    def clean(self):
        super().clean()

        if self.staff_id and (
            self.staff.role != User.Role.STAFF
            or self.staff.staff_role != User.StaffRole.SURVEILLANT
        ):
            raise ValidationError(
                {"staff": "Le contrôle doit être effectué par un surveillant."}
            )

        if self.student_id and self.student.role != User.Role.STUDENT:
            raise ValidationError(
                {"student": "La personne contrôlée doit être un étudiant."}
            )

    def __str__(self):
        return (
            f"Contrôle par {self.staff.username} "
            f"sur {self.student.registration_num}"
        )