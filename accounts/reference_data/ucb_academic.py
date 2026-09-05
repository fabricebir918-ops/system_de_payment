"""
Référentiel académique UCB pour les données de test.

Les libellés proviennent de l'offre de formation publiée par l'UCB.
Les codes sont des identifiants techniques internes à AcademicPay.

Structure :
Faculty -> Department -> Program -> AcademicProgram(level)
"""


def program(code, name, *levels):
    return {"code": code, "name": name, "levels": levels}


def department(code, name, *programs):
    return {"code": code, "name": name, "programs": programs}


UCB_ACADEMIC_STRUCTURE = [

    # Sciences Agronomiques et Environnement
    {
        "code": "AGRO",
        "name": "Sciences Agronomiques et Environnement",
        "departments": [
            department(
                "AGRO_EEB",
                "Exploitation des écosystèmes et biodiversité",
                program(
                    "AGRO_EEB",
                    "Exploitation des écosystèmes et biodiversité",
                    "BAC3", "M1", "M2",
                ),
            ),
            department(
                "AGRO_GSEA",
                "Gestion des sols, eaux et assainissement",
                program(
                    "AGRO_GSEA",
                    "Gestion des sols, eaux et assainissement",
                    "BAC3", "M1", "M2",
                ),
            ),
            department(
                "AGRO_PV",
                "Production végétale",
                program(
                    "AGRO_PV",
                    "Production végétale",
                    "BAC3", "M1", "M2",
                ),
            ),
        ],
    },

    # Droit
    {
        "code": "DROIT",
        "name": "Droit",
        "departments": [
            department(
                "DROIT_GENERAL",
                "Droit",
                program("DROIT_GENERAL", "Droit", "BAC1", "BAC2"),
            ),
            department(
                "DROIT_PUBLIC",
                "Droit public",
                program(
                    "DROIT_PUBLIC",
                    "Droit public",
                    "BAC3", "M1", "M2",
                ),
            ),
            department(
                "DROIT_PRIVE_JUD",
                "Droit privé et judiciaire",
                program(
                    "DROIT_PRIVE",
                    "Droit privé",
                    "BAC3",
                ),
                program(
                    "MASTER_DROIT_PRIVE_JUD",
                    "Droit privé et judiciaire",
                    "M1", "M2",
                ),
            ),
            department(
                "DROIT_ECO_AFF",
                "Droit économique et des affaires",
                program(
                    "DROIT_ECONOMIQUE",
                    "Droit économique",
                    "BAC3",
                ),
            ),
        ],
    },

    # Sciences Économiques et de Gestion
    {
        "code": "ECO_GESTION",
        "name": "Sciences Économiques et de Gestion",
        "departments": [
            department(
                "ECO_GESTION_GENERAL",
                "Économie et Gestion",
                program(
                    "ECO_GESTION_GENERAL",
                    "Économie et Gestion",
                    "BAC1", "BAC2",
                ),
            ),
            department(
                "ECONOMIE",
                "Économie",
                program(
                    "ECO_DEVELOPPEMENT",
                    "Économie du développement",
                    "M1", "M2",
                ),
                program(
                    "ECO_RURALE",
                    "Économie rurale",
                    "M1", "M2",
                ),
                program(
                    "ECO_PUBLIQUE",
                    "Économie publique",
                    "M1", "M2",
                ),
            ),
            department(
                "GESTION",
                "Gestion",
                program("GESTION", "Gestion", "BAC3"),
                program(
                    "GESTION_FINANCIERE",
                    "Gestion financière",
                    "M1", "M2",
                ),
                program(
                    "ENTREPRENEURIAT",
                    "Entrepreneuriat",
                    "M1", "M2",
                ),
            ),
            department(
                "FINANCE_COMPTA",
                "Finance et Comptabilité",
                program(
                    "AUDIT_COMPTABILITE",
                    "Audit et Comptabilité",
                    "M1", "M2",
                ),
            ),
        ],
    },

    # Sciences de la Santé
    {
        "code": "SANTE",
        "name": "Sciences de la Santé",
        "departments": [
            department(
                "BIOMED",
                "Sciences Biomédicales",
                program(
                    "BIOMED",
                    "Sciences Biomédicales",
                    "BAC1", "BAC2", "BAC3",
                ),
            ),
            department(
                "MEDECINE",
                "Médecine humaine",
                program(
                    "MEDECINE_HUMAINE",
                    "Médecine humaine",
                    "M1", "M2",
                ),
            ),
            department(
                "SANTE_PUBLIQUE",
                "Sciences de la Santé Publique",
                program(
                    "SANTE_PUBLIQUE",
                    "Sciences de la Santé Publique",
                    "M1", "M2",
                ),
            ),
        ],
    },

    # Sciences et Technologie
    {
        "code": "SCI_TECH",
        "name": "Sciences et Technologie",
        "departments": [
            department(
                "INFO",
                "Sciences Informatiques",
                program(
                    "GENIE_LOGICIEL",
                    "Génie Logiciel",
                    "BAC3",
                ),
                program(
                    "RESEAUX_TELECOM",
                    "Réseaux et Télécommunications",
                    "BAC3",
                ),
            ),
            department(
                "ENVIRONNEMENT",
                "Sciences de l'Environnement",
                program(
                    "ENVIRONNEMENT",
                    "Sciences de l'Environnement",
                    "BAC1", "BAC2", "BAC3",
                ),
            ),
            department(
                "POLYTECHNIQUE",
                "Polytechnique",
                program(
                    "GENIE_CHIMIQUE",
                    "Génie chimique",
                    "BAC1", "BAC2", "BAC3",
                ),
                program(
                    "MATERIAUX_METALLURGIE",
                    "Génie des matériaux et métallurgie",
                    "BAC1", "BAC2", "BAC3",
                ),
            ),
            department(
                "ARCHI_URBA",
                "École d'Architecture et Urbanisme",
                program(
                    "ARCHITECTURE",
                    "Architecture",
                    "BAC1", "BAC2", "BAC3",
                ),
            ),
        ],
    },

    # Sciences de l'Homme et de la Société
    {
        "code": "SHS",
        "name": "Sciences de l'Homme et de la Société",
        "departments": [
            department(
                "SCI_TRAVAIL",
                "Sciences du Travail",
                program(
                    "SCI_TRAVAIL",
                    "Sciences du Travail",
                    "BAC1", "BAC2", "BAC3",
                ),
            ),
            department(
                "SIC",
                "Sciences de l'Information et de la Communication",
                program(
                    "SIC",
                    "Sciences de l'Information et de la Communication",
                    "BAC1", "BAC2", "BAC3",
                ),
            ),
            department(
                "PAIX_CONFLITS",
                "Études de Paix et Conflits",
                program(
                    "PAIX_CONFLITS",
                    "Études de Paix et Conflits",
                    "BAC1", "BAC2", "BAC3",
                ),
            ),
        ],
    },
]