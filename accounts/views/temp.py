@login_required
def finance_payments(request):

    if not (
        request.user.role == User.Role.STAFF
        and request.user.staff_role == User.StaffRole.FINANCIER
    ):
        return HttpResponseForbidden(
            "Accès réservé au responsable financier."
        )

    payments_data = {
        "banks": serialize_banks(),
        "academicStructure": serialize_academic_structure(),
        "promotions": serialize_promotions(),
        "claims": serialize_payment_claims(),
    }

    # ============================================================
    # ADD THIS: Calculate bank summary for the template
    # ============================================================
    
    # Get all claims (you might want to reuse the queryset from serialize_payment_claims)
    claims = PaymentClaim.objects.filter(
        student__role=User.Role.STUDENT
    ).select_related('bank')
    
    # Calculate bank totals
    bank_summary = []
    total_collected = 0
    
    for bank in Bank.objects.filter(is_active=True).order_by("name"):
        bank_claims = claims.filter(bank=bank)
        bank_total = bank_claims.aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')
        bank_count = bank_claims.count()
        
        bank_summary.append({
            'code': bank.code,
            'name': bank.name,
            'total': float(bank_total),
            'count': bank_count,
        })
        
        total_collected += float(bank_total)
    
    # Calculate percentages
    for bank in bank_summary:
        bank['percentage'] = (
            (bank['total'] / total_collected) * 100
            if total_collected > 0
            else 0
        )

    # ============================================================
    # Return with bank_summary added
    # ============================================================

    return render(
        request,
        "espace_finance/finance-payments.html",
        {
            "payments_data": json.dumps(payments_data),
            "bank_summary": bank_summary,  # ADD THIS
        }
    )