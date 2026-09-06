"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.contrib.auth.views import LogoutView
from django.urls import include,path
from django.conf import settings
from django.conf.urls.static import static
from accounts.views.login import CustomLoginView 
from accounts.views.logout import custom_logout
from accounts.views.espace_finance import (
    finance_dashboard,
    finance_payments,finance_statements, finance_import_statement, finance_statement_detail,
    finance_schedule, finance_schedule_delete,finance_schedule_save,finance_students,finance_student_detail,
    finance_reconciliation,finance_anomalies,finance_anomaly_update, finance_reports , finance_export_report,
    finance_history , finance_export_history,finance_profile ,finance_schedule_save_legacy,finance_schedule_delete_legacy,finance_students_export_csv,
)

 
from accounts.views.espace_cashier import (
    cashier_dashboard,cashier_payments,cashier_payment_detail,
    cashier_anomalies, cashier_history,cashier_profile,
)
from accounts.views.espace_supervisor import(
    supervisor_dashboard,supervisor_verification,
    supervisor_history,supervisor_profile,
)

from accounts.views.espace_student import(
    student_dashboard,student_payments,student_declare_payment,
    student_payment_detail,student_profile,student_help,student_payment_receipt,
    
)







urlpatterns = [
    path("admin/", admin.site.urls),

    path(
        "accounts/login/",
        CustomLoginView.as_view(),
        name="login",
    ),


    path(
            "logout/",
            custom_logout,
            name="logout",
        ),



   



    path('finance/dashboard/', finance_dashboard, name='finance_dashboard'),
    path('finance/payments/', finance_payments, name='finance_payments'),
    path('finance/statements/', finance_statements, name='finance_statements'),
    path('finance/statements/import/', finance_import_statement, name='finance_import_statement'),
    path('finance/statements/<int:statement_id>/', finance_statement_detail, name='finance_statement_detail'),
    path('finance/schedule/', finance_schedule, name='finance_schedule'),
    path('finance/schedule/save/', finance_schedule_save, name='finance_schedule_save'),
    path('finance/schedule/delete/',finance_schedule_delete, name='finance_schedule_delete'),
    path(
            "finance/schedule/save-legacy/",
            finance_schedule_save_legacy,
            name="finance_schedule_save_legacy",
        ),
        path(
            "finance/schedule/delete-legacy/",
            finance_schedule_delete_legacy,
            name="finance_schedule_delete_legacy",
        ),
    
        path("finance/students/", finance_students, name="finance_students"),
        path(
            "finance/students/<int:student_id>/",
            finance_student_detail,
            name="finance_student_detail",
        ),
        path(
            "finance/students/export/csv/",
            finance_students_export_csv,
            name="finance_students_export_csv",
        ),
    
        path(
            "finance/reconciliation/",
            finance_reconciliation,
            name="finance_reconciliation",
        ),
    
        path("finance/anomalies/", finance_anomalies, name="finance_anomalies"),
        path(
            "finance/anomalies/update/",
            finance_anomaly_update,
            name="finance_anomaly_update",
        ),
    
        path("finance/reports/", finance_reports, name="finance_reports"),
        path(
            "finance/reports/export/",
            finance_export_report,
            name="finance_export_report",
        ),
    
        path("finance/history/", finance_history, name="finance_history"),
        path(
            "finance/history/export/",
            finance_export_history,
            name="finance_export_history",
        ),
    
        path("finance/profile/", finance_profile, name="finance_profile"),
    
    
    path('finance/students/',finance_students, name='finance_students'),
    path('finance/students/<int:student_id>/', finance_student_detail, name='finance_student_detail'),
    path('finance/reconciliation/', finance_reconciliation, name='finance_reconciliation'),
    path('finance/anomalies/', finance_anomalies, name='finance_anomalies'),
    path('finance/anomalies/update/', finance_anomaly_update, name='finance_anomaly_update'),
    path('finance/reports/', finance_reports, name='finance_reports'),
    path('finance/reports/export/', finance_export_report, name='finance_export_report'),
    path('finance/history/', finance_history, name='finance_history'),
    path('finance/history/export/', finance_export_history, name='finance_export_history'),
    path('finance/profile/', finance_profile, name='finance_profile'),


    path('cashier/dashboard/', cashier_dashboard, name='cashier_dashboard'),
    path('cashier/payments/', cashier_payments, name='cashier_payments'),
    path('cashier/anomalies/', cashier_anomalies, name='cashier_anomalies'),
    path('cashier/history/', cashier_history, name='cashier_history'),
    path('cashier/profile/', cashier_profile, name='cashier_profile'),
    path('cashier/payment/<int:claim_id>/', cashier_payment_detail, name='cashier_payment_detail'),
    
    path('supervisor/dashboard/', supervisor_dashboard, name='supervisor_dashboard'),
    path('supervisor/verification/', supervisor_verification, name='supervisor_verification'),
    path('supervisor/student/<int:student_id>/', supervisor_dashboard, name='supervisor_student_detail'),
    path('supervisor/history/', supervisor_history, name='supervisor_history'),
    path('supervisor/profile/', supervisor_profile, name='supervisor_profile'),


    path('student/dashboard/', student_dashboard, name='student_dashboard'),
    path('student/payments/', student_payments, name='student_payments'),
    path('student/declare/', student_declare_payment, name='student_declare_payment'),
    path('student/payment/<int:payment_id>/', student_payment_detail, name='student_payment_detail'),
    path('student/profile/',student_profile, name='student_profile'),
    path('student/help/', student_help, name='student_help'),
    path('student/payment/<int:payment_id>/receipt/', student_payment_receipt, name='student_payment_receipt'),
        
    ]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)



