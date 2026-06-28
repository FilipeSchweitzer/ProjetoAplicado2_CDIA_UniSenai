"""Ingestão do CSV final do pipeline para o PostgreSQL.

Lê o CSV integrado e, para cada linha, chama a stored procedure
`salvar_molecula_completa`, que popula as tabelas composto, molecula,
natureza, origem, classificacao e identificacao_api de forma transacional.

Uso:
    python ingest_csv.py                      # usa o CSV padrão
    python ingest_csv.py caminho/arquivo.csv  # outro CSV
    python ingest_csv.py --truncate           # limpa as tabelas antes de inserir

Pré-requisitos: rodar antes create_tables.py e create_functions.py.
"""
import argparse
import csv
import os

import psycopg2

from db import get_connection

# CSV padrão: ../codigoPlanilhas/final_integrado_com_hmdb.csv relativo a este arquivo
DEFAULT_CSV = os.path.normpath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "codigoPlanilhas",
        "final_integrado_com_hmdb.csv",
    )
)

NULL_TOKENS = {"", "nan", "null", "none", "-", "na"}


def fix_mojibake(text):
    """Corrige texto UTF-8 que foi salvo como Latin-1 (ex.: 'SintÃ©tico')."""
    if not text:
        return text
    if "Ã" in text or "Â" in text:
        try:
            return text.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return text
    return text


def clean(value):
    """Normaliza célula: trata NaN/vazio como None e conserta o encoding."""
    if value is None:
        return None
    text = fix_mojibake(str(value).strip())
    if text.lower() in NULL_TOKENS:
        return None
    return text


def to_bool(value):
    """'Yes'/'No' (ou variações) -> bool; vazio -> None."""
    text = clean(value)
    if text is None:
        return None
    return text.strip().lower() in {"yes", "sim", "true", "1", "y"}


def to_float(value):
    text = clean(value)
    if text is None:
        return None
    try:
        return float(text.replace(",", "."))
    except ValueError:
        return None


def row_to_params(row):
    """Mapeia uma linha do CSV para os 20 parâmetros de salvar_molecula_completa."""
    compound_id = clean(row.get("Compound ID"))
    description = clean(row.get("Description"))
    return (
        # composto
        compound_id or description or "DESCONHECIDO",   # p_compound (NOT NULL)
        clean(row.get("SMILES")),                        # p_smiles
        clean(row.get("Formula")),                       # p_formula
        # molecula
        description,                                     # p_description
        clean(row.get("IUPAC Name")),                    # p_iupac_name
        clean(row.get("Identifications")),               # p_identification
        # natureza
        clean(row.get("Natureza_Final")) or "Indefinido",  # p_natureza_final
        # origem
        to_bool(row.get("Is_Human_Metabolite")) or False,  # p_is_human_metabolite
        to_bool(row.get("Natural_Product")) or False,      # p_is_natural_product
        # classificacao
        clean(row.get("Max_Clinical_Phase")),            # p_max_clinical_phase
        clean(row.get("Information")),                    # p_information
        clean(row.get("Info_Source")),                   # p_info_source
        to_float(row.get("Fragmentation Score")),        # p_fragmentation_score
        to_float(row.get("Score")),                      # p_score
        to_float(row.get("Isotope Similarity")),         # p_isotope_similarity
        None,                                            # p_mass_error_ppm (não há no CSV)
        # identificacao_api
        clean(row.get("InChIKey")),                      # p_inch_key
        clean(row.get("HMDB_ID")),                       # p_hmdb_id
        clean(row.get("FooDB_ID")),                      # p_foodb_id
        None,                                            # p_link (não há no CSV)
    )


def truncate_tables(cur):
    cur.execute(
        "TRUNCATE classificacao, identificacao_api, origem, molecula, "
        "composto, natureza RESTART IDENTITY CASCADE;"
    )


def ingest(csv_path, truncate=False):
    if not os.path.exists(csv_path):
        raise SystemExit(f"CSV não encontrado: {csv_path}")

    conn = None
    inserted = 0
    errors = 0
    try:
        conn = get_connection()
        cur = conn.cursor()

        if truncate:
            print("Limpando tabelas existentes (TRUNCATE)...")
            truncate_tables(cur)

        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader, start=1):
                params = row_to_params(row)
                try:
                    cur.execute(
                        "SELECT salvar_molecula_completa("
                        + ",".join(["%s"] * len(params))
                        + ");",
                        params,
                    )
                    inserted += 1
                except (Exception, psycopg2.DatabaseError) as e:
                    errors += 1
                    conn.rollback()
                    print(f"  [linha {i}] erro: {e}")
                else:
                    conn.commit()

        print(f"\nConcluído: {inserted} moléculas inseridas, {errors} erro(s).")
    finally:
        if conn is not None:
            conn.close()


def main():
    parser = argparse.ArgumentParser(description="Ingestão do CSV para o PostgreSQL.")
    parser.add_argument("csv", nargs="?", default=DEFAULT_CSV, help="Caminho do CSV.")
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Limpa as tabelas antes de inserir (evita duplicação ao reimportar).",
    )
    args = parser.parse_args()
    print(f"Lendo: {args.csv}")
    ingest(args.csv, truncate=args.truncate)


if __name__ == "__main__":
    main()
