from django.contrib.auth import authenticate, login
from django.contrib.auth.views import LoginView
from django.shortcuts import redirect

from ..models import User


class CustomLoginView(LoginView):
    template_name = "accounts/login.html"

    def post(self, request, *args, **kwargs):
        identifier = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        remember = request.POST.get("remember")

        user = User.objects.filter(
            username__iexact=identifier
        ).first()

        if user is None:
            user = User.objects.filter(
                email__iexact=identifier
            ).first()

        if user is None:
            user = User.objects.filter(
                registration_num__iexact=identifier
            ).first()

        if user is not None:
            authenticated_user = authenticate(
                request,
                username=user.username,
                password=password,
            )

            if authenticated_user is not None:
                login(request, authenticated_user)

                if remember:
                    request.session.set_expiry(60 * 60 * 24 * 30)
                else:
                    request.session.set_expiry(0)

                return self.redirect_user_by_role(authenticated_user)

        return self.render_to_response(
            self.get_context_data(
                error="Identifiant ou mot de passe incorrect.",
                identifier=identifier,
            )
        )

    def redirect_user_by_role(self, user):

        if user.role == User.Role.STUDENT:
            return redirect("student_dashboard")

        if user.role == User.Role.STAFF:

            if user.staff_role == User.StaffRole.CAISSIER:
                return redirect("cashier_dashboard")

            if user.staff_role == User.StaffRole.SURVEILLANT:
                return redirect("supervisor_dashboard")

            if user.staff_role == User.StaffRole.FINANCIER:
                return redirect("finance_dashboard")

        if user.role == User.Role.ADMIN:
            return redirect("admin_dashboard")

        return redirect("login")