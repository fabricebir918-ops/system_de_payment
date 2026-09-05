import csv
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from pathlib import Path
import xlrd
from openpyxl import load_workbook
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from accounts.models import (
    BankStatement,
    BankTransaction,
    UniversityBankAccount,
)
# ============================================================
# CONFIGURATION
# ============================================================
REQUIRED_COLUMNS = {
    "transaction_reference",
    "amount",
    "payment_date",
}
# ============================================================
# NORMALISATION
# ============================================================
def normalize_column_name(value):
    """
    Convert column names into a predictable format.
    Examples:
        "Transaction Reference" -> "transaction_reference"
        "Référence transaction" -> "reference_transaction"
        "Amount" -> "amount"
    """
    if value is None:
        return ""
    value = str(value).strip().lower()
    replacements = {
        "é": "e",
        "è": "e",
        "ê": "e",
        "ë": "e",
        "à": "a",
        "â": "a",
        "ä": "a",
        "î": "i",
        "ï": "i",
        "ô": "o",
        "ö": "o",
        "ù": "u",
        "û": "u",
        "ü": "u",
        "ç": "c",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    value = value.replace("-", "_")
    value = value.replace(" ", "_")
    return value
def normalize_row(row):
    """
    Convert a row dictionary/list into a dictionary
    using normalized column names.
    """
    return {
        normalize_column_name(key): value
        for key, value in row.items()
    }
# ============================================================
# ACADEMIC YEAR
# ============================================================
def academic_year_from_date(payment_date):
    """
    Determine the academic year from a payment date.
    Academic year:
        September -> December:
            2026 -> 2026-2027
        January -> August:
            2027 -> 2026-2027
    Adjust this rule later if the university uses
    another academic calendar.
    """
    if isinstance(payment_date, datetime):
        payment_date = payment_date.date()
    if not isinstance(payment_date, date):
        raise ValidationError(
            "Impossible de déterminer l'année académique."
        )
    if payment_date.month >= 9:
        return f"{payment_date.year}-{payment_date.year + 1}"
    return f"{payment_date.year - 1}-{payment_date.year}"
# ============================================================
# DATE PARSING
# ============================================================
def parse_payment_date(value):
    """
    Convert common CSV/Excel date formats into a timezone-aware datetime.
    """
    if value is None or value == "":
        raise ValidationError(
            "La date de paiement est obligatoire."
        )
    # Excel / Python datetime
    if isinstance(value, datetime):
        if timezone.is_naive(value):
            return timezone.make_aware(value)
        return value
    # Python date
    if isinstance(value, date):
        return timezone.make_aware(
            datetime.combine(value, datetime.min.time())
        )
    value = str(value).strip()
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d/%m/%Y",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%d-%m-%Y",
    ]
    for date_format in formats:
        try:
            parsed = datetime.strptime(value, date_format)
            return timezone.make_aware(parsed)
        except ValueError:
            continue
    raise ValidationError(
        f"Format de date invalide : {value}"
    )
# ============================================================
# AMOUNT PARSING
# ============================================================
def parse_amount(value):
    """
    Convert CSV/Excel amount into Decimal.
    Supports:
        100
        100.50
        100,50
        "$100.50"
        "100 000,50"
    """
    if value is None or value == "":
        raise ValidationError(
            "Le montant est obligatoire."
        )
    if isinstance(value, Decimal):
        amount = value
    else:
        value = str(value).strip()
        value = (
            value
            .replace("$", "")
            .replace("USD", "")
            .replace(" ", "")
        )
        # Handle European decimal format.
        if "," in value and "." not in value:
            value = value.replace(",", ".")
        elif "," in value and "." in value:
            value = value.replace(",", "")
        try:
            amount = Decimal(value)
        except InvalidOperation:
            raise ValidationError(
                f"Montant invalide : {value}"
            )
    if amount <= 0:
        raise ValidationError(
            "Le montant doit être supérieur à zéro."
        )
    return amount
# ============================================================
# CSV
# ============================================================
def read_csv_file(file_path):
    """
    Read CSV and return a list of dictionaries.
    """
    rows = []
    with open(
        file_path,
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as csv_file:
        sample = csv_file.read(4096)
        csv_file.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample)
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(
            csv_file,
            dialect=dialect,
        )
        if not reader.fieldnames:
            raise ValidationError(
                "Le fichier CSV ne contient aucune colonne."
            )
        for row in reader:
            rows.append(
                normalize_row(row)
            )
    return rows
# ============================================================
# XLSX
# ============================================================
def read_xlsx_file(file_path):
    """
    Read XLSX using openpyxl.
    """
    workbook = load_workbook(
        filename=file_path,
        read_only=True,
        data_only=True,
    )
    worksheet = workbook.active
    rows = worksheet.iter_rows(
        values_only=True
    )
    try:
        headers = next(rows)
    except StopIteration:
        raise ValidationError(
            "Le fichier XLSX est vide."
        )
    headers = [
        normalize_column_name(header)
        for header in headers
    ]
    result = []
    for row in rows:
        if not any(
            value is not None
            for value in row
        ):
            continue
        result.append(
            dict(
                zip(headers, row)
            )
        )
    workbook.close()
    return result
# ============================================================
# XLS
# ============================================================
def read_xls_file(file_path):
    """
    Read legacy XLS files using xlrd.
    """
    workbook = xlrd.open_workbook(
        file_path,
        on_demand=True,
    )
    worksheet = workbook.sheet_by_index(0)
    if worksheet.nrows == 0:
        raise ValidationError(
            "Le fichier XLS est vide."
        )
    headers = [
        normalize_column_name(
            worksheet.cell_value(0, column)
        )
        for column in range(
            worksheet.ncols
        )
    ]
    result = []
    for row_number in range(
        1,
        worksheet.nrows,
    ):
        values = [
            worksheet.cell_value(
                row_number,
                column,
            )
            for column in range(
                worksheet.ncols
            )
        ]
        if not any(
            value != ""
            for value in values
        ):
            continue
        result.append(
            dict(
                zip(headers, values)
            )
        )
    workbook.release_resources()
    return result
# ============================================================
# FILE READER
# ============================================================
def read_statement_file(file_path):
    """
    Detect file type and read it.
    """
    extension = Path(
        file_path
    ).suffix.lower()
    if extension == ".csv":
        return read_csv_file(file_path)
    if extension == ".xlsx":
        return read_xlsx_file(file_path)
    if extension == ".xls":
        return read_xls_file(file_path)
    raise ValidationError(
        "Format de fichier non supporté. "
        "Utilisez CSV, XLS ou XLSX."
    )
# ============================================================
# COLUMN VALIDATION
# ============================================================
def validate_columns(rows):
    """
    Make sure the imported file contains
    the columns required by AcademicPay.
    """
    if not rows:
        raise ValidationError(
            "Le fichier ne contient aucune transaction."
        )
    available_columns = set(
        rows[0].keys()
    )
    missing_columns = (
        REQUIRED_COLUMNS
        - available_columns
    )
    if missing_columns:
        raise ValidationError(
            "Colonnes manquantes : "
            + ", ".join(
                sorted(missing_columns)
            )
        )
# ============================================================
# IMPORT
# ============================================================
@transaction.atomic
def import_bank_statement(
    *,
    file_path,
    bank_account,
    imported_by,
):
    """
    Import a complete bank statement.
    The BankStatement represents the imported file.
    Each line of the file becomes a BankTransaction.
    The academic year is automatically determined
    from the first transaction.
    """
    if not isinstance(
        bank_account,
        UniversityBankAccount,
    ):
        raise ValidationError(
            "Compte bancaire invalide."
        )
    rows = read_statement_file(
        file_path
    )
    validate_columns(rows)
    parsed_transactions = []
    for row_number, row in enumerate(
        rows,
        start=2,
    ):
        try:
            reference = str(
                row.get(
                    "transaction_reference"
                )
                or ""
            ).strip()
            if not reference:
                raise ValidationError(
                    "La référence de transaction est obligatoire."
                )
            amount = parse_amount(
                row.get("amount")
            )
            payment_date = parse_payment_date(
                row.get("payment_date")
            )
            parsed_transactions.append(
                {
                    "transaction_reference": reference,
                    "amount": amount,
                    "payment_date": payment_date,
                }
            )
        except ValidationError as error:
            raise ValidationError(
                f"Erreur à la ligne {row_number} : {error}"
            )
    if not parsed_transactions:
        raise ValidationError(
            "Aucune transaction valide trouvée."
        )
    # --------------------------------------------------------
    # Academic year from first transaction
    # --------------------------------------------------------
    first_payment_date = min(
        transaction["payment_date"]
        for transaction in parsed_transactions
    )

    academic_year = academic_year_from_date(
        first_payment_date
    )
    # --------------------------------------------------------
    # Statement date range
    # --------------------------------------------------------
    payment_dates = [
        transaction["payment_date"].date()
        for transaction in parsed_transactions
    ]
    start_date = min(payment_dates)
    end_date = max(payment_dates)
    # --------------------------------------------------------
    # Create statement
    # --------------------------------------------------------
    statement = BankStatement.objects.create(
        file=file_path,
        bank_account=bank_account,
        start_date=start_date,
        end_date=end_date,
        imported_by=imported_by,
        academic_year=academic_year,
        status=BankStatement.Status.PENDING,
    )
    # --------------------------------------------------------
    # Create transactions
    # --------------------------------------------------------
    transactions = []
    for data in parsed_transactions:
        transactions.append(
            BankTransaction(
                transaction_reference=data[
                    "transaction_reference"
                ],
                statement=statement,
                bank_account=bank_account,
                amount=data["amount"],
                payment_date=data["payment_date"],
                is_verified=False,
            )
        )
    BankTransaction.objects.bulk_create(
        transactions
    )
    # --------------------------------------------------------
    # Update statement status
    # --------------------------------------------------------
    statement.status = (
        BankStatement.Status.PROCESSED
    )
    statement.save(
        update_fields=["status"]
    )
    return statement