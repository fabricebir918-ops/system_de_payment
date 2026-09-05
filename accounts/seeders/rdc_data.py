from decimal import Decimal


MALE_FIRST_NAMES = (
    "Aaron", "Abel", "Abraham", "Alain", "Alex", "Alexandre", "André",
    "Aristide", "Benjamin", "Blaise", "Bruno", "Christian", "Christophe",
    "Claude", "Daniel", "David", "Didier", "Dieudonné", "Emmanuel", "Eric",
    "Espoir", "Fabrice", "Francis", "Franck", "Gabriel", "Gédéon", "Georges",
    "Henri", "Hervé", "Isaac", "Jacques", "Jean", "Joël", "Jonathan",
    "Joseph", "Josué", "Junior", "Kevin", "Landry", "Luc", "Marc", "Michel",
    "Moïse", "Nathan", "Olivier", "Patrick", "Paul", "Pierre", "Prince",
    "Samuel", "Serge", "Stéphane", "Trésor", "Yannick",
)

FEMALE_FIRST_NAMES = (
    "Alice", "Aline", "Amanda", "Angélique", "Anne", "Aurélie", "Béatrice",
    "Bernadette", "Carine", "Chantal", "Charlotte", "Christelle", "Christine",
    "Clarisse", "Claudine", "Déborah", "Diane", "Divine", "Dorcas", "Esther",
    "Eunice", "Francine", "Gaëlle", "Grâce", "Hélène", "Irène", "Jeanne",
    "Jessica", "Joëlle", "Judith", "Julie", "Justine", "Laetitia", "Linda",
    "Louise", "Marie", "Marlène", "Merveille", "Micheline", "Monique",
    "Nadine", "Naomie", "Nathalie", "Noëlla", "Prisca", "Rachel", "Rebecca",
    "Ruth", "Sarah", "Solange", "Vanessa",
)

CONGOLESE_NAMES = (
    "Bahati", "Balume", "Baraka", "Bisimwa", "Byamungu", "Chibalonza",
    "Chibanda", "Chimanuka", "Cibangu", "Cishugi", "Ilunga", "Kabamba",
    "Kabange", "Kabeya", "Kahindo", "Kalala", "Kalenga", "Kalume", "Kambale",
    "Kamulete", "Kasongo", "Katembo", "Kavira", "Kayembe", "Kibonge", "Kiza",
    "Lukusa", "Lumbala", "Lusamba", "Mabiala", "Mbuyi", "Mihigo", "Mubalama",
    "Mugisho", "Mujinga", "Mukendi", "Mulamba", "Mulume", "Munganga",
    "Munyaneza", "Mushagalusa", "Mutombo", "Mweze", "Ndaye", "Ngoy",
    "Nkulu", "Safari", "Tshibangu", "Tshibanda", "Tshibola",
)

MALE = "M"
FEMALE = "F"
SEXES = (MALE, FEMALE)
SEX_WEIGHTS = (0.50, 0.50)

STUDENT_EMAIL_DOMAIN = "student.ucb.test"
STAFF_EMAIL_DOMAIN = "staff.ucb.test"

STUDENT_USERNAME_PREFIX = "student"
STAFF_USERNAME_PREFIX = "staff"
STUDENT_REGISTRATION_PREFIX = "UCB-TEST"
STAFF_REGISTRATION_PREFIX = "UCB-STAFF-TEST"

ACADEMIC_YEARS = (
    "2023-2024",
    "2024-2025",
    "2025-2026",
    "2026-2027",
)
CURRENT_ACADEMIC_YEAR = ACADEMIC_YEARS[-1]

TRANSACTION_COUNT_BY_YEAR = {
    "2023-2024": 500,
    "2024-2025": 800,
    "2025-2026": 1200,
    "2026-2027": 2000,
}

DEFAULT_CURRENCY = "USD"
DEFAULT_TEST_PASSWORD = "AcademicPayTest2026!"
DEFAULT_STUDENT_COUNT = 1000
DEFAULT_STAFF_COUNT = 30
DEFAULT_RANDOM_SEED = 42

STAFF_ROLE_WEIGHTS = {
    "SURVEILLANT": 0.50,
    "CAISSIER": 0.30,
    "RESPONSABLE_FINANCIER": 0.20,
}

PAYMENT_SCENARIO_WEIGHTS = {
    "APPROVED": 0.70,
    "PENDING": 0.20,
    "ANOMALY": 0.10,
}

ANOMALY_TYPES = (
    "REFERENCE_NOT_FOUND",
    "REFERENCE_ALREADY_USED",
    "AMOUNT_MISMATCH",
    "BANK_MISMATCH",
    "DATE_MISMATCH",
    "DUPLICATE_CLAIM",
)

PAYMENT_AMOUNTS = tuple(
    Decimal(value)
    for value in (
        "50.00", "100.00", "150.00", "200.00", "250.00",
        "300.00", "350.00", "400.00", "500.00",
    )
)

FEE_SCHEDULE_TOTAL_AMOUNTS = tuple(
    Decimal(value)
    for value in (
        "600.00", "700.00", "800.00",
        "900.00", "1000.00", "1200.00",
    )
)

STUDENT_SEED_OFFSET = 0
STAFF_SEED_OFFSET = 10_000
BANKING_SEED_OFFSET = 20_000
PAYMENT_SEED_OFFSET = 30_000