from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.html import format_html
from .models import User, Payment, VerificationLog, BankTransaction, PaymentClaim


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    # Columns displayed in the user list table
    list_display = ('display_avatar', 'username', 'registration_num', 'first_name', 'last_name', 'role', 'is_staff')
    list_filter = ('role', 'is_staff', 'is_superuser', 'is_active')
    search_fields = ('username', 'registration_num', 'first_name', 'last_name', 'email')
    ordering = ('registration_num', 'username')

    # Add custom fields (role, registration_num, avatar, avatar_url) to Admin detail view
    fieldsets = UserAdmin.fieldsets + (
        ('Informations Étudiant / Personnel', {
            'fields': ('role', 'registration_num', 'avatar', 'avatar_url')
        }),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Informations Étudiant / Personnel', {
            'fields': ('role', 'registration_num', 'avatar', 'avatar_url')
        }),
    )

    # Render small image thumbnail directly in the list table
    def display_avatar(self, obj):
        url = obj.get_avatar_url
        return format_html('<img src="{}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;" />', url)
    
    display_avatar.short_description = 'Photo'


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('bank_reference', 'student_info', 'amount', 'academic_year', 'semester', 'status', 'payment_date')
    list_filter = ('status', 'academic_year', 'semester')
    search_fields = ('bank_reference', 'student__registration_num', 'student__username', 'student__first_name', 'student__last_name')
    ordering = ('-payment_date',)

    def student_info(self, obj):
        return f"{obj.student.get_full_name() or obj.student.username} ({obj.student.registration_num})"
    student_info.short_description = 'Étudiant'


@admin.register(VerificationLog)
class VerificationLogAdmin(admin.ModelAdmin):
    list_display = ('verified_at', 'staff', 'student', 'method')
    list_filter = ('method', 'verified_at')
    search_fields = ('staff__username', 'student__registration_num', 'student__first_name', 'student__last_name')
    ordering = ('-verified_at',)


# ... (keep your existing CustomUserAdmin, PaymentAdmin, and VerificationLogAdmin above) ...


@admin.register(BankTransaction)
class BankTransactionAdmin(admin.ModelAdmin):
    list_display = ('transaction_reference', 'amount', 'payment_date', 'created_at')
    search_fields = ('transaction_reference',)
    list_filter = ('payment_date', 'created_at')
    ordering = ('-payment_date',)


@admin.register(PaymentClaim)
class PaymentClaimAdmin(admin.ModelAdmin):
    list_display = ('submitted_reference', 'student_info', 'status', 'bank_transaction', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('submitted_reference', 'student__registration_num', 'student__username', 'student__first_name', 'student__last_name')
    ordering = ('-created_at',)

    def student_info(self, obj):
        return f"{obj.student.get_full_name() or obj.student.username} ({obj.student.registration_num})"
    student_info.short_description = 'Étudiant'
