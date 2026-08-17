from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth import get_user_model
from django.db.models import Q
from django import forms
from .models import PaymentClaim

User = get_user_model()

class EmailUsernameRegAuthForm(AuthenticationForm):
    def clean(self):
        username_input = self.cleaned_data.get('username')
        
        if username_input:
            # Search if the input matches a username, email, or registration number
            try:
                user = User.objects.get(
                    Q(username__iexact=username_input) | 
                    Q(email__iexact=username_input) | 
                    Q(registration_num__iexact=username_input)
                )
                # Replace the input value with the actual username so Django's default validator succeeds
                self.cleaned_data['username'] = user.username
            except User.DoesNotExist:
                pass  # Let Django handle the standard invalid login error
            except User.MultipleObjectsReturned:
                pass

        return super().clean()


class PaymentClaimForm(forms.ModelForm):
    class Meta:
        model = PaymentClaim
        fields = ['submitted_reference']
        widgets = {
            'submitted_reference': forms.TextInput(attrs={
                'placeholder': 'Entrez la référence du bordereau bancaire'
            })
        }
        

    def clean_submitted_reference(self):
        reference = self.cleaned_data.get('submitted_reference')
        
        # Check if a claim with this reference already exists in the database
        if PaymentClaim.objects.filter(submitted_reference=reference).exists():
            raise forms.ValidationError("Ce bordereau a déjà été soumis.")
            
        return reference
