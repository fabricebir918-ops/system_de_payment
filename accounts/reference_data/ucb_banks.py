"""
Référentiel bancaire UCB utilisé par AcademicPay.

Les transactions sont générées séparément.
Les coordonnées bancaires doivent être vérifiées avant
toute utilisation hors environnement de test.
"""

UCB_BANKS = [
    {
        "code": "EQUITY_BCDC",
        "name": "Equity BCDC",
        "swift_code": "BCDCCDKI",
        "is_active": True,
        "accounts": [
            {
                "account_number": "00011-00170-00000361774-71",
                "currency": "USD",
                "label": "Compte UCB - Equity BCDC",
                "is_active": True,
            }
        ],
    },
    {
        "code": "RAWBANK",
        "name": "RAWBANK",
        "swift_code": "RAWBCDKI",
        "is_active": True,
        "accounts": [
            {
                "account_number": "05100-05170-01013857601-47",
                "currency": "USD",
                "label": "Compte UCB - RAWBANK",
                "is_active": True,
            }
        ],
    },
    {
        "code": "BOA_RDC",
        "name": "Bank of Africa RDC",
        "swift_code": "AFRICDKS",
        "is_active": True,
        "accounts": [
            {
                "account_number": "00029-01012-09014890001-91",
                "currency": "USD",
                "label": "Compte UCB - Bank of Africa RDC",
                "is_active": True,
            }
        ],
    },
]