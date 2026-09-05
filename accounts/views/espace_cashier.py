from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth import update_session_auth_hash
from django.db.models import Count, Q, Sum,  Case, When, Value, IntegerField, CharField
from django.utils import timezone
from datetime import datetime, timedelta
from django.views.decorators.cache import never_cache
from django.http import HttpResponseForbidden, JsonResponse
from django.contrib import messages
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.db import transaction
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from ..models import (
    PaymentClaim, Payment, PaymentAnomaly, 
    BankTransaction, User, FeeSchedule, FeeInstallment,
    VerificationLog
)


ACADEMIC_YEAR = "2026-2027"


@login_required
@never_cache
def cashier_dashboard(request):


    # ========================================================
    # AUTORISATION
    # ========================================================

    if not (
        request.user.role == User.Role.STAFF
        and request.user.staff_role == User.StaffRole.CAISSIER
    ):
        return HttpResponseForbidden(
            "Accès réservé au Caissier."
        )
    # Get the current user
    user = request.user
    
    # Get today's date range
    today = timezone.now().date()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())
    
    # --- STATS ---
    # Total claims submitted today
    today_claims = PaymentClaim.objects.filter(
        created_at__range=[today_start, today_end]
    ).count()
    
    # Auto-reconciled payments today (approved claims)
    today_approved = PaymentClaim.objects.filter(
        status=PaymentClaim.ClaimStatus.APPROVED,
        is_verified=True,
        created_at__range=[today_start, today_end]
    ).count()
    
    # Pending verification claims
    pending_claims = PaymentClaim.objects.filter(
        status=PaymentClaim.ClaimStatus.PENDING,
        created_at__range=[today_start, today_end]
    ).count()
    
    # Open anomalies
    open_anomalies = PaymentAnomaly.objects.filter(
        status=PaymentAnomaly.Status.OPEN,
        created_at__range=[today_start, today_end]
    ).count()
    
    # --- RECENT ANOMALIES (last 5) ---
    recent_anomalies = PaymentAnomaly.objects.select_related(
        'claim', 'claim__student'
    ).filter(
        status=PaymentAnomaly.Status.OPEN,
    ).order_by('-created_at')[:5]
    
    # --- RECENT PAYMENTS (last 5) ---
    recent_payments = PaymentClaim.objects.select_related(
        'student', 'bank'
    ).order_by('-created_at')[:5]
    
    # --- CONTEXT ---
    context = {
        'user': user,
        'today_claims': today_claims,
        'today_approved': today_approved,
        'pending_claims': pending_claims,
        'open_anomalies': open_anomalies,
        'recent_anomalies': recent_anomalies,
        'recent_payments': recent_payments,
        'current_academic_year': ACADEMIC_YEAR,
    }
    
    return render(request, 'espace_cashier/cashier-dashboard.html', context)




@login_required
def cashier_payments(request):
    
    
    # ========================================================
    # AUTHORIZATION
    # ========================================================
    
    if not (
        request.user.role == User.Role.STAFF
        and request.user.staff_role == User.StaffRole.CAISSIER
    ):
        return HttpResponseForbidden("Accès réservé au Caissier.")
    
    # ========================================================
    # GET FILTERS FROM REQUEST
    # ========================================================
    
    search_query = request.GET.get('search', '').strip()
    status_filter = request.GET.get('status', 'all')
    period_filter = request.GET.get('period', 'all')
    page = request.GET.get('page', 1)
    
    # ========================================================
    # BASE QUERY - FILTER BY ACADEMIC YEAR
    # ========================================================
    
    claims = PaymentClaim.objects.select_related(
        'student', 
        'bank',
        'bank_transaction'
    ).prefetch_related(
        'anomalies'
    ).filter(
        academic_year=ACADEMIC_YEAR
    )
    
    # ========================================================
    # APPLY SEARCH FILTER
    # ========================================================
    
    if search_query:
        claims = claims.filter(
            Q(student__first_name__icontains=search_query) |
            Q(student__last_name__icontains=search_query) |
            Q(student__post_name__icontains=search_query) |
            Q(student__registration_num__icontains=search_query) |
            Q(submitted_reference__icontains=search_query)
        )
    
    # ========================================================
    # APPLY STATUS FILTER
    # ========================================================
    
    if status_filter == 'validated':
        claims = claims.filter(
            status=PaymentClaim.ClaimStatus.APPROVED,
            is_verified=True
        )
    elif status_filter == 'pending':
        claims = claims.filter(
            status=PaymentClaim.ClaimStatus.PENDING
        )
    elif status_filter == 'anomaly':
        claims = claims.filter(
            anomalies__status=PaymentAnomaly.Status.OPEN
        ).distinct()
    
    # ========================================================
    # APPLY PERIOD FILTER
    # ========================================================
    
    today = timezone.now().date()
    
    if period_filter == 'today':
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        claims = claims.filter(
            created_at__range=[today_start, today_end]
        )
    elif period_filter == 'week':
        week_start = today - timedelta(days=today.weekday())
        week_start = datetime.combine(week_start, datetime.min.time())
        claims = claims.filter(created_at__gte=week_start)
    elif period_filter == 'month':
        month_start = today.replace(day=1)
        month_start = datetime.combine(month_start, datetime.min.time())
        claims = claims.filter(created_at__gte=month_start)
    
    # ========================================================
    # ORDERING
    # ========================================================
    
    claims = claims.order_by('-created_at')
    
    # ========================================================
    # GET TOTAL COUNT BEFORE PAGINATION
    # ========================================================
    
    total_count = claims.count()
    
    # ========================================================
    # PAGINATION
    # ========================================================
    
    paginator = Paginator(claims, 20)
    
    try:
        claims_page = paginator.page(page)
    except PageNotAnInteger:
        claims_page = paginator.page(1)
    except EmptyPage:
        claims_page = paginator.page(paginator.num_pages)
    
    # ========================================================
    # STATS (ALWAYS FOR CURRENT ACADEMIC YEAR)
    # ========================================================
    
    total_claims = PaymentClaim.objects.filter(
        academic_year=ACADEMIC_YEAR
    ).count()
    
    validated_claims = PaymentClaim.objects.filter(
        academic_year=ACADEMIC_YEAR,
        status=PaymentClaim.ClaimStatus.APPROVED,
        is_verified=True
    ).count()
    
    pending_claims = PaymentClaim.objects.filter(
        academic_year=ACADEMIC_YEAR,
        status=PaymentClaim.ClaimStatus.PENDING
    ).count()
    
    anomaly_claims = PaymentAnomaly.objects.filter(
        status=PaymentAnomaly.Status.OPEN,
        claim__academic_year=ACADEMIC_YEAR
    ).count()
    
    # ========================================================
    # AJAX RESPONSE FOR FILTERING
    # ========================================================
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        claims_data = []
        for claim in claims_page:
            # Get status for display
            if claim.status == PaymentClaim.ClaimStatus.APPROVED and claim.is_verified:
                status_display = 'validated'
                status_label = 'Rapproché'
                status_icon = 'bi-check-circle-fill'
            elif claim.status == PaymentClaim.ClaimStatus.PENDING:
                status_display = 'pending'
                status_label = 'Vérification'
                status_icon = 'bi-clock-fill'
            else:
                status_display = 'anomaly'
                status_label = 'Anomalie'
                status_icon = 'bi-exclamation-circle-fill'
            
            # Get initials for avatar
            name_parts = claim.student.full_congolese_name.split()
            initials = ''.join([part[0] for part in name_parts[:2]]) if name_parts else '?'
            
            claims_data.append({
                'id': claim.id,
                'student_name': claim.student.full_congolese_name,
                'student_registration': claim.student.registration_num or 'Sans ID',
                'student_initials': initials.upper(),
                'reference': claim.submitted_reference,
                'amount': f"{claim.amount:,.2f} $",
                'date': claim.created_at.strftime('%d/%m/%Y'),
                'time': claim.created_at.strftime('%H:%M'),
                'status': status_display,
                'status_label': status_label,
                'status_icon': status_icon,
                'has_anomaly': claim.anomalies.filter(status=PaymentAnomaly.Status.OPEN).exists(),
                'anomaly_count': claim.anomalies.filter(status=PaymentAnomaly.Status.OPEN).count(),
                'url': f"/cashier/payment/{claim.id}/",
            })
        
        return JsonResponse({
            'claims': claims_data,
            'total': total_count,
            'page': claims_page.number,
            'num_pages': paginator.num_pages,
            'has_next': claims_page.has_next(),
            'has_previous': claims_page.has_previous(),
            'total_claims': total_claims,
            'validated_claims': validated_claims,
            'pending_claims': pending_claims,
            'anomaly_claims': anomaly_claims,
            'result_count': total_count,
        })
    
    # ========================================================
    # CONTEXT FOR HTML RENDER
    # ========================================================
    
    context = {
        'user': request.user,
        'claims': claims_page,
        'paginator': paginator,
        'total_claims': total_claims,
        'validated_claims': validated_claims,
        'pending_claims': pending_claims,
        'anomaly_claims': anomaly_claims,
        'current_academic_year': ACADEMIC_YEAR,
        'search_query': search_query,
        'status_filter': status_filter,
        'period_filter': period_filter,
        'result_count': total_count,
    }
    
    return render(request, 'espace_cashier/cashier-payments.html', context)  







@login_required
def cashier_payment_detail(request, claim_id):
    
    # ========================================================
    # AUTHORIZATION
    # ========================================================
    
    if not (
        request.user.role == User.Role.STAFF
        and request.user.staff_role == User.StaffRole.CAISSIER
    ):
        return HttpResponseForbidden("Accès réservé au Caissier.")
    
    # ========================================================
    # GET THE CLAIM
    # ========================================================
    
    claim = get_object_or_404(
        PaymentClaim.objects.select_related(
            'student',
            'student__academic_program',
            'student__academic_program__program',
            'student__academic_program__program__department',
            'student__academic_program__program__department__faculty',
            'bank',
            'bank_transaction'
        ).prefetch_related(
            'anomalies'
        ),
        id=claim_id,
        academic_year=ACADEMIC_YEAR  
    )
    
    
    # ========================================================
    # GET ANOMALIES
    # ========================================================
    
    anomalies = claim.anomalies.filter(
        status=PaymentAnomaly.Status.OPEN
    )
    
    # Get the primary anomaly (first one)
    primary_anomaly = anomalies.first()
    
    # ========================================================
    # GET BANK TRANSACTION (if exists)
    # ========================================================
    
    bank_transaction = claim.bank_transaction
    
    # ========================================================
    # DETERMINE CLAIM STATUS FOR DISPLAY
    # ========================================================
    
    if claim.status == PaymentClaim.ClaimStatus.APPROVED and claim.is_verified:
        status_display = 'validated'
        status_label = 'Rapproché'
        status_icon = 'bi-check-circle-fill'
        status_class = 'validated'
    elif claim.status == PaymentClaim.ClaimStatus.PENDING:
        status_display = 'pending'
        status_label = 'Vérification'
        status_icon = 'bi-clock-fill'
        status_class = 'pending'
    else:
        status_display = 'anomaly'
        status_label = 'Anomalie'
        status_icon = 'bi-exclamation-circle-fill'
        status_class = 'anomaly'
    
    # ========================================================
    # GET FEE SCHEDULE INFO (if available)
    # ========================================================
    
    fee_schedule = None
    total_fees = None
    paid_amount = None
    remaining_balance = None
    
    if claim.student.academic_program:
        try:
            fee_schedule = FeeSchedule.objects.get(
                academic_program=claim.student.academic_program,
                academic_year=claim.academic_year,
                status=FeeSchedule.Status.ACTIF
            )
            total_fees = fee_schedule.total_amount
            
            # Calculate total paid by this student for this year
            paid_amount = Payment.objects.filter(
                student=claim.student,
                academic_year=claim.academic_year,
                status=Payment.Status.PAID
            ).aggregate(total=Sum('amount'))['total'] or 0
            
            remaining_balance = total_fees - paid_amount
            
        except FeeSchedule.DoesNotExist:
            pass
    
    # ========================================================
    # HANDLE POST ACTIONS
    # ========================================================
    
    if request.method == 'POST':
        action = request.POST.get('action')
        
        # ====================================================
        # RETRY VERIFICATION
        # ====================================================
        
        if action == 'retry':
            try:
                with transaction.atomic():
                    # Check if there's a bank transaction with this reference
                    bank_txn = BankTransaction.objects.filter(
                        transaction_reference=claim.submitted_reference,
                        is_verified=False
                    ).first()
                    
                    if bank_txn:
                        # Link the claim to the bank transaction
                        claim.bank_transaction = bank_txn
                        claim.is_verified = True
                        claim.status = PaymentClaim.ClaimStatus.APPROVED
                        claim.save()
                        
                        # Create a Payment record
                        payment = Payment.objects.create(
                            student=claim.student,
                            claim=claim,
                            bank_reference=bank_txn.transaction_reference,
                            amount=claim.amount,
                            academic_year=claim.academic_year,
                            semester=claim.semester,
                            status=Payment.Status.PAID,
                            payment_date=bank_txn.payment_date
                        )
                        
                        # Close any open anomalies
                        claim.anomalies.filter(
                            status=PaymentAnomaly.Status.OPEN
                        ).update(
                            status=PaymentAnomaly.Status.RESOLVED,
                            resolved_at=timezone.now()
                        )
                        
                        messages.success(
                            request,
                            f"La déclaration a été rapprochée avec succès. "
                            f"Transaction: {bank_txn.transaction_reference}"
                        )
                    else:
                        # No matching transaction found
                        messages.warning(
                            request,
                            "Aucune transaction bancaire trouvée pour cette référence. "
                            "Veuillez vérifier la référence ou corriger si nécessaire."
                        )
                
                return redirect('cashier_payment_detail', claim_id=claim.id)
                
            except Exception as e:
                messages.error(request, f"Erreur lors du rapprochement: {str(e)}")
                return redirect('cashier_payment_detail', claim_id=claim.id)
        
        # ====================================================
        # CORRECT REFERENCE
        # ====================================================
        
        elif action == 'correct_reference':
            new_reference = request.POST.get('reference', '').strip()
            reason = request.POST.get('reason', '').strip()
            
            if not new_reference:
                messages.error(request, "Veuillez introduire une référence valide.")
                return redirect('cashier_payment_detail', claim_id=claim.id)
            
            if not reason:
                messages.error(request, "Veuillez indiquer le motif de la correction.")
                return redirect('cashier_payment_detail', claim_id=claim.id)
            
            try:
                with transaction.atomic():
                    # Update the claim with new reference
                    old_reference = claim.submitted_reference
                    claim.submitted_reference = new_reference
                    claim.save()
                    
                    # Add a note to the anomaly
                    if primary_anomaly:
                        primary_anomaly.description = (
                            f"{primary_anomaly.description or ''}\n\n"
                            f"[{timezone.now().strftime('%d/%m/%Y %H:%M')}] "
                            f"Référence corrigée par {request.user.full_congolese_name}: "
                            f"'{old_reference}' → '{new_reference}'. "
                            f"Motif: {reason}"
                        )
                        primary_anomaly.save()
                    
                    messages.success(
                        request,
                        f"Référence corrigée: '{old_reference}' → '{new_reference}'"
                    )
                
                return redirect('cashier_payment_detail', claim_id=claim.id)
                
            except Exception as e:
                messages.error(request, f"Erreur lors de la correction: {str(e)}")
                return redirect('cashier_payment_detail', claim_id=claim.id)
        
        # ====================================================
        # ESCALATE ANOMALY
        # ====================================================
        
        elif action == 'escalate':
            reason = request.POST.get('reason', '').strip()
            
            if not reason:
                messages.error(request, "Veuillez ajouter un commentaire.")
                return redirect('cashier_payment_detail', claim_id=claim.id)
            
            try:
                with transaction.atomic():
                    # Update anomaly status
                    if primary_anomaly:
                        primary_anomaly.status = PaymentAnomaly.Status.REJECTED
                        primary_anomaly.description = (
                            f"{primary_anomaly.description or ''}\n\n"
                            f"[{timezone.now().strftime('%d/%m/%Y %H:%M')}] "
                            f"Transmise au responsable financier par "
                            f"{request.user.full_congolese_name}. "
                            f"Motif: {reason}"
                        )
                        primary_anomaly.resolved_at = timezone.now()
                        primary_anomaly.save()
                    
                    # Update claim status
                    claim.status = PaymentClaim.ClaimStatus.REJECTED
                    claim.save()
                    
                    messages.success(
                        request,
                        "L'anomalie a été transmise au responsable financier."
                    )
                
                return redirect('cashier_payments')
                
            except Exception as e:
                messages.error(request, f"Erreur lors de la transmission: {str(e)}")
                return redirect('cashier_payment_detail', claim_id=claim.id)
    
    # ========================================================
    # CONTEXT FOR HTML RENDER
    # ========================================================
    
    context = {
        'user': request.user,
        'claim': claim,
        'claim_id': claim.id,
        'student': claim.student,
        'anomalies': anomalies,
        'primary_anomaly': primary_anomaly,
        'bank_transaction': bank_transaction,
        'status_display': status_display,
        'status_label': status_label,
        'status_icon': status_icon,
        'status_class': status_class,
        'current_academic_year': ACADEMIC_YEAR,
        'fee_schedule': fee_schedule,
        'total_fees': total_fees,
        'paid_amount': paid_amount,
        'remaining_balance': remaining_balance,
        'has_anomalies': anomalies.exists(),
        'is_anomaly': status_display == 'anomaly',
        'is_pending': status_display == 'pending',
        'is_validated': status_display == 'validated',
    }
    
    return render(request, 'espace_cashier/cashier-payment-detail.html', context)





# High priority anomaly types
HIGH_PRIORITY_TYPES = [
    PaymentAnomaly.Type.REFERENCE_NOT_FOUND,
    PaymentAnomaly.Type.REFERENCE_ALREADY_USED,
    PaymentAnomaly.Type.DUPLICATE_CLAIM,
]

@login_required
def cashier_anomalies(request):
  
    # ========================================================
    # AUTHORIZATION
    # ========================================================
    
    if not (
        request.user.role == User.Role.STAFF
        and request.user.staff_role == User.StaffRole.CAISSIER
    ):
        return HttpResponseForbidden("Accès réservé au Caissier.")
    
    # ========================================================
    # GET FILTERS FROM REQUEST
    # ========================================================
    
    search_query = request.GET.get('search', '').strip()
    type_filter = request.GET.get('type', 'all')
    priority_filter = request.GET.get('priority', 'all')
    page = request.GET.get('page', 1)
    
    # ========================================================
    # BASE QUERY - FILTER BY ACADEMIC YEAR
    # ========================================================
    
    anomalies = PaymentAnomaly.objects.select_related(
        'claim',
        'claim__student',
        'claim__bank'
    ).prefetch_related(
        'claim__student__academic_program',
        'claim__student__academic_program__program',
        'claim__student__academic_program__program__department',
        'claim__student__academic_program__program__department__faculty'
    ).filter(
        claim__academic_year=ACADEMIC_YEAR
    )
    
    # ========================================================
    # APPLY SEARCH FILTER
    # ========================================================
    
    if search_query:
        anomalies = anomalies.filter(
            Q(claim__student__first_name__icontains=search_query) |
            Q(claim__student__last_name__icontains=search_query) |
            Q(claim__student__post_name__icontains=search_query) |
            Q(claim__student__registration_num__icontains=search_query) |
            Q(claim__submitted_reference__icontains=search_query)
        )
    
    # ========================================================
    # APPLY ANOMALY TYPE FILTER
    # ========================================================
    
    if type_filter != 'all':
        # Map HTML filter values to model choices
        type_mapping = {
            'reference': PaymentAnomaly.Type.REFERENCE_NOT_FOUND,
            'amount': PaymentAnomaly.Type.AMOUNT_MISMATCH,
            'duplicate': PaymentAnomaly.Type.REFERENCE_ALREADY_USED,
        }
        if type_filter in type_mapping:
            anomalies = anomalies.filter(anomaly_type=type_mapping[type_filter])
    
    # ========================================================
    # APPLY PRIORITY FILTER
    # ========================================================
    
    if priority_filter == 'high':
        anomalies = anomalies.filter(anomaly_type__in=HIGH_PRIORITY_TYPES)
    elif priority_filter == 'normal':
        anomalies = anomalies.exclude(anomaly_type__in=HIGH_PRIORITY_TYPES)
    
    # ========================================================
    # ONLY SHOW OPEN ANOMALIES (active ones)
    # ========================================================
    
    anomalies = anomalies.filter(status=PaymentAnomaly.Status.OPEN)
    
    # ========================================================
    # ORDERING - High priority first using Case/When
    # ========================================================
    
    # Annotate with priority order (1 = high, 2 = normal)
    anomalies = anomalies.annotate(
        priority_order=Case(
            When(anomaly_type__in=HIGH_PRIORITY_TYPES, then=Value(1)),
            default=Value(2),
            output_field=IntegerField()
        )
    ).order_by('priority_order', '-created_at')
    
    # ========================================================
    # GET TOTAL COUNT BEFORE PAGINATION
    # ========================================================
    
    total_count = anomalies.count()
    
    # ========================================================
    # PAGINATION
    # ========================================================
    
    paginator = Paginator(anomalies, 20)
    
    try:
        anomalies_page = paginator.page(page)
    except PageNotAnInteger:
        anomalies_page = paginator.page(1)
    except EmptyPage:
        anomalies_page = paginator.page(paginator.num_pages)
    
    # ========================================================
    # STATS (ALWAYS FOR CURRENT ACADEMIC YEAR - OPEN ONLY)
    # ========================================================
    
    total_anomalies = PaymentAnomaly.objects.filter(
        claim__academic_year=ACADEMIC_YEAR,
        status=PaymentAnomaly.Status.OPEN
    ).count()
    
    reference_not_found = PaymentAnomaly.objects.filter(
        claim__academic_year=ACADEMIC_YEAR,
        status=PaymentAnomaly.Status.OPEN,
        anomaly_type=PaymentAnomaly.Type.REFERENCE_NOT_FOUND
    ).count()
    
    amount_mismatch = PaymentAnomaly.objects.filter(
        claim__academic_year=ACADEMIC_YEAR,
        status=PaymentAnomaly.Status.OPEN,
        anomaly_type=PaymentAnomaly.Type.AMOUNT_MISMATCH
    ).count()
    
    reference_already_used = PaymentAnomaly.objects.filter(
        claim__academic_year=ACADEMIC_YEAR,
        status=PaymentAnomaly.Status.OPEN,
        anomaly_type=PaymentAnomaly.Type.REFERENCE_ALREADY_USED
    ).count()
    
    # ========================================================
    # AJAX RESPONSE FOR FILTERING
    # ========================================================
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        anomalies_data = []
        for anomaly in anomalies_page:
            # Determine priority
            is_high_priority = anomaly.anomaly_type in HIGH_PRIORITY_TYPES
            priority = 'high' if is_high_priority else 'normal'
            priority_label = 'Élevée' if is_high_priority else 'Normale'
            
            # Get icon based on anomaly type
            if anomaly.anomaly_type == PaymentAnomaly.Type.REFERENCE_NOT_FOUND:
                icon = 'bi-search'
                icon_class = 'danger'
            elif anomaly.anomaly_type == PaymentAnomaly.Type.AMOUNT_MISMATCH:
                icon = 'bi-currency-dollar'
                icon_class = 'warning'
            elif anomaly.anomaly_type == PaymentAnomaly.Type.REFERENCE_ALREADY_USED:
                icon = 'bi-files'
                icon_class = 'danger'
            else:
                icon = 'bi-exclamation-triangle'
                icon_class = 'warning'
            
            # Map type for data attribute
            if anomaly.anomaly_type == PaymentAnomaly.Type.REFERENCE_NOT_FOUND:
                type_value = 'reference'
            elif anomaly.anomaly_type == PaymentAnomaly.Type.AMOUNT_MISMATCH:
                type_value = 'amount'
            elif anomaly.anomaly_type == PaymentAnomaly.Type.REFERENCE_ALREADY_USED:
                type_value = 'duplicate'
            else:
                type_value = 'other'
            
            anomalies_data.append({
                'id': anomaly.id,
                'anomaly_id': f"ANO-{anomaly.id:05d}",
                'type': type_value,
                'type_display': anomaly.get_anomaly_type_display(),
                'icon': icon,
                'icon_class': icon_class,
                'priority': priority,
                'priority_label': priority_label,
                'student_name': anomaly.claim.student.full_congolese_name,
                'student_registration': anomaly.claim.student.registration_num or 'Sans ID',
                'reference': anomaly.claim.submitted_reference,
                'amount': f"{anomaly.claim.amount:,.2f} $",
                'date': anomaly.claim.created_at.strftime('%d/%m/%Y'),
                'time': anomaly.claim.created_at.strftime('%H:%M'),
                'claim_id': anomaly.claim.id,
                'url': f"/cashier/payment/{anomaly.claim.id}/",
            })
        
        return JsonResponse({
            'anomalies': anomalies_data,
            'total': total_count,
            'page': anomalies_page.number,
            'num_pages': paginator.num_pages,
            'has_next': anomalies_page.has_next(),
            'has_previous': anomalies_page.has_previous(),
            'total_anomalies': total_anomalies,
            'reference_not_found': reference_not_found,
            'amount_mismatch': amount_mismatch,
            'reference_already_used': reference_already_used,
            'result_count': total_count,
        })
    
    # ========================================================
    # CONTEXT FOR HTML RENDER
    # ========================================================
    
    context = {
        'user': request.user,
        'anomalies': anomalies_page,
        'paginator': paginator,
        'total_anomalies': total_anomalies,
        'reference_not_found': reference_not_found,
        'amount_mismatch': amount_mismatch,
        'reference_already_used': reference_already_used,
        'current_academic_year': ACADEMIC_YEAR,
        'search_query': search_query,
        'type_filter': type_filter,
        'priority_filter': priority_filter,
        'result_count': total_count,
        'high_priority_types': HIGH_PRIORITY_TYPES,  # Pass to template
    }
    
    return render(request, 'espace_cashier/cashier-anomalies.html', context)




@login_required
def cashier_history(request):
   
    # ========================================================
    # AUTHORIZATION
    # ========================================================
    
    if not (
        request.user.role == User.Role.STAFF
        and request.user.staff_role == User.StaffRole.CAISSIER
    ):
        return HttpResponseForbidden("Accès réservé au Caissier.")
    
    # ========================================================
    # GET FILTERS FROM REQUEST
    # ========================================================
    
    search_query = request.GET.get('search', '').strip()
    action_filter = request.GET.get('action', 'all')
    period_filter = request.GET.get('period', 'all')
    page = request.GET.get('page', 1)
    
    # ========================================================
    # BUILD HISTORY ENTRIES FROM DIFFERENT MODELS
    # ========================================================
    
    combined_entries = []
    
    # 1. Payment Claims (submitted)
    claims = PaymentClaim.objects.select_related(
        'student', 'bank'
    ).filter(
        academic_year=ACADEMIC_YEAR
    )
    
    for claim in claims:
        # Determine result based on status
        if claim.status == PaymentClaim.ClaimStatus.APPROVED and claim.is_verified:
            result = 'Rapproché'
            result_type = 'success'
        elif claim.status == PaymentClaim.ClaimStatus.PENDING:
            result = 'En attente'
            result_type = 'neutral'
        else:
            result = 'Anomalie'
            result_type = 'danger'
        
        combined_entries.append({
            'id': f"CLM-{claim.id:05d}",
            'created_at': claim.created_at,
            'action': 'submission',
            'action_label': 'Déclaration soumise',
            'student_name': claim.student.full_congolese_name,
            'registration': claim.student.registration_num or 'Sans ID',
            'reference': claim.submitted_reference,
            'amount': claim.amount,
            'agent_name': claim.student.full_congolese_name,
            'agent_role': 'Étudiant',
            'result': result,
            'result_type': result_type,
            'url': f"/cashier/payment/{claim.id}/",
        })
    
    # 2. Payment Anomalies
    anomalies = PaymentAnomaly.objects.select_related(
        'claim', 'claim__student'
    ).filter(
        claim__academic_year=ACADEMIC_YEAR
    )
    
    for anomaly in anomalies:
        if anomaly.status == PaymentAnomaly.Status.OPEN:
            result = 'À traiter'
            result_type = 'danger'
        elif anomaly.status == PaymentAnomaly.Status.RESOLVED:
            result = 'Résolue'
            result_type = 'success'
        else:
            result = 'Rejetée'
            result_type = 'warning'
        
        combined_entries.append({
            'id': f"ANO-{anomaly.id:05d}",
            'created_at': anomaly.created_at,
            'action': 'anomaly_detected',
            'action_label': 'Anomalie détectée',
            'student_name': anomaly.claim.student.full_congolese_name,
            'registration': anomaly.claim.student.registration_num or 'Sans ID',
            'reference': anomaly.claim.submitted_reference,
            'amount': anomaly.claim.amount,
            'agent_name': 'Système',
            'agent_role': 'Détection automatique',
            'result': result,
            'result_type': result_type,
            'url': f"/cashier/payment/{anomaly.claim.id}/",
        })
    
    # 3. Verification Logs
    verifications = VerificationLog.objects.select_related(
        'staff', 'student'
    ).all()
    
    for verification in verifications:
        if verification.is_financially_clear:
            result = 'Clear'
            result_type = 'success'
        else:
            result = 'Non clear'
            result_type = 'danger'
        
        combined_entries.append({
            'id': f"VRF-{verification.id:05d}",
            'created_at': verification.verified_at,
            'action': 'verification',
            'action_label': 'Vérification effectuée',
            'student_name': verification.student.full_congolese_name,
            'registration': verification.student.registration_num or 'Sans ID',
            'reference': '',
            'amount': 0,
            'agent_name': verification.staff.full_congolese_name,
            'agent_role': verification.get_method_display(),
            'result': result,
            'result_type': result_type,
            'url': None,
        })
    
    # 4. Payments (validated)
    payments = Payment.objects.select_related(
        'student', 'claim'
    ).filter(
        academic_year=ACADEMIC_YEAR
    )
    
    for payment in payments:
        if payment.status == Payment.Status.PAID:
            result = 'Payé'
            result_type = 'success'
        else:
            result = 'En attente'
            result_type = 'neutral'
        
        combined_entries.append({
            'id': f"PAY-{payment.id:05d}",
            'created_at': payment.created_at,
            'action': 'payment_validated',
            'action_label': 'Paiement validé',
            'student_name': payment.student.full_congolese_name,
            'registration': payment.student.registration_num or 'Sans ID',
            'reference': payment.bank_reference,
            'amount': payment.amount,
            'agent_name': 'Système',
            'agent_role': 'Validation automatique',
            'result': result,
            'result_type': result_type,
            'url': f"/cashier/payment/{payment.claim.id}/",
        })
    
    # ========================================================
    # SORT BY CREATED_AT (NEWEST FIRST)
    # ========================================================
    
    combined_entries.sort(key=lambda x: x['created_at'], reverse=True)
    
    # ========================================================
    # APPLY FILTERS
    # ========================================================
    
    # Apply search filter
    if search_query:
        search_lower = search_query.lower()
        combined_entries = [
            entry for entry in combined_entries
            if (search_lower in entry['student_name'].lower()) or
               (search_lower in entry['registration'].lower()) or
               (search_lower in entry['reference'].lower()) or
               (search_lower in entry['agent_name'].lower())
        ]
    
    # Apply action filter
    if action_filter != 'all':
        action_mapping = {
            'matching': 'submission',
            'correction': 'anomaly_detected',
            'escalation': 'verification',
            'verification': 'payment_validated',
        }
        if action_filter in action_mapping:
            combined_entries = [
                entry for entry in combined_entries
                if entry['action'] == action_mapping[action_filter]
            ]
    
    # Apply period filter
    today = timezone.now().date()
    
    if period_filter == 'today':
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        combined_entries = [
            entry for entry in combined_entries
            if today_start <= entry['created_at'] <= today_end
        ]
    elif period_filter == 'week':
        week_start = today - timedelta(days=today.weekday())
        week_start = datetime.combine(week_start, datetime.min.time())
        combined_entries = [
            entry for entry in combined_entries
            if entry['created_at'] >= week_start
        ]
    elif period_filter == 'month':
        month_start = today.replace(day=1)
        month_start = datetime.combine(month_start, datetime.min.time())
        combined_entries = [
            entry for entry in combined_entries
            if entry['created_at'] >= month_start
        ]
    
    # ========================================================
    # GET TOTAL COUNT BEFORE PAGINATION
    # ========================================================
    
    total_count = len(combined_entries)
    
    # ========================================================
    # PAGINATION
    # ========================================================
    
    paginator = Paginator(combined_entries, 20)
    
    try:
        entries_page = paginator.page(page)
    except PageNotAnInteger:
        entries_page = paginator.page(1)
    except EmptyPage:
        entries_page = paginator.page(paginator.num_pages)
    
    # ========================================================
    # STATS
    # ========================================================
    
    total_operations = len(combined_entries)
    
    # Count by action type
    matching_count = len([e for e in combined_entries if e['action'] == 'submission'])
    correction_count = len([e for e in combined_entries if e['action'] == 'anomaly_detected'])
    escalation_count = len([e for e in combined_entries if e['action'] == 'verification'])
    verification_count = len([e for e in combined_entries if e['action'] == 'payment_validated'])
    
    # ========================================================
    # AJAX RESPONSE FOR FILTERING
    # ========================================================
    
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        entries_data = []
        for entry in entries_page:
            # Get icon based on action
            if entry['action'] == 'submission':
                icon = 'bi-check-lg'
                icon_class = 'success'
            elif entry['action'] == 'anomaly_detected':
                icon = 'bi-pencil-square'
                icon_class = 'warning'
            elif entry['action'] == 'verification':
                icon = 'bi-arrow-up-right'
                icon_class = 'danger'
            elif entry['action'] == 'payment_validated':
                icon = 'bi-arrow-repeat'
                icon_class = 'neutral'
            else:
                icon = 'bi-clock-history'
                icon_class = 'neutral'
            
            entries_data.append({
                'id': entry['id'],
                'action': entry['action'],
                'action_label': entry['action_label'],
                'icon': icon,
                'icon_class': icon_class,
                'student_name': entry['student_name'],
                'registration': entry['registration'],
                'reference': entry['reference'],
                'amount': f"{entry['amount']:,.2f} $" if entry['amount'] else '-',
                'agent_name': entry['agent_name'],
                'agent_role': entry['agent_role'],
                'date': entry['created_at'].strftime('%d/%m/%Y'),
                'time': entry['created_at'].strftime('%H:%M'),
                'result': entry['result'],
                'result_type': entry['result_type'],
                'url': entry['url'],
            })
        
        return JsonResponse({
            'entries': entries_data,
            'total': total_count,
            'page': entries_page.number,
            'num_pages': paginator.num_pages,
            'has_next': entries_page.has_next(),
            'has_previous': entries_page.has_previous(),
            'total_operations': total_operations,
            'matching_count': matching_count,
            'correction_count': correction_count,
            'escalation_count': escalation_count,
            'verification_count': verification_count,
            'result_count': total_count,
        })
    
    # ========================================================
    # CONTEXT FOR HTML RENDER
    # ========================================================
    
    context = {
        'user': request.user,
        'entries': entries_page,
        'paginator': paginator,
        'total_operations': total_operations,
        'matching_count': matching_count,
        'correction_count': correction_count,
        'escalation_count': escalation_count,
        'verification_count': verification_count,
        'current_academic_year': ACADEMIC_YEAR,
        'search_query': search_query,
        'action_filter': action_filter,
        'period_filter': period_filter,
        'result_count': total_count,
    }
    
    return render(request, 'espace_cashier/cashier-history.html', context)





@login_required
def cashier_profile(request):
    
    
    # ========================================================
    # AUTHORIZATION
    # ========================================================
    
    if not (
        request.user.role == User.Role.STAFF
        and request.user.staff_role == User.StaffRole.CAISSIER
    ):
        return HttpResponseForbidden("Accès réservé au Caissier.")
    
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
            
            # Validate phone (optional - can be empty)
            # Phone validation can be customized based on your needs
            
            if errors:
                return JsonResponse({
                    'success': False,
                    'errors': errors
                }, status=400)
            
            # Update user
            user.email = email
            # If you have a phone field in your User model, add it here
            # user.phone = phone  # Add this if you have a phone field
            
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
    # GET LAST LOGIN INFO
    # ========================================================
    
    last_login = user.last_login
    last_login_display = "Première connexion" if not last_login else last_login.strftime("%d %B %Y, %H:%M")
    
    # Get agent ID (you can customize this based on your system)
    agent_id = f"CAISSE-{user.id:04d}"
    
    # Get role display name
    role_display = user.get_staff_role_display() or "Agent de caisse"
    
    # ========================================================
    # GET AVATAR INITIALS
    # ========================================================
    
    name_parts = user.full_congolese_name.split()
    initials = ''.join([part[0] for part in name_parts[:2]]) if name_parts else '?'
    
    # ========================================================
    # CONTEXT FOR HTML RENDER
    # ========================================================
    
    context = {
        'user': user,
        'agent_id': agent_id,
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
    }
    
    return render(request, 'espace_cashier/cashier-profile.html', context)