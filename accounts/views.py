from django.contrib.auth.decorators import login_required
from django.shortcuts import render , redirect
from django.db.models import Q, Sum
from accounts.models import User, Payment, VerificationLog , PaymentClaim
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from .forms import PaymentClaimForm
from django.contrib import messages
import io
import urllib.request
import qrcode
from django.http import FileResponse
from django.views.decorators.http import require_http_methods
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image,Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors


@login_required
@never_cache
def finance_status_view(request):
    # Define your system's current active academic context 
    # (You can later make this dynamic via a settings table or active term model)
    CURRENT_ACADEMIC_YEAR = '2025-2026'
    CURRENT_SEMESTER = Payment.Semester.S1  # Change to S2 when the next semester starts
    threshold = 50.00
    # 1. Handle Staff View
    if request.user.role == User.Role.STAFF:
        student = None
        total_paid = 0.00
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
                    status=Payment.Status.PAID,
                    academic_year=CURRENT_ACADEMIC_YEAR,
                    semester=CURRENT_SEMESTER
                ).aggregate(total=Sum('amount'))
                
                total_paid = payment_summary['total'] or 0.00

                # Check if total meets or exceeds the threshold
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
            'academic_year':CURRENT_ACADEMIC_YEAR,
            'semester':CURRENT_SEMESTER
        }
        return render(request, 'finance/status.html', context)
    
    # 2. Handle Student View
    elif request.user.role == User.Role.STUDENT:
        student = request.user

        # Fetch all historical payments for the student's table
        payments = Payment.objects.filter(student=student).order_by('-payment_date')
        
        # Calculate total paid strictly for the current academic year and semester
        payment_summary = payments.filter(
            status=Payment.Status.PAID,
            academic_year=CURRENT_ACADEMIC_YEAR,
            semester=CURRENT_SEMESTER
        ).aggregate(total=Sum('amount'))
        
        total_paid = payment_summary['total'] or 0.00
        is_allowed = total_paid >= threshold

        # Fetch recent payment claims (e.g., last 5 or 10 claims)
        recent_claims = student.payment_claims.order_by('-created_at')[:10]

        context = {
            'student': student,
            'payments': payments,
            'recent_claims': recent_claims,
            'total_paid': total_paid,
            'threshold': threshold,
            'is_allowed': is_allowed,
            'academic_year': CURRENT_ACADEMIC_YEAR,
            'semester': CURRENT_SEMESTER,
        }
        return render(request, 'finance/student_status.html', context)
    
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
                Q(registration_num__icontains=query) |
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

from .forms import PaymentClaimForm  # Make sure this form is imported at the top of your views.py

@login_required
@never_cache
def submit_claim_view(request):
    # Ensure only students can submit claims
    if request.user.role != User.Role.STUDENT:
        return redirect('login')

    if request.method == 'POST':
        form = PaymentClaimForm(request.POST)
        if form.is_valid():
            claim = form.save(commit=False)
            claim.student = request.user
            claim.status = PaymentClaim.ClaimStatus.PENDING  # Default to 'En attente'
            claim.save()
            messages.success(request, "Votre bordereau a été soumis avec succès !")

            return redirect('finance_status')  # Send them back to their dashboard after submission
    else:
        form = PaymentClaimForm()

    context = {
        'form': form,
    }
    return render(request, 'finance/submit_claim.html', context)


from django.contrib import messages  # <--- 1. Import messages

@login_required
@never_cache
def submit_claim_view(request):
    if request.user.role != User.Role.STUDENT:
        return redirect('home')

    if request.method == 'POST':
        form = PaymentClaimForm(request.POST)
        if form.is_valid():
            claim = form.save(commit=False)
            claim.student = request.user
            claim.status = PaymentClaim.ClaimStatus.PENDING
            claim.save()
            return redirect('finance_status')
    else:
        form = PaymentClaimForm()

    context = {
        'form': form,
    }
    return render(request, 'finance/submit_claim.html', context)



@login_required
@require_http_methods(["GET"])
def download_student_fiche_view(request):
    if request.user.role != User.Role.STUDENT:
        return redirect('home')

    student = request.user

    # 1. Create a buffer to receive PDF data
    buffer = io.BytesIO()

    # 2. Setup document geometry
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    story = []
    styles = getSampleStyleSheet()

    # Styles
    title_style = ParagraphStyle(
        'TitleStyle',
        parent=styles['Heading1'],
        fontSize=18,
        alignment=1,  # Center
        spaceAfter=20,
        textColor=colors.HexColor('#111827')
    )
    
    body_style = ParagraphStyle(
        'BodyStyle',
        parent=styles['Normal'],
        fontSize=12,
        spaceAfter=10,
        textColor=colors.HexColor('#374151')
    )

    # Title & Header
    story.append(Paragraph("Fiche de Situation Financière & QR Code", title_style))
    story.append(Spacer(1, 15))

    # 3. Handle Avatar Image Loading
    avatar_flowable = None
    try:
        avatar_url = student.get_avatar_url
        # If it's a relative media path (e.g. /media/avatars/...), make sure it works or handle via open
        if avatar_url.startswith('http'):
            req = urllib.request.urlopen(avatar_url)
            avatar_buffer = io.BytesIO(req.read())
        else:
            # Local media file path
            with open(student.avatar.path, 'rb') as f:
                avatar_buffer = io.BytesIO(f.read())
        
        avatar_flowable = Image(avatar_buffer, width=80, height=80)
    except Exception:
        # Fallback if avatar loading fails for any reason
        avatar_flowable = Paragraph("<b>[Photo non disponible]</b>", body_style)

    # Student Info text block (Updated)
    info_text = f"""
    <b>Nom complet :</b> {student.first_name} {student.last_name}<br/><br/>
    <b>Numéro d'immatriculation :</b> {student.registration_num or 'N/A'}<br/><br/>
    <b>Statut :</b> Étudiant Actif
    """
    info_paragraph = Paragraph(info_text, body_style)

    # Arrange Avatar and Info side-by-side using a Table layout
    info_table = Table([[avatar_flowable, info_paragraph]], colWidths=[100, 400])
    info_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
    ]))
    
    story.append(info_table)
    story.append(Spacer(1, 25))

    # 4. Generate QR code image in memory (Updated to link to staff status verification)
    base_url = request.build_absolute_uri('/finance/status/')
    qr_data = f"{base_url}?q={student.registration_num}&method=QR_SCAN"
    
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(qr_data)
    qr.make(fit=True)
    
    qr_img = qr.make_image(fill_color="black", back_color="white")
    
    qr_buffer = io.BytesIO()
    qr_img.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)

    qr_flowable = Image(qr_buffer, width=110, height=110)
    
    # Center the QR code using a single-cell table or direct flowable layout
    story.append(qr_flowable)
    
    story.append(Spacer(1, 8))
    caption_style = ParagraphStyle('Caption', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#6B7280'))
    story.append(Paragraph("Scannez ce code pour vérifier le statut Financier de l'étudiant.", caption_style))

    # 5. Build PDF
    doc.build(story)
    buffer.seek(0)

    filename = f"fiche_{student.registration_num or student.username}.pdf"
    return FileResponse(buffer, as_attachment=True, filename=filename)
