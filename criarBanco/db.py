"""Conexão central com o PostgreSQL do DataMol.

As credenciais vêm de variáveis de ambiente para não ficarem hardcoded.
Defina-as antes de rodar os scripts (ou crie um arquivo .env e exporte):

    PowerShell:
        $env:DATAMOL_DB_NAME = "datamol"
        $env:DATAMOL_DB_USER = "postgres"
        $env:DATAMOL_DB_PASSWORD = "sua_senha"
        $env:DATAMOL_DB_HOST = "localhost"
        $env:DATAMOL_DB_PORT = "5432"
"""
import os

import psycopg2


def get_connection():
    """Abre uma conexão com o banco usando as variáveis de ambiente."""
    return psycopg2.connect(
        dbname=os.getenv("DATAMOL_DB_NAME", "datamol"),
        user=os.getenv("DATAMOL_DB_USER", "postgres"),
        password=os.getenv("DATAMOL_DB_PASSWORD", "postgres"),
        host=os.getenv("DATAMOL_DB_HOST", "localhost"),
        port=os.getenv("DATAMOL_DB_PORT", "5432"),
    )
