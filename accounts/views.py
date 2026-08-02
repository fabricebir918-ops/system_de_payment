from django.contrib.auth.decorators import login_required
from django.shortcuts import render , redirect
from django.db.models import Q, Sum
from accounts.models import User, Payment, VerificationLog
from django.http import JsonResponse




@login_required
def finance_status_view(request):
    # 1. Handle Staff View
    if request.user.role == User.Role.STAFF:
        student = None
        total_paid = 0.00
        threshold = 50.00
        is_allowed = False
        search_query = request.GET.get('q', '').strip()
        method = request.GET.get('method', 'MANUAL_SEARCH') # Can pass 'QR_SCAN' from your frontend if needed

        if search_query:
            # Search student by registration number, username, or name
            student = User.objects.filter(
                Q(role=User.Role.STUDENT) & (
                    Q(registration_num__icontains=search_query) |
                    Q(username__icontains=search_query) |
                    Q(first_name__icontains=search_query) |
                    Q(last_name__icontains=search_query)
                )
            ).first()

            if student:
                # Calculate total paid amount for the student
                payment_summary = Payment.objects.filter(
                    student=student, 
                    status=Payment.Status.PAID
                ).aggregate(total=Sum('amount'))
                
                total_paid = payment_summary['total'] or 0.00

                # Check if total meets or exceeds the 500 threshold
                if total_paid >= threshold:
                    is_allowed = True

                # Automatically log the verification attempt
                VerificationLog.objects.create(
                    staff=request.user,
                    student=student,
                    method=method
                )

        context = {
            'student': student,
            'total_paid': total_paid,
            'threshold': threshold,
            'is_allowed': is_allowed,
            'search_query': search_query,
        }
        return render(request, 'finance/status.html', context)
    
    # 2. Handle Student View
    elif request.user.role == User.Role.STUDENT:
        # You can add student-specific data retrieval here later (e.g., their own payments/claims)
        return render(request, 'finance/student_status.html')
    
    # 3. Fallback just in case a role doesn't match
    return redirect('home')


@login_required
def student_search_api(request):
    # Only allow staff members to use this search endpoint
    if request.user.role != User.Role.STAFF:
        return JsonResponse({'error': 'Unauthorized'}, status=403)

    query = request.GET.get('q', '').strip()
    results = []

    if query:
        # Search for students matching the partial text
        students = User.objects.filter(
            Q(role=User.Role.STUDENT) & (
                Q(registration_num__icontsssains=query) |
                Q(username__icontains=query) |
                Q(first_name__icontains=query) |
                Q(last_name__icontains=query)
            )
        )[:10] # Limit to top 10 results for speed

        for s in students:
            results.append({
                'id': s.id,
                'name': s.get_full_name() or s.username,
                'registration_num': s.registration_num or 'No ID',
                'avatar_url': s.get_avatar_url,
                'url': f"?q={s.registration_num or s.username}" # Links back to your main view
            })

    return JsonResponse({'results': results})
