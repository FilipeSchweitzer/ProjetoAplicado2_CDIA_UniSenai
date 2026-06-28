import psycopg2

from db import get_connection

def criar_funcoes():
    funcao_salvar = """
    CREATE OR REPLACE FUNCTION salvar_molecula_completa(
        p_compound VARCHAR(255), p_smiles TEXT, p_formula VARCHAR(100),
        p_description TEXT, p_iupac_name VARCHAR(500), p_identification VARCHAR(255),
        p_natureza_final VARCHAR(255),
        p_is_human_metabolite BOOLEAN, p_is_natural_product BOOLEAN,
        p_max_clinical_phase VARCHAR(50), p_information TEXT, p_info_source VARCHAR(255),
        p_fragmentation_score NUMERIC(10,4), p_score NUMERIC(10,4), p_isotope_similarity NUMERIC(10,4), p_mass_error_ppm NUMERIC(10,4),
        p_inch_key VARCHAR(255), p_hmdb_id VARCHAR(100), p_foodb_id VARCHAR(100), p_link TEXT
    ) 
    RETURNS INTEGER AS $$
    DECLARE
        v_id_composto INT; v_id_molecula INT; v_id_natureza INT; v_id_origem INT;
    BEGIN
        INSERT INTO composto (compound, smiles, formula)
        VALUES (p_compound, p_smiles, p_formula) RETURNING id_composto INTO v_id_composto;

        INSERT INTO molecula (fk_composto, description, iupac_name, identification)
        VALUES (v_id_composto, p_description, p_iupac_name, p_identification) RETURNING id_molecula INTO v_id_molecula;

        SELECT id_natureza INTO v_id_natureza FROM natureza WHERE natureza_final = p_natureza_final LIMIT 1;
        IF v_id_natureza IS NULL THEN
            INSERT INTO natureza (natureza_final) VALUES (p_natureza_final) RETURNING id_natureza INTO v_id_natureza;
        END IF;

        INSERT INTO origem (fk_molecula, fk_natureza, is_human_metabolite, is_natural_product)
        VALUES (v_id_molecula, v_id_natureza, p_is_human_metabolite, p_is_natural_product) RETURNING id_origem INTO v_id_origem;

        INSERT INTO classificacao (fk_molecula, fk_origem, max_clinical_phase, information, info_source, fragmentation_score, score, isotope_similarity, mass_error_ppm)
        VALUES (v_id_molecula, v_id_origem, p_max_clinical_phase, p_information, p_info_source, p_fragmentation_score, p_score, p_isotope_similarity, p_mass_error_ppm);

        INSERT INTO identificacao_api (fk_molecula, inch_key, hmdb_id, foodb_id, link)
        VALUES (v_id_molecula, p_inch_key, p_hmdb_id, p_foodb_id, p_link);

        RETURN v_id_molecula;
    END;
    $$ LANGUAGE plpgsql;
    """

    funcao_pesquisar = """
    CREATE OR REPLACE FUNCTION pesquisar_molecula_por_termo(p_busca TEXT)
    RETURNS TABLE (
        id_molecula INT, nome_composto VARCHAR(255), formula_molecular VARCHAR(100),
        iupac_name VARCHAR(500), smiles TEXT, natureza VARCHAR(255),
        score_identificacao NUMERIC(10,4), hmdb_id VARCHAR(100)
    ) AS $$
    BEGIN
        RETURN QUERY
        SELECT 
            m.id_molecula, c.compound, c.formula, m.iupac_name, c.smiles, n.natureza_final, cl.score, api.hmdb_id
        FROM molecula m
        JOIN composto c ON m.fk_composto = c.id_composto
        LEFT JOIN origem o ON o.fk_molecula = m.id_molecula
        LEFT JOIN natureza n ON o.fk_natureza = n.id_natureza
        LEFT JOIN classificacao cl ON cl.fk_molecula = m.id_molecula
        LEFT JOIN identificacao_api api ON api.fk_molecula = m.id_molecula
        WHERE c.compound ILIKE '%' || p_busca || '%' OR 
              m.iupac_name ILIKE '%' || p_busca || '%' OR
              c.formula ILIKE '%' || p_busca || '%' OR
              api.hmdb_id ILIKE '%' || p_busca || '%';
    END;
    $$ LANGUAGE plpgsql;
    """

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        print("Injetando funções customizadas no PostgreSQL...")
        cur.execute(funcao_salvar)
        cur.execute(funcao_pesquisar)
            
        cur.close()
        conn.commit()
        print("Stored Procedures injetadas com sucesso!")
        
    except (Exception, psycopg2.DatabaseError) as error:
        print(f"Erro ao injetar funções: {error}")
        if conn:
            conn.rollback()
    finally:
        if conn is not None:
            conn.close()

if __name__ == '__main__':
    criar_funcoes()