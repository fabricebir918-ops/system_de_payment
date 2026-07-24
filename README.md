# Système de Paiement — Backend API

Backend application built with Django, Django REST Framework, and PostgreSQL for managing student registrations and university fee payments.

---

## Setup Instructions for Local Development

### 1. Clone the Repository
git clone <YOUR_GIT_REPO_URL>
cd system_de_payment

### 2. Create and Activate Virtual Environment
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

### 3. Install Dependencies
pip install -r requirements.txt

### 4. Configure Environment Variables
Create a .env file in the root directory:
SECRET_KEY=django-insecure-o@kvrjpn#ytq9*&*+j_*$-bmp4gou14p^1zdygbw+dhdqzhiet
DEBUG=True
DB_NAME=systeme_paiement_db
DB_USER=postgres
DB_PASSWORD=your_local_postgres_password
DB_HOST=localhost
DB_PORT=5432

### 5. Set up the Database (PostgreSQL)
Create the database in PostgreSQL:
CREATE DATABASE systeme_paiement_db;

### 6. Run Migrations
python manage.py migrate

### 7. Create an Admin Superuser
python manage.py createsuperuser

### 8. Run the Development Server
python manage.py runserver
