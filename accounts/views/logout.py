
from django.shortcuts import redirect
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.decorators.http import require_http_methods

@require_http_methods(["GET", "POST"])
def custom_logout(request):
    """
    Custom logout view that clears all session data
    and redirects to login page.
    """
    # Clear all session data
    request.session.flush()  # This clears ALL session data
    
    # Log out the user
    logout(request)
    
    # Add a message (optional)
    messages.success(request, "Vous avez été déconnecté avec succès.")
    
    # Redirect to login page
    return redirect('login')