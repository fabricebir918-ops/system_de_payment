"""
accounts/management/commands/seed_bank_accounts.py

Crée un compte bancaire universitaire (UniversityBankAccount) actif
pour chaque banque déjà présente dans la table Bank.

Sans ce compte, le champ "Compte bancaire" de la modale d'import
d'extrait (finance-statements) reste grisé indéfiniment et
l'import échoue, même si la banque elle-même existe et est active.

Utilisation :

    python manage.py seed_bank_accounts

Le script est idempotent : le réexécuter ne crée pas de doublons
(un compte par banque est identifié par la contrainte unique
(bank, account_number) du modèle). Si un compte actif existe déjà
pour une banque, il est simplement ignoré et signalé.

Pour imposer d'autres numéros de compte que les valeurs par défaut
ci-dessous, éditez BANK_ACCOUNTS_SEED ou passez --interactive pour
saisir chaque numéro manuellement au clavier.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Bank, UniversityBankAccount


# ============================================================
# COMPTES PAR DÉFAUT
#
# Ces numéros correspondent aux comptes USD réels de l'UCB tels
# que déjà configurés en production / sur le poste de Fabrice.
# Adaptez-les si vos comptes réels diffèrent.
# ============================================================

BANK_ACCOUNTS_SEED = {
    "RAWBANK": {
        "account_number": "05100-05170-01013857601-47",
        "currency": "USD",
        "label": "Compte UCB - RAWBANK",
    },
    "BOA_RDC": {
        "account_number": "00029-01012-09014890001-91",
        "currency": "USD",
        "label": "Compte UCB - Bank of Africa RDC",
    },
    "EQUITY_BCDC": {
        "account_number": "00011-00170-00000361774-71",
        "currency": "USD",
        "label": "Compte UCB - Equity BCDC",
    },
}


class Command(BaseCommand):

    help = (
        "Crée un compte bancaire universitaire actif pour chaque "
        "banque existante, si elle n'en a pas déjà un. Nécessaire "
        "pour que l'import d'extraits bancaires fonctionne."
    )

    def add_arguments(self, parser):

        parser.add_argument(
            "--interactive",
            action="store_true",
            help=(
                "Demande le numéro de compte au clavier pour chaque "
                "banque, au lieu d'utiliser les valeurs par défaut "
                "codées dans ce script."
            ),
        )

    def handle(self, *args, **options):

        interactive = options["interactive"]

        banks = Bank.objects.filter(is_active=True).order_by("name")

        if not banks.exists():
            self.stdout.write(
                self.style.WARNING(
                    "Aucune banque active trouvée. Exécutez d'abord "
                    "seed_banks (ou la commande qui peuple la table "
                    "Bank) avant seed_bank_accounts."
                )
            )
            return

        created_count = 0
        skipped_count = 0

        with transaction.atomic():

            for bank in banks:

                existing = UniversityBankAccount.objects.filter(
                    bank=bank, is_active=True
                ).first()

                if existing:
                    self.stdout.write(
                        f"— {bank.code} : compte actif déjà présent "
                        f"({existing.account_number}), ignoré."
                    )
                    skipped_count += 1
                    continue

                defaults = BANK_ACCOUNTS_SEED.get(bank.code)

                if interactive:

                    account_number = input(
                        f"Numéro de compte pour {bank.name} "
                        f"({bank.code}) : "
                    ).strip()

                    if not account_number:
                        self.stdout.write(
                            self.style.WARNING(
                                f"— {bank.code} : aucun numéro saisi, "
                                "banque ignorée."
                            )
                        )
                        skipped_count += 1
                        continue

                    currency = (
                        input("Devise [USD] : ").strip() or "USD"
                    )

                    label = input(
                        "Libellé (optionnel) : "
                    ).strip()

                elif defaults:

                    account_number = defaults["account_number"]
                    currency = defaults["currency"]
                    label = defaults["label"]

                else:

                    # Banque active sans compte par défaut connu :
                    # on crée un compte générique plutôt que de
                    # bloquer l'import côté formulaire.
                    account_number = f"{bank.code}-USD-DEFAULT"
                    currency = "USD"
                    label = f"Compte UCB - {bank.name} (à compléter)"

                    self.stdout.write(
                        self.style.WARNING(
                            f"— {bank.code} : pas de numéro par défaut "
                            "connu pour cette banque, un compte "
                            "générique a été créé. Modifiez-le dans "
                            "l'admin Django avec le vrai numéro de "
                            "compte."
                        )
                    )

                account, was_created = (
                    UniversityBankAccount.objects.get_or_create(
                        bank=bank,
                        account_number=account_number,
                        defaults={
                            "currency": currency,
                            "label": label,
                            "is_active": True,
                        },
                    )
                )

                if was_created:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"✓ {bank.code} : compte créé "
                            f"({account.account_number})."
                        )
                    )
                    created_count += 1
                else:
                    self.stdout.write(
                        f"— {bank.code} : compte déjà existant "
                        f"({account.account_number}), ignoré."
                    )
                    skipped_count += 1

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Terminé : {created_count} compte(s) créé(s), "
                f"{skipped_count} ignoré(s)."
            )
        )
