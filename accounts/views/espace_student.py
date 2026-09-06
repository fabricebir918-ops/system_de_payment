# views/espace_etudiant.py
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth import update_session_auth_hash
from django.db.models import Sum, Q
from django.contrib import messages
from django.utils import timezone
from datetime import datetime
from django.http import HttpResponseForbidden, JsonResponse,  HttpResponse
from django.db import transaction
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
import io
from ..models import (
    User, Payment, PaymentClaim, FeeSchedule, 
    FeeInstallment, PaymentAnomaly,Bank,
)


ACADEMIC_YEAR = "2026-2027"

# ============================================================
# AUTHORIZATION DECORATOR
# ============================================================

def etudiant_required(view_func):
    """
    Decorator to check if user is a Student.
    """
    def wrapper(request, *args, **kwargs):
        if not (
            request.user.is_authenticated and
            request.user.role == User.Role.STUDENT
        ):
            return HttpResponseForbidden("Accès réservé aux étudiants.")
        return view_func(request, *args, **kwargs)
    return wrapper


# ============================================================
# STUDENT DASHBOARD
# ============================================================

@login_required
@etudiant_required
def student_dashboard(request):
    
    user = request.user
    
    # ========================================================
    # GET FEE SCHEDULE
    # ========================================================
    
    fee_schedule = None
    total_fees = 0
    installments = []
    
    if user.academic_program:
        try:
            fee_schedule = FeeSchedule.objects.get(
                academic_program=user.academic_program,
                academic_year=ACADEMIC_YEAR,
                status=FeeSchedule.Status.ACTIF
            )
            total_fees = fee_schedule.total_amount
            installments = fee_schedule.installments.all().order_by('installment_number')
        except FeeSchedule.DoesNotExist:
            pass
    
    # ========================================================
    # GET PAYMENTS
    # ========================================================
    
    # Total paid
    total_paid = Payment.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR,
        status=Payment.Status.PAID
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    # Remaining balance
    remaining_balance = total_fees - total_paid if total_fees else 0
    
    # Payment percentage
    if total_fees > 0:
        paid_percentage = round((total_paid / total_fees) * 100, 1)
    else:
        paid_percentage = 0
    
    # ========================================================
    # SEMESTER BREAKDOWN
    # ========================================================
    
    semester1_paid = Payment.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR,
        semester=Payment.Semester.S1,
        status=Payment.Status.PAID
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    semester2_paid = Payment.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR,
        semester=Payment.Semester.S2,
        status=Payment.Status.PAID
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    # For now, assume 50% of fees per semester
    semester1_total = total_fees / 2 if total_fees else 0
    semester2_total = total_fees / 2 if total_fees else 0
    
    semester1_remaining = semester1_total - semester1_paid
    semester2_remaining = semester2_total - semester2_paid
    
    semester1_status = 'complete' if semester1_remaining <= 0 else 'current'
    semester2_status = 'complete' if semester2_remaining <= 0 else 'current'
    
    # ========================================================
    # NEXT DEADLINE
    # ========================================================
    
    next_installment = None
    next_deadline_date = None
    next_deadline_amount = 0
    
    # Find the next unpaid installment
    for installment in installments:
        # Check if this installment is paid
        # For simplicity, check if student has paid at least this amount
        if total_paid < installment.amount * installment.installment_number:
            next_installment = installment
            next_deadline_date = installment.due_date
            next_deadline_amount = installment.amount
            break
    
    # If no next installment found, use the last one
    if not next_installment and installments:
        last_installment = installments.last()
        next_deadline_date = last_installment.due_date
        next_deadline_amount = remaining_balance
    
    # ========================================================
    # RECENT PAYMENTS (last 5)
    # ========================================================
    
    recent_payments = Payment.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR
    ).select_related('claim').order_by('-created_at')[:5]
    
    # ========================================================
    # RECENT CLAIMS (pending)
    # ========================================================
    
    recent_claims = PaymentClaim.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR
    ).order_by('-created_at')[:5]
    
    # ========================================================
    # CHECK FOR ANOMALIES
    # ========================================================
    
    has_anomaly = PaymentAnomaly.objects.filter(
        claim__student=user,
        claim__academic_year=ACADEMIC_YEAR,
        status=PaymentAnomaly.Status.OPEN
    ).exists()
    
    # ========================================================
    # CONTEXT
    # ========================================================
    
    context = {
        'user': user,
        'total_fees': total_fees,
        'total_paid': total_paid,
        'remaining_balance': remaining_balance,
        'paid_percentage': paid_percentage,
        'semester1_paid': semester1_paid,
        'semester1_total': semester1_total,
        'semester1_remaining': semester1_remaining,
        'semester1_status': semester1_status,
        'semester2_paid': semester2_paid,
        'semester2_total': semester2_total,
        'semester2_remaining': semester2_remaining,
        'semester2_status': semester2_status,
        'next_deadline_date': next_deadline_date,
        'next_deadline_amount': next_deadline_amount,
        'recent_payments': recent_payments,
        'recent_claims': recent_claims,
        'has_anomaly': has_anomaly,
        'current_academic_year': ACADEMIC_YEAR,
        'installments': installments,
        'fee_schedule': fee_schedule,
    }
    
    return render(request, 'espace_etudiant/dashboard.html', context)




# ============================================================
# STUDENT PAYMENTS
# ============================================================

@login_required
@etudiant_required
def student_payments(request):

    user = request.user
    
    # ========================================================
    # BASE QUERY
    # ========================================================
    
    # Get all payments for this student
    payments = Payment.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR
    ).select_related('claim').order_by('-created_at')
    
    # Also get claims that haven't been converted to payments yet (pending)
    claims = PaymentClaim.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR,
        status__in=[PaymentClaim.ClaimStatus.PENDING, PaymentClaim.ClaimStatus.REJECTED]
    ).select_related('bank').order_by('-created_at')
    
    # ========================================================
    # APPLY FILTERS
    # ========================================================
    
    # Search filter (by reference)
    search_query = request.GET.get('search', '').strip()
    if search_query:
        payments = payments.filter(
            Q(bank_reference__icontains=search_query) |
            Q(claim__submitted_reference__icontains=search_query)
        )
        claims = claims.filter(
            Q(submitted_reference__icontains=search_query)
        )
    
    # Status filter
    status_filter = request.GET.get('status', 'all')
    if status_filter == 'validated':
        payments = payments.filter(status=Payment.Status.PAID)
    elif status_filter == 'pending':
        payments = payments.filter(status=Payment.Status.PENDING)
        claims = claims.filter(status=PaymentClaim.ClaimStatus.PENDING)
    elif status_filter == 'anomaly':
        # Claims with anomalies
        claims_with_anomalies = PaymentAnomaly.objects.filter(
            claim__student=user,
            claim__academic_year=ACADEMIC_YEAR,
            status=PaymentAnomaly.Status.OPEN
        ).values_list('claim_id', flat=True)
        claims = claims.filter(id__in=claims_with_anomalies)
    
    # Semester filter
    semester_filter = request.GET.get('semester', 'all')
    if semester_filter == '1':
        payments = payments.filter(semester=Payment.Semester.S1)
        claims = claims.filter(semester=PaymentClaim.Semester.S1)
    elif semester_filter == '2':
        payments = payments.filter(semester=Payment.Semester.S2)
        claims = claims.filter(semester=PaymentClaim.Semester.S2)
    
    # Year filter
    year_filter = request.GET.get('year', ACADEMIC_YEAR)
    if year_filter and year_filter != 'all':
        payments = payments.filter(academic_year=year_filter)
        claims = claims.filter(academic_year=year_filter)
    
    # ========================================================
    # COMBINE PAYMENTS AND CLAIMS
    # ========================================================
    
    # Convert claims to a format similar to payments for the template
    combined_payments = []
    
    # Add payments
    for payment in payments:
        combined_payments.append({
            'type': 'payment',
            'id': payment.id,
            'reference': payment.bank_reference,
            'date': payment.created_at,
            'amount': payment.amount,
            'semester': payment.semester,
            'status': payment.status,
            'status_display': payment.get_status_display(),
            'year': payment.academic_year,
            'is_validated': payment.status == Payment.Status.PAID,
            'is_pending': payment.status == Payment.Status.PENDING,
            'is_anomaly': False,
            'url': f"/student/payment/{payment.id}/",
            'receipt_available': payment.status == Payment.Status.PAID,
        })
    
    # Add claims (pending ones)
    for claim in claims:
        # Check if this claim has anomalies
        has_anomaly = PaymentAnomaly.objects.filter(
            claim=claim,
            status=PaymentAnomaly.Status.OPEN
        ).exists()
        
        combined_payments.append({
            'type': 'claim',
            'id': claim.id,
            'reference': claim.submitted_reference,
            'date': claim.created_at,
            'amount': claim.amount,
            'semester': claim.semester,
            'status': 'PENDING' if not has_anomaly else 'ANOMALY',
            'status_display': 'En attente' if not has_anomaly else 'Anomalie',
            'year': claim.academic_year,
            'is_validated': False,
            'is_pending': not has_anomaly,
            'is_anomaly': has_anomaly,
            'url': f"/student/payment/{claim.id}/",
            'receipt_available': False,
        })
    
    # Sort by date (newest first)
    combined_payments.sort(key=lambda x: x['date'], reverse=True)
    
    # ========================================================
    # STATS
    # ========================================================
    
    total_paid = Payment.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR,
        status=Payment.Status.PAID
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    validated_count = Payment.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR,
        status=Payment.Status.PAID
    ).count()
    
    pending_count = PaymentClaim.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR,
        status=PaymentClaim.ClaimStatus.PENDING
    ).count()
    
    anomaly_count = PaymentAnomaly.objects.filter(
        claim__student=user,
        claim__academic_year=ACADEMIC_YEAR,
        status=PaymentAnomaly.Status.OPEN
    ).count()
    
    # ========================================================
    # PAGINATION
    # ========================================================
    
    paginator = Paginator(combined_payments, 20)
    page = request.GET.get('page', 1)
    
    try:
        payments_page = paginator.page(page)
    except PageNotAnInteger:
        payments_page = paginator.page(1)
    except EmptyPage:
        payments_page = paginator.page(paginator.num_pages)
    
    # ========================================================
    # AJAX RESPONSE
    # ========================================================
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        payments_data = []
        for payment in payments_page:
            # Determine status class
            if payment['is_validated']:
                status_class = 'valid'
            elif payment['is_pending']:
                status_class = 'pending'
            else:
                status_class = 'error'
            
            payments_data.append({
                'id': payment['id'],
                'type': payment['type'],
                'reference': payment['reference'],
                'date': payment['date'].strftime('%d/%m/%Y'),
                'amount': f"{payment['amount']:,.2f} $",
                'semester': payment['semester'],
                'status': payment['status'],
                'status_display': payment['status_display'],
                'status_class': status_class,
                'year': payment['year'],
                'receipt_available': payment['receipt_available'],
                'url': payment['url'],
            })
        
        return JsonResponse({
            'payments': payments_data,
            'total': paginator.count,
            'page': payments_page.number,
            'num_pages': paginator.num_pages,
            'has_next': payments_page.has_next(),
            'has_previous': payments_page.has_previous(),
            'total_paid': f"{total_paid:,.2f} $",
            'validated_count': validated_count,
            'pending_count': pending_count,
            'anomaly_count': anomaly_count,
            'result_count': paginator.count,
        })
    
    # ========================================================
    # CONTEXT
    # ========================================================
    
    context = {
        'user': user,
        'payments': payments_page,
        'paginator': paginator,
        'total_paid': total_paid,
        'validated_count': validated_count,
        'pending_count': pending_count,
        'anomaly_count': anomaly_count,
        'search_query': search_query,
        'status_filter': status_filter,
        'semester_filter': semester_filter,
        'year_filter': year_filter,
        'result_count': paginator.count,
        'current_academic_year': ACADEMIC_YEAR,
    }
    
    return render(request, 'espace_etudiant/student.html', context)



# ============================================================
# STUDENT DECLARE PAYMENT
# ============================================================

@login_required
@etudiant_required
def student_declare_payment(request):

    
    user = request.user
    
    # ========================================================
    # GET BANKS FOR DROPDOWN
    # ========================================================
    
    banks = Bank.objects.filter(is_active=True).order_by('name')
    
    # ========================================================
    # GET STUDENT FINANCIAL SITUATION
    # ========================================================
    
    # Get fee schedule for student's program
    fee_schedule = None
    total_fees = 0
    semester1_total = 0
    semester2_total = 0
    
    if user.academic_program:
        try:
            fee_schedule = FeeSchedule.objects.get(
                academic_program=user.academic_program,
                academic_year=ACADEMIC_YEAR,
                status=FeeSchedule.Status.ACTIF
            )
            total_fees = fee_schedule.total_amount
            # Assume 50% per semester
            semester1_total = total_fees / 2
            semester2_total = total_fees / 2
        except FeeSchedule.DoesNotExist:
            pass
    
    # Get total paid
    from django.db.models import Sum
    from ..models import Payment
    
    total_paid = Payment.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR,
        status=Payment.Status.PAID
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    # Remaining balance
    remaining_balance = total_fees - total_paid if total_fees else 0
    
    # Semester breakdown (simplified)
    semester1_paid = Payment.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR,
        semester=Payment.Semester.S1,
        status=Payment.Status.PAID
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    semester2_paid = Payment.objects.filter(
        student=user,
        academic_year=ACADEMIC_YEAR,
        semester=Payment.Semester.S2,
        status=Payment.Status.PAID
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    semester1_remaining = semester1_total - semester1_paid
    semester2_remaining = semester2_total - semester2_paid
    
    # ========================================================
    # HANDLE FORM SUBMISSION
    # ========================================================
    
    if request.method == 'POST':
        # Check if AJAX request
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        
        # Get form data
        bank_id = request.POST.get('bank')
        reference = request.POST.get('transactionReference', '').strip().upper()
        amount = request.POST.get('amount')
        payment_date = request.POST.get('paymentDate')
        academic_year = request.POST.get('academicYear', ACADEMIC_YEAR)
        semester = request.POST.get('semester')
        confirmation = request.POST.get('confirmation')
        
        errors = []
        
        # Validate bank
        if not bank_id:
            errors.append("Veuillez sélectionner la banque.")
        
        # Validate reference
        reference_already_used = False

        if not reference:
            errors.append("Veuillez saisir la référence de transaction.")
        elif len(reference) < 5:
            errors.append("La référence de transaction semble trop courte.")
        elif not all(c.isalnum() or c in '-/' for c in reference):
            errors.append("La référence contient des caractères non autorisés.")
        else:
            # Référence déjà déclarée : on ne bloque plus la
            # soumission. La déclaration est tout de même créée,
            # mais une anomalie REFERENCE_ALREADY_USED est ouverte
            # dessus pour que le responsable financier tranche
            # (double déclaration légitime vs erreur/fraude).
            reference_already_used = PaymentClaim.objects.filter(
                submitted_reference=reference,
                academic_year=ACADEMIC_YEAR
            ).exists()
        
        # Validate amount
        try:
            amount = float(amount) if amount else 0
            if amount <= 0:
                errors.append("Le montant doit être supérieur à zéro.")
            elif amount > 100000:
                errors.append("Veuillez vérifier le montant saisi.")
        except (ValueError, TypeError):
            errors.append("Veuillez saisir un montant valide.")
        
        # Validate payment date
        if not payment_date:
            errors.append("Veuillez sélectionner la date du paiement.")
        else:
            try:
                payment_date_obj = datetime.strptime(payment_date, '%Y-%m-%d').date()
                if payment_date_obj > timezone.now().date():
                    errors.append("La date du paiement ne peut pas être dans le futur.")
            except ValueError:
                errors.append("La date sélectionnée n'est pas valide.")
        
        # Validate semester
        if not semester:
            errors.append("Veuillez sélectionner le semestre concerné.")
        
        # Validate confirmation
        if not confirmation:
            errors.append("Vous devez confirmer l'exactitude des informations.")
        
        if errors:
            if is_ajax:
                return JsonResponse({'success': False, 'errors': errors}, status=400)
            else:
                for error in errors:
                    messages.error(request, error)
                return render(request, 'espace_etudiant/declare-payment.html', {
                    'user': user,
                    'banks': banks,
                    'remaining_balance': remaining_balance,
                    'semester1_remaining': semester1_remaining,
                    'semester2_remaining': semester2_remaining,
                    'total_fees': total_fees,
                    'total_paid': total_paid,
                    'current_academic_year': ACADEMIC_YEAR,
                    'form_data': request.POST,
                })
        
        # Create PaymentClaim
        try:
            with transaction.atomic():
                bank = Bank.objects.get(id=bank_id)
                
                # Map semester value to model choice
                semester_map = {
                    'semester-1': PaymentClaim.Semester.S1,
                    'semester-2': PaymentClaim.Semester.S2,
                }
                semester_choice = semester_map.get(semester, PaymentClaim.Semester.S1)
                
                # Create the claim
                claim = PaymentClaim.objects.create(
                    student=user,
                    submitted_reference=reference,
                    amount=amount,
                    payment_date=payment_date_obj,
                    bank=bank,
                    academic_year=academic_year,
                    semester=semester_choice,
                    status=PaymentClaim.ClaimStatus.PENDING,
                    is_verified=False,
                )

                if reference_already_used:
                    PaymentAnomaly.objects.create(
                        claim=claim,
                        anomaly_type=PaymentAnomaly.Type.REFERENCE_ALREADY_USED,
                        description=(
                            "Cette référence de transaction a déjà été "
                            "déclarée par ailleurs pour cette année "
                            "académique. À vérifier : double déclaration "
                            "légitime (paiement partagé, erreur de "
                            "saisie) ou tentative frauduleuse."
                        ),
                        status=PaymentAnomaly.Status.OPEN,
                    )

                success_message = (
                    "Votre déclaration a été enregistrée avec succès."
                    if not reference_already_used
                    else (
                        "Votre déclaration a été enregistrée, mais cette "
                        "référence a déjà été utilisée par ailleurs. "
                        "Elle sera examinée par le responsable financier."
                    )
                )

                if is_ajax:
                    return JsonResponse({
                        'success': True,
                        'message': success_message,
                        'reference': reference,
                        'claim_id': claim.id,
                    })
                else:
                    messages.success(request, success_message)
                    return redirect('student_payments')
                    
        except Bank.DoesNotExist:
            if is_ajax:
                return JsonResponse({'success': False, 'errors': ['Banque sélectionnée invalide.']}, status=400)
            else:
                messages.error(request, "Banque sélectionnée invalide.")
                return render(request, 'espace_etudiant/declare-payment.html', {
                    'user': user,
                    'banks': banks,
                    'remaining_balance': remaining_balance,
                    'semester1_remaining': semester1_remaining,
                    'semester2_remaining': semester2_remaining,
                    'total_fees': total_fees,
                    'total_paid': total_paid,
                    'current_academic_year': ACADEMIC_YEAR,
                    'form_data': request.POST,
                })
        except Exception as e:
            if is_ajax:
                return JsonResponse({'success': False, 'errors': ['Une erreur est survenue. Veuillez réessayer.']}, status=500)
            else:
                messages.error(request, "Une erreur est survenue. Veuillez réessayer.")
                return render(request, 'espace_etudiant/declare-payment.html', {
                    'user': user,
                    'banks': banks,
                    'remaining_balance': remaining_balance,
                    'semester1_remaining': semester1_remaining,
                    'semester2_remaining': semester2_remaining,
                    'total_fees': total_fees,
                    'total_paid': total_paid,
                    'current_academic_year': ACADEMIC_YEAR,
                    'form_data': request.POST,
                })
    
    # ========================================================
    # GET AVAILABLE ACADEMIC YEARS
    # ========================================================
    
    academic_years = ['2025-2026', '2026-2027']
    
    # ========================================================
    # CONTEXT
    # ========================================================
    
    context = {
        'user': user,
        'banks': banks,
        'academic_years': academic_years,
        'current_academic_year': ACADEMIC_YEAR,
        'remaining_balance': remaining_balance,
        'semester1_remaining': semester1_remaining,
        'semester2_remaining': semester2_remaining,
        'total_fees': total_fees,
        'total_paid': total_paid,
        'semester1_total': semester1_total,
        'semester2_total': semester2_total,
        'semester1_paid': semester1_paid,
        'semester2_paid': semester2_paid,
    }
    
    return render(request, 'espace_etudiant/declare-payment.html', context)





# ============================================================
# STUDENT PAYMENT DETAIL
# ============================================================

@login_required
@etudiant_required
def student_payment_detail(request, payment_id):
    
    user = request.user
    
    # ========================================================
    # GET THE PAYMENT OR CLAIM
    # ========================================================
    
    # Try to find as Payment first
    payment = None
    claim = None
    is_claim = False
    
    try:
        payment = Payment.objects.select_related(
            'student', 'claim', 'claim__bank'
        ).get(
            id=payment_id,
            student=user,
            academic_year=ACADEMIC_YEAR
        )
    except Payment.DoesNotExist:
        # Try to find as PaymentClaim
        try:
            claim = PaymentClaim.objects.select_related(
                'student', 'bank'
            ).prefetch_related(
                'anomalies'
            ).get(
                id=payment_id,
                student=user,
                academic_year=ACADEMIC_YEAR
            )
            is_claim = True
        except PaymentClaim.DoesNotExist:
            # Neither found
            return render(request, 'espace_etudiant/payment-detail.html', {
                'user': user,
                'not_found': True,
            })
    
    # ========================================================
    # BUILD PAYMENT DATA
    # ========================================================
    
    if payment:
        # It's a validated Payment
        payment_data = {
            'id': payment.id,
            'reference': payment.bank_reference,
            'amount': payment.amount,
            'date': payment.created_at,
            'semester': payment.semester,
            'semester_display': payment.get_semester_display(),
            'academic_year': payment.academic_year,
            'status': 'validated',
            'status_label': payment.get_status_display(),
            'validation_date': payment.payment_date,
            'bank_name': payment.claim.bank.name if payment.claim and payment.claim.bank else None,
            'is_validated': True,
            'is_pending': False,
            'is_anomaly': False,
            'has_anomaly': False,
        }
        
        # Get claim reference if available
        if payment.claim:
            payment_data['submitted_reference'] = payment.claim.submitted_reference
        else:
            payment_data['submitted_reference'] = payment.bank_reference
            
    else:
        # It's a PaymentClaim
        # Check for anomalies
        has_anomaly = claim.anomalies.filter(
            status=PaymentAnomaly.Status.OPEN
        ).exists()
        
        if claim.status == PaymentClaim.ClaimStatus.PENDING and not has_anomaly:
            status = 'pending'
            status_label = 'En attente'
        elif claim.status == PaymentClaim.ClaimStatus.APPROVED and claim.is_verified:
            status = 'validated'
            status_label = 'Validé'
        else:
            status = 'anomaly'
            status_label = 'Anomalie'
        
        payment_data = {
            'id': claim.id,
            'reference': claim.submitted_reference,
            'amount': claim.amount,
            'date': claim.created_at,
            'semester': claim.semester,
            'semester_display': claim.get_semester_display(),
            'academic_year': claim.academic_year,
            'status': status,
            'status_label': status_label,
            'validation_date': None,
            'bank_name': claim.bank.name if claim.bank else None,
            'is_validated': status == 'validated',
            'is_pending': status == 'pending',
            'is_anomaly': status == 'anomaly',
            'has_anomaly': has_anomaly,
            'submitted_reference': claim.submitted_reference,
            'claim_id': claim.id,
        }
    
    # ========================================================
    # GET STUDENT INFO
    # ========================================================
    
    student_info = {
        'name': user.full_congolese_name,
        'registration': user.registration_num or 'Sans ID',
        'program': str(user.academic_program) if user.academic_program else 'Non défini',
        'faculty': user.faculty.name if user.faculty else 'Non définie',
        'university': 'Université Catholique de Bukavu',
    }
    
    # ========================================================
    # TIMELINE
    # ========================================================
    
    timeline = [
        {
            'title': 'Paiement déclaré',
            'date': payment_data['date'].strftime('%d %B %Y') if payment_data['date'] else '',
            'completed': True,
        },
        {
            'title': 'Rapprochement effectué',
            'date': '',
            'completed': payment_data['is_validated'],
            'pending': payment_data['is_pending'],
            'error': payment_data['is_anomaly'],
        },
        {
            'title': 'Paiement validé' if payment_data['is_validated'] else 'Validation',
            'date': payment_data['validation_date'].strftime('%d %B %Y') if payment_data['validation_date'] else '',
            'completed': payment_data['is_validated'],
            'pending': payment_data['is_pending'],
            'error': payment_data['is_anomaly'],
        },
    ]
    
    # Update timeline details based on status
    if payment_data['is_pending']:
        timeline[1]['date'] = 'Vérification en cours'
        timeline[2]['date'] = 'En attente'
    elif payment_data['is_anomaly']:
        timeline[1]['date'] = 'Anomalie détectée'
        timeline[2]['date'] = 'Anomalie à résoudre'
    elif payment_data['is_validated']:
        timeline[1]['date'] = 'Référence retrouvée'
    
    # ========================================================
    # GET ANOMALY DETAILS
    # ========================================================
    
    anomaly_details = None
    if claim and has_anomaly:
        anomaly = claim.anomalies.filter(
            status=PaymentAnomaly.Status.OPEN
        ).first()
        if anomaly:
            anomaly_details = {
                'type': anomaly.get_anomaly_type_display(),
                'description': anomaly.description,
                'created_at': anomaly.created_at,
            }
    
    # ========================================================
    # CHECK IF RECEIPT IS AVAILABLE
    # ========================================================
    
    receipt_available = payment_data['is_validated']
    
    # ========================================================
    # CONTEXT
    # ========================================================
    
    context = {
        'user': user,
        'payment': payment_data,
        'student': student_info,
        'timeline': timeline,
        'anomaly': anomaly_details,
        'receipt_available': receipt_available,
        'not_found': False,
        'is_claim': is_claim,
        'current_academic_year': ACADEMIC_YEAR,
    }
    
    return render(request, 'espace_etudiant/payment-detail.html', context)



# ============================================================
# STUDENT PROFILE
# ============================================================

@login_required
@etudiant_required
def student_profile(request):
    """
    Profile page for students.
    Shows user information and allows email/phone update and password change.
    """
    
    user = request.user
    
    # ========================================================
    # HANDLE PROFILE UPDATE (AJAX)
    # ========================================================
    
    if request.method == 'POST' and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        action = request.POST.get('action')
        
        # Update profile (email, phone)
        if action == 'update_profile':
            email = request.POST.get('email', '').strip()
            phone = request.POST.get('phone', '').strip()
            
            errors = []
            
            # Validate email
            if not email:
                errors.append("Veuillez renseigner votre adresse e-mail.")
            else:
                try:
                    validate_email(email)
                except ValidationError:
                    errors.append("Veuillez introduire une adresse e-mail valide.")
                else:
                    # Check if email is already used by another user
                    if User.objects.exclude(id=user.id).filter(email=email).exists():
                        errors.append("Cette adresse e-mail est déjà utilisée.")
            
            # Validate phone (optional)
            if phone:
                # Remove formatting characters to count digits
                digits = ''.join(filter(str.isdigit, phone))
                if len(digits) < 9:
                    errors.append("Le numéro de téléphone semble incomplet.")
                elif len(digits) > 15:
                    errors.append("Le numéro de téléphone est trop long.")
            
            if errors:
                return JsonResponse({
                    'success': False,
                    'errors': errors
                }, status=400)
            
            # Update user
            user.email = email
            
            # If you have a phone field in your User model, add it here
            # user.phone = phone
            
            try:
                user.save()
                return JsonResponse({
                    'success': True,
                    'message': "Vos informations ont été mises à jour."
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'errors': ["Une erreur est survenue lors de la mise à jour."]
                }, status=500)
        
        # Change password
        elif action == 'change_password':
            current_password = request.POST.get('current_password', '')
            new_password = request.POST.get('new_password', '')
            confirm_password = request.POST.get('confirm_password', '')
            
            errors = []
            
            # Validate current password
            if not user.check_password(current_password):
                errors.append("Le mot de passe actuel est incorrect.")
            
            # Validate new password
            if not new_password:
                errors.append("Veuillez renseigner un nouveau mot de passe.")
            elif len(new_password) < 8:
                errors.append("Le nouveau mot de passe doit contenir au moins 8 caractères.")
            elif new_password.isdigit():
                errors.append("Le mot de passe ne peut pas contenir uniquement des chiffres.")
            
            # Validate confirmation
            if new_password != confirm_password:
                errors.append("La confirmation ne correspond pas au nouveau mot de passe.")
            
            # Check if new password is different from current
            if new_password and current_password == new_password:
                errors.append("Le nouveau mot de passe doit être différent du mot de passe actuel.")
            
            if errors:
                return JsonResponse({
                    'success': False,
                    'errors': errors
                }, status=400)
            
            # Change password
            try:
                user.set_password(new_password)
                user.save()
                # Keep the user logged in after password change
                update_session_auth_hash(request, user)
                return JsonResponse({
                    'success': True,
                    'message': "Votre mot de passe a été modifié avec succès."
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'errors': ["Une erreur est survenue lors du changement de mot de passe."]
                }, status=500)
        
        return JsonResponse({
            'success': False,
            'errors': ["Action non reconnue."]
        }, status=400)
    
    # ========================================================
    # GET USER INFORMATION
    # ========================================================
    
    # Get student info
    student_info = {
        'full_name': user.full_congolese_name,
        'registration': user.registration_num or 'Sans ID',
        'email': user.email,
        'program': str(user.academic_program) if user.academic_program else 'Non défini',
        'program_level': user.academic_program.get_level_display() if user.academic_program else None,
        'faculty': user.faculty.name if user.faculty else 'Non définie',
        'university': 'Université Catholique de Bukavu',
        'academic_year': ACADEMIC_YEAR,
        'is_active': user.is_active,
        'last_login': user.last_login,
    }
    
    # Get initials for avatar
    name_parts = user.full_congolese_name.split()
    initials = ''.join([part[0] for part in name_parts[:2]]) if name_parts else '?'
    
    # ========================================================
    # CONTEXT
    # ========================================================
    
    context = {
        'user': user,
        'student': student_info,
        'initials': initials.upper(),
        'current_academic_year': ACADEMIC_YEAR,
        'full_name': user.full_congolese_name,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'post_name': user.post_name or '',
        'registration': user.registration_num or 'Sans ID',
        'email': user.email,
        'avatar_url': user.get_avatar_url,
        'program': str(user.academic_program) if user.academic_program else 'Non défini',
        'faculty': user.faculty.name if user.faculty else 'Non définie',
        'level': user.academic_program.get_level_display() if user.academic_program else None,
        'last_login': user.last_login.strftime("%d %B %Y à %H:%M") if user.last_login else "Première connexion",
        'is_active': user.is_active,
        'university': 'Université Catholique de Bukavu',
    }
    
    return render(request, 'espace_etudiant/profile.html', context)


# ============================================================
# STUDENT HELP
# ============================================================

@login_required
@etudiant_required
def student_help(request):
    """
    Help and support page for students.
    Handles support ticket submission via AJAX.
    """
    
    user = request.user
    
    # ========================================================
    # HANDLE SUPPORT FORM SUBMISSION (AJAX)
    # ========================================================
    
    if request.method == 'POST' and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        issue_type = request.POST.get('issue_type', '').strip()
        reference = request.POST.get('reference', '').strip()
        message = request.POST.get('message', '').strip()
        
        errors = []
        
        # Validate issue type
        if not issue_type:
            errors.append("Veuillez sélectionner le type de problème.")
        
        # Validate message
        if not message:
            errors.append("Veuillez décrire le problème rencontré.")
        elif len(message) < 10:
            errors.append("Veuillez fournir un peu plus de détails.")
        elif len(message) > 500:
            errors.append("Le message ne peut pas dépasser 500 caractères.")
        
        if errors:
            return JsonResponse({
                'success': False,
                'errors': errors
            }, status=400)
        
        # Generate support ticket ID
        import random
        import string
        ticket_id = ''.join(random.choices(string.digits, k=7))
        ticket_ref = f"SUP-{ticket_id}"
        
        # Get issue type display name
        issue_type_map = {
            'pending': 'Paiement toujours en attente',
            'anomaly': 'Paiement en anomalie',
            'incorrect': 'Informations incorrectes',
            'receipt': 'Problème avec le reçu',
            'other': 'Autre problème',
        }
        issue_type_display = issue_type_map.get(issue_type, issue_type)
        
        # TODO: Save support ticket to database
        # TODO: Send email notification (configure email first)
        
        return JsonResponse({
            'success': True,
            'message': 'Votre demande a été envoyée avec succès.',
            'ticket_id': ticket_ref,
        })
    
    # ========================================================
    # CONTEXT
    # ========================================================
    
    context = {
        'user': user,
        'current_academic_year': ACADEMIC_YEAR,
    }
    
    return render(request, 'espace_etudiant/help.html', context)



@login_required
@etudiant_required
def student_payment_receipt(request, payment_id):
   
    user = request.user
    
    # Try to get as Payment first
    try:
        payment = Payment.objects.select_related('student', 'claim').get(
            id=payment_id,
            student=user,
            status=Payment.Status.PAID
        )
        is_validated = True
        reference = payment.bank_reference
        amount = payment.amount
        date = payment.created_at
        semester = payment.get_semester_display()
        academic_year = payment.academic_year
        validation_date = payment.payment_date
        student_name = payment.student.full_congolese_name
        registration = payment.student.registration_num or 'Sans ID'
        program = str(payment.student.academic_program) if payment.student.academic_program else 'Non défini'
        faculty = payment.student.faculty.name if payment.student.faculty else 'Non définie'
        
    except Payment.DoesNotExist:
        # Try as PaymentClaim
        try:
            claim = PaymentClaim.objects.select_related('student').get(
                id=payment_id,
                student=user,
                status=PaymentClaim.ClaimStatus.APPROVED,
                is_verified=True
            )
            is_validated = True
            reference = claim.submitted_reference
            amount = claim.amount
            date = claim.created_at
            semester = claim.get_semester_display()
            academic_year = claim.academic_year
            validation_date = claim.created_at
            student_name = claim.student.full_congolese_name
            registration = claim.student.registration_num or 'Sans ID'
            program = str(claim.student.academic_program) if claim.student.academic_program else 'Non défini'
            faculty = claim.student.faculty.name if claim.student.faculty else 'Non définie'
            
        except PaymentClaim.DoesNotExist:
            return HttpResponse("Paiement non trouvé ou non validé.", status=404)
    
    if not is_validated:
        return HttpResponse("Le reçu n'est disponible que pour les paiements validés.", status=400)
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1b1f1a'),
        spaceAfter=12,
    )
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=14,
        textColor=colors.HexColor('#2d332a'),
        spaceAfter=6,
    )
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#4a5247'),
    )
    label_style = ParagraphStyle(
        'Label',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#6b7569'),
    )
    value_style = ParagraphStyle(
        'Value',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#1b1f1a'),
        fontName='Helvetica-Bold',
    )
    green_style = ParagraphStyle(
        'Green',
        parent=styles['Normal'],
        fontSize=24,
        textColor=colors.HexColor('#a4cf39'),
        fontName='Helvetica-Bold',
        alignment=TA_CENTER,
    )
    center_style = ParagraphStyle(
        'Center',
        parent=styles['Normal'],
        alignment=TA_CENTER,
    )
    
    elements = []
    
    # Header - Green block
    from reportlab.platypus import Table, TableStyle
    header_data = [[
        Paragraph('<font color="#171b15" size=20><b>A</b></font>', styles['Normal']),
        Paragraph('<font color="#171b15" size=18><b>AcademicPay</b></font>', styles['Normal']),
    ]]
    header_table = Table(header_data, colWidths=[15*mm, 80*mm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#a4cf39')),
        ('BACKGROUND', (1, 0), (1, 0), colors.white),
        ('FONTSIZE', (0, 0), (0, 0), 14),
        ('FONTSIZE', (1, 0), (1, 0), 14),
        ('TEXTCOLOR', (0, 0), (0, 0), colors.HexColor('#171b15')),
        ('TEXTCOLOR', (1, 0), (1, 0), colors.HexColor('#171b15')),
        ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, 0), 'Helvetica-Bold'),
        ('BOX', (0, 0), (0, 0), 0, colors.white),
        ('BOX', (1, 0), (1, 0), 0, colors.white),
    ]))
    elements.append(header_table)
    
    elements.append(Spacer(1, 10*mm))
    
    # Title
    elements.append(Paragraph("REÇU DE PAIEMENT", title_style))
    elements.append(Paragraph(f"Référence : #{reference}", normal_style))
    elements.append(Spacer(1, 5*mm))
    
    # Green box with amount
    amount_text = f'<font color="#171b15" size=8>MONTANT VALIDE</font><br/><font color="#171b15" size=24><b>{amount:,.2f} $</b></font>'
    amount_data = [[Paragraph(amount_text, center_style)]]
    amount_table = Table(amount_data, colWidths=[160*mm])
    amount_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#a4cf39')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6*mm),
        ('ROUNDEDCORNERS', (0, 0), (-1, -1), 4),
    ]))
    elements.append(amount_table)
    elements.append(Spacer(1, 10*mm))
    
    # Student information
    elements.append(Paragraph("INFORMATIONS DE L'ÉTUDIANT", subtitle_style))
    elements.append(Spacer(1, 3*mm))
    
    student_data = [
        ['Étudiant', student_name],
        ['Matricule', registration],
        ['Programme', program],
        ['Faculté', faculty],
    ]
    student_table = Table(student_data, colWidths=[40*mm, 80*mm])
    student_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (0, -1), 8),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#6b7569')),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (1, 0), (1, -1), 10),
        ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#1b1f1a')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5*mm),
        ('LINEABOVE', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e8e2')),
    ]))
    elements.append(student_table)
    elements.append(Spacer(1, 10*mm))
    
    # Payment details
    elements.append(Paragraph("DÉTAIL DU PAIEMENT", subtitle_style))
    elements.append(Spacer(1, 3*mm))
    
    payment_data = [
        ['Référence', f'#{reference}'],
        ['Date du paiement', date.strftime('%d %B %Y')],
        ['Semestre', semester],
        ['Année académique', academic_year],
        ['Date de validation', validation_date.strftime('%d %B %Y') if validation_date else '—'],
    ]
    payment_table = Table(payment_data, colWidths=[40*mm, 80*mm])
    payment_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (0, -1), 8),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#6b7569')),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (1, 0), (1, -1), 10),
        ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#1b1f1a')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5*mm),
        ('LINEABOVE', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e8e2')),
    ]))
    elements.append(payment_table)
    elements.append(Spacer(1, 10*mm))
    
    # Confirmation box
    confirm_text = '<font color="#6f9120" size=10><b>PAIEMENT VALIDÉ</b></font><br/><font color="#697668" size=9>Cette transaction a été rapprochée et validée dans AcademicPay.</font>'
    confirm_data = [[Paragraph(confirm_text, center_style)]]
    confirm_table = Table(confirm_data, colWidths=[160*mm])
    confirm_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f6f8f3')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 5*mm),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#dce1d8')),
        ('ROUNDEDCORNERS', (0, 0), (-1, -1), 4),
    ]))
    elements.append(confirm_table)
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    
    response = HttpResponse(buffer, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="recu-{reference}.pdf"'
    return response