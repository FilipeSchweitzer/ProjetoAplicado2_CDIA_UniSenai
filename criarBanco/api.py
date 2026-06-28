"""API REST do DataMol — serve os dados do PostgreSQL para o frontend.

Endpoints:
    GET /api/health              -> status da conexão com o banco
    GET /api/molecules?limit=N   -> lista de moléculas (colunas iguais às do CSV)
    GET /api/search?q=termo      -> busca via função pesquisar_molecula_por_termo

As moléculas são devolvidas com os MESMOS nomes de coluna do CSV original,
para que o frontend (createMolecule) funcione tanto com a API quanto com o CSV.

Rodar:
    pip install -r requirements.txt
    python api.py            # sobe em http://localhost:5000
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
from psycopg2.extras import RealDictCursor

from db import get_connection

app = Flask(__name__)
CORS(app)  # libera o frontend estático (outra origem/porta) a consumir a API

# SELECT que reconstrói cada molécula com os nomes de coluna do CSV.
MOLECULES_SQL = """
    SELECT
        c.compound              AS "Compound ID",
        m.description           AS "Description",
        n.natureza_final        AS "Natureza_Final",
        c.formula               AS "Formula",
        api.inch_key            AS "InChIKey",
        m.iupac_name            AS "IUPAC Name",
        c.smiles                AS "SMILES",
        cl.information           AS "Information",
        cl.info_source          AS "Info_Source",
        o.is_natural_product    AS "Natural_Product",
        cl.max_clinical_phase   AS "Max_Clinical_Phase",
        o.is_human_metabolite   AS "Is_Human_Metabolite",
        api.hmdb_id             AS "HMDB_ID",
        api.foodb_id            AS "FooDB_ID",
        cl.score                AS "Score",
        cl.fragmentation_score  AS "Fragmentation Score",
        cl.isotope_similarity   AS "Isotope Similarity",
        m.identification        AS "Identifications"
    FROM molecula m
    JOIN composto c            ON m.fk_composto = c.id_composto
    LEFT JOIN origem o         ON o.fk_molecula = m.id_molecula
    LEFT JOIN natureza n       ON o.fk_natureza = n.id_natureza
    LEFT JOIN classificacao cl ON cl.fk_molecula = m.id_molecula
    LEFT JOIN identificacao_api api ON api.fk_molecula = m.id_molecula
    ORDER BY m.id_molecula
"""


def query(sql, params=None):
    conn = None
    try:
        conn = get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()
    finally:
        if conn is not None:
            conn.close()


@app.get("/api/health")
def health():
    try:
        query("SELECT 1 AS ok;")
        return jsonify(status="ok", database="connected")
    except Exception as e:
        return jsonify(status="error", database="unreachable", detail=str(e)), 503


@app.get("/api/molecules")
def molecules():
    limit = request.args.get("limit", type=int)
    sql = MOLECULES_SQL + (" LIMIT %s" if limit else "")
    try:
        rows = query(sql, (limit,) if limit else None)
        return jsonify(rows)
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.get("/api/search")
def search():
    term = (request.args.get("q") or "").strip()
    if not term:
        return jsonify([])
    try:
        rows = query("SELECT * FROM pesquisar_molecula_por_termo(%s);", (term,))
        return jsonify(rows)
    except Exception as e:
        return jsonify(error=str(e)), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
