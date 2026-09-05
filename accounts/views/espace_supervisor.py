# views/espace_supervisor.py

from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Count, Sum
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.utils import timezone
from datetime import datetime, timedelta
from django.http import HttpResponseForbidden,JsonResponse
from django.contrib import messages
from django.contrib.auth import update_session_auth_hash
from ..models import (
    User, PaymentClaim, Payment, VerificationLog, 
    PaymentAnomaly, FeeSchedule
)


ACADEMIC_YEAR = "2026-2027"

# ============================================================
# AUTHORIZATION DECORATOR
# ============================================================

def surveillant_required(view_func):
    """
    Decorator to check if user is a Surveillant.
    """
    def wrapper(request, *args, **kwargs):
        if not (
            request.user.is_authenticated and
            request.user.role == User.Role.STAFF and
            request.user.staff_role == User.StaffRole.SURVEILLANT
        ):
            return HttpResponseForbidden("Accès réservé aux Surveillants.")
        return view_func(request, *args, **kwargs)
    return wrapper


# ============================================================
# DASHBOARD
# ============================================================

@login_required
@surveillant_required
def supervisor_dashboard(request):
    
    user = request.user
    
    # Get all verifications by this staff member
    verifications = VerificationLog.objects.select_related(
        'student',
        'student__academic_program',
        'student__academic_program__program'
    ).filter(
        staff=request.user  # Only current supervisor's verifications
    ).order_by('-verified_at')
    
    # --- STATS (for current supervisor) ---
    
    # Get today's date range
    today = timezone.now().date()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())
    
    # Verifications today
    verified_today = verifications.filter(
        verified_at__range=[today_start, today_end]
    ).count()
    
    # Authorized today
    authorized_today = verifications.filter(
        verified_at__range=[today_start, today_end],
        is_financially_clear=True
    ).count()
    
    # Not authorized today
    not_authorized_today = verifications.filter(
        verified_at__range=[today_start, today_end],
        is_financially_clear=False
    ).count()
    
    # Authorization rate
    if verified_today > 0:
        auth_rate = round((authorized_today / verified_today) * 100, 1)
    else:
        auth_rate = 0
    
    # --- RECENT VERIFICATIONS (last 5 for this supervisor) ---
    
    recent_verifications = VerificationLog.objects.filter(
        staff=user  
    ).select_related(
        'staff', 'student',
        'student__academic_program',
        'student__academic_program__program'
    ).order_by('-verified_at')[:5]
    
    # --- CONTEXT ---
    
    context = {
        'user': user,
        'verified_today': verified_today,
        'authorized_today': authorized_today,
        'not_authorized_today': not_authorized_today,
        'auth_rate': auth_rate,
        'recent_verifications': recent_verifications,
        'current_academic_year': ACADEMIC_YEAR,
        'today': today.strftime('%d %B %Y'),
    }
    
    return render(request, 'espace_supervisor/supervisor-dashboard.html', context)






# ============================================================
# STUDENT VERIFICATION
# ============================================================

@login_required
@surveillant_required
def supervisor_verification(request):
    
    student = None
    verification_result = None
    payment_status = None
    status_message = None
    has_anomaly = False
    total_fees = None
    total_paid = None
    remaining_balance = None
    paid_percentage = 0
    recent_payments = []
    installments = []
    
    search_query = request.GET.get('search', '').strip()
    
    if search_query:
        # Search for student by registration number or name
        student = User.objects.select_related(
            'academic_program',
            'academic_program__program',
            'academic_program__program__department',
            'academic_program__program__department__faculty'
        ).filter(
            Q(registration_num__iexact=search_query) |
            Q(registration_num__icontains=search_query) |
            Q(first_name__icontains=search_query) |
            Q(last_name__icontains=search_query) |
            Q(post_name__icontains=search_query)
        ).first()
        
        if student:
            # --- Get Fee Schedule ---
            if student.academic_program:
                try:
                    fee_schedule = FeeSchedule.objects.get(
                        academic_program=student.academic_program,
                        academic_year=ACADEMIC_YEAR,
                        status=FeeSchedule.Status.ACTIF
                    )
                    total_fees = fee_schedule.total_amount
                    installments = fee_schedule.installments.all().order_by('installment_number')
                except FeeSchedule.DoesNotExist:
                    total_fees = None
                    installments = []
            else:
                total_fees = None
                installments = []
            
            # --- Get Total Paid ---
            total_paid = Payment.objects.filter(
                student=student,
                academic_year=ACADEMIC_YEAR,
                status=Payment.Status.PAID
            ).aggregate(total=Sum('amount'))['total'] or 0
            
            # --- Calculate Remaining Balance ---
            if total_fees:
                remaining_balance = total_fees - total_paid
                if total_fees > 0:
                    paid_percentage = round((total_paid / total_fees) * 100, 1)
                else:
                    paid_percentage = 0
            else:
                remaining_balance = None
                paid_percentage = 0
            
            # --- Determine Payment Status ---
            if total_fees and total_paid >= total_fees:
                payment_status = 'clear'
                status_message = 'Autorisé à passer l\'évaluation'
                status_icon = 'bi-check-lg'
                status_color = 'authorized'
            elif total_fees and total_paid > 0:
                payment_status = 'partial'
                status_message = f'Partiellement payé (Reste: {remaining_balance:.2f} $)'
                status_icon = 'bi-hourglass-split'
                status_color = 'partial'
            elif total_fees and total_paid == 0:
                payment_status = 'unpaid'
                status_message = 'Aucun paiement enregistré'
                status_icon = 'bi-x-lg'
                status_color = 'unauthorized'
            else:
                payment_status = 'unknown'
                status_message = 'Aucun échéancier trouvé pour ce programme'
                status_icon = 'bi-question-circle'
                status_color = 'unknown'
            
            # --- Check for Anomalies ---
            has_anomaly = PaymentAnomaly.objects.filter(
                claim__student=student,
                claim__academic_year=ACADEMIC_YEAR,
                status=PaymentAnomaly.Status.OPEN
            ).exists()
            
            # --- Get Recent Payments ---
            recent_payments = Payment.objects.filter(
                student=student,
                academic_year=ACADEMIC_YEAR,
                status=Payment.Status.PAID
            ).select_related('claim').order_by('-created_at')[:5]
            
            # --- Create Verification Log ---
            is_clear = payment_status == 'clear'
            verification_result = VerificationLog.objects.create(
                staff=request.user,
                student=student,
                method=VerificationLog.Method.MANUAL_SEARCH,
                is_financially_clear=is_clear
            )
            
            # --- For AJAX Response ---
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({
                    'found': True,
                    'student': {
                        'id': student.id,
                        'name': student.full_congolese_name,
                        'registration': student.registration_num or 'Sans ID',
                        'program': str(student.academic_program) if student.academic_program else 'Non défini',
                        'faculty': student.faculty.name if student.faculty else 'Non définie',
                        'program_level': student.academic_program.get_level_display() if student.academic_program else None,
                        'total_fees': str(total_fees) if total_fees else None,
                        'total_paid': str(total_paid) if total_paid else '0.00',
                        'remaining_balance': str(remaining_balance) if remaining_balance is not None else None,
                        'paid_percentage': paid_percentage,
                        'payment_status': payment_status,
                        'status_message': status_message,
                        'status_icon': status_icon,
                        'status_color': status_color,
                        'has_anomaly': has_anomaly,
                        'is_active': student.is_active,
                        'verification_id': verification_result.id,
                    }
                })
        
        else:
            # No student found
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({'found': False})
            else:
                messages.warning(request, "Aucun étudiant trouvé avec ces critères.")
    
    # --- CONTEXT ---
    context = {
        'user': request.user,
        'student': student,
        'verification_result': verification_result,
        'payment_status': payment_status,
        'status_message': status_message,
        'has_anomaly': has_anomaly,
        'total_fees': total_fees,
        'total_paid': total_paid,
        'remaining_balance': remaining_balance,
        'paid_percentage': paid_percentage,
        'recent_payments': recent_payments,
        'installments': installments,
        'search_query': search_query,
        'current_academic_year': ACADEMIC_YEAR,
    }
    
    return render(request, 'espace_supervisor/student-verification.html', context)



# ============================================================
# VERIFICATION HISTORY
# ============================================================

@login_required
@surveillant_required
def supervisor_history(request):

    # Get all verifications by this staff member
    verifications = VerificationLog.objects.select_related(
        'student',
        'student__academic_program',
        'student__academic_program__program'
    ).filter(
        staff=request.user  # Only current supervisor's verifications
    ).order_by('-verified_at')
    
    # --- STATS (for current supervisor) ---
    
    # Get today's date range
    today = timezone.now().date()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())
    
    # Verifications today
    verified_today = verifications.filter(
        verified_at__range=[today_start, today_end]
    ).count()
    
    # Authorized today
    authorized_today = verifications.filter(
        verified_at__range=[today_start, today_end],
        is_financially_clear=True
    ).count()
    
    # Not authorized today
    not_authorized_today = verifications.filter(
        verified_at__range=[today_start, today_end],
        is_financially_clear=False
    ).count()
    
    # --- APPLY FILTERS ---
    
    # Search filter
    search_query = request.GET.get('search', '').strip()
    if search_query:
        verifications = verifications.filter(
            Q(student__first_name__icontains=search_query) |
            Q(student__last_name__icontains=search_query) |
            Q(student__post_name__icontains=search_query) |
            Q(student__registration_num__icontains=search_query)
        )
    
    # Status filter
    status_filter = request.GET.get('status', 'all')
    if status_filter == 'authorized':
        verifications = verifications.filter(is_financially_clear=True)
    elif status_filter == 'unauthorized':
        verifications = verifications.filter(is_financially_clear=False)
    
    # Period filter (optional)
    period_filter = request.GET.get('period', 'all')
    if period_filter == 'today':
        verifications = verifications.filter(
            verified_at__range=[today_start, today_end]
        )
    elif period_filter == 'week':
        week_start = today - timedelta(days=today.weekday())
        week_start = datetime.combine(week_start, datetime.min.time())
        verifications = verifications.filter(verified_at__gte=week_start)
    elif period_filter == 'month':
        month_start = today.replace(day=1)
        month_start = datetime.combine(month_start, datetime.min.time())
        verifications = verifications.filter(verified_at__gte=month_start)
    
    # --- PAGINATION ---
    
    paginator = Paginator(verifications, 20)
    page = request.GET.get('page', 1)
    
    try:
        verifications_page = paginator.page(page)
    except PageNotAnInteger:
        verifications_page = paginator.page(1)
    except EmptyPage:
        verifications_page = paginator.page(paginator.num_pages)
    
    # --- AJAX RESPONSE ---
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        verifications_data = []
        for verification in verifications_page:
            # Get status
            is_authorized = verification.is_financially_clear
            status_display = 'authorized' if is_authorized else 'unauthorized'
            status_label = 'Autorisé' if is_authorized else 'Non autorisé'
            status_icon = 'bi-check-circle-fill' if is_authorized else 'bi-x-circle-fill'
            
            # Get program info
            program_name = ''
            program_level = ''
            if verification.student.academic_program:
                program_level = verification.student.academic_program.get_level_display() or ''
                program_name = verification.student.academic_program.program.name if verification.student.academic_program.program else ''
            
            verifications_data.append({
                'id': verification.id,
                'student_name': verification.student.full_congolese_name,
                'registration': verification.student.registration_num or 'Sans ID',
                'program_level': program_level,
                'program_name': program_name,
                'date': verification.verified_at.strftime('%d/%m/%Y'),
                'time': verification.verified_at.strftime('%H:%M'),
                'is_authorized': is_authorized,
                'status': status_display,
                'status_label': status_label,
                'status_icon': status_icon,
                'student_id': verification.student.id,
            })
        
        return JsonResponse({
            'verifications': verifications_data,
            'total': paginator.count,
            'page': verifications_page.number,
            'num_pages': paginator.num_pages,
            'has_next': verifications_page.has_next(),
            'has_previous': verifications_page.has_previous(),
            'verified_today': verified_today,
            'authorized_today': authorized_today,
            'not_authorized_today': not_authorized_today,
            'result_count': paginator.count,
        })
    
    # --- CONTEXT ---
    
    context = {
        'user': request.user,
        'verifications': verifications_page,
        'paginator': paginator,
        'verified_today': verified_today,
        'authorized_today': authorized_today,
        'not_authorized_today': not_authorized_today,
        'search_query': search_query,
        'status_filter': status_filter,
        'period_filter': period_filter,
        'result_count': paginator.count,
        'current_academic_year': ACADEMIC_YEAR,
    }
    
    return render(request, 'espace_supervisor/verification-history.html', context)






# ============================================================
# SUPERVISOR PROFILE
# ============================================================

@login_required
@surveillant_required
def supervisor_profile(request):

    
    user = request.user
    
    # ========================================================
    # HANDLE PASSWORD CHANGE (AJAX)
    # ========================================================
    
    if request.method == 'POST' and request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        action = request.POST.get('action')
        
        if action == 'change_password':
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
    
    # Get supervisor ID
    supervisor_id = f"SURV-{user.id:04d}"
    
    # Get role display
    role_display = user.get_staff_role_display() or "Surveillant d'examen"
    
    # Get last login
    last_login = user.last_login
    last_login_display = "Première connexion" if not last_login else last_login.strftime("%d %B %Y à %H:%M")
    
    # Get initials for avatar
    name_parts = user.full_congolese_name.split()
    initials = ''.join([part[0] for part in name_parts[:2]]) if name_parts else '?'
    
    # ========================================================
    # CONTEXT
    # ========================================================
    
    context = {
        'user': user,
        'supervisor_id': supervisor_id,
        'role_display': role_display,
        'initials': initials.upper(),
        'last_login': last_login_display,
        'current_academic_year': ACADEMIC_YEAR,
        'email': user.email,
        'full_name': user.full_congolese_name,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'post_name': user.post_name or '',
        'avatar_url': user.get_avatar_url,
        'is_active': user.is_active,
    }
    
    return render(request, 'espace_supervisor/supervisor-profile.html', context)