import psycopg2

from db import get_connection

def criar_esquema():
    comandos = [
        """
        CREATE TABLE IF NOT EXISTS composto (
            id_composto  SERIAL       PRIMARY KEY,
            compound     VARCHAR(255) NOT NULL,
            smiles       TEXT,
            formula      VARCHAR(100)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS molecula (
            id_molecula  SERIAL       PRIMARY KEY,
            fk_composto  INTEGER      NOT NULL REFERENCES composto(id_composto),
            description  TEXT,
            iupac_name   VARCHAR(500),
            identification VARCHAR(255)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS natureza (
            id_natureza    SERIAL       PRIMARY KEY,
            natureza_final VARCHAR(255) NOT NULL
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS origem (
            id_origem           SERIAL   PRIMARY KEY,
            fk_molecula         INTEGER  NOT NULL REFERENCES molecula(id_molecula),
            fk_natureza         INTEGER  NOT NULL REFERENCES natureza(id_natureza),
            is_human_metabolite BOOLEAN  DEFAULT FALSE,
            is_natural_product  BOOLEAN  DEFAULT FALSE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS classificacao (
            id_classificacao    SERIAL         PRIMARY KEY,
            fk_molecula         INTEGER        NOT NULL REFERENCES molecula(id_molecula),
            fk_origem           INTEGER        NOT NULL REFERENCES origem(id_origem),
            max_clinical_phase  VARCHAR(50),
            information         TEXT,
            info_source         VARCHAR(255),
            fragmentation_score NUMERIC(10, 4),
            score               NUMERIC(10, 4),
            isotope_similarity  NUMERIC(10, 4),
            mass_error_ppm      NUMERIC(10, 4)
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS identificacao_api (
            id_api      SERIAL       PRIMARY KEY,
            fk_molecula INTEGER      NOT NULL REFERENCES molecula(id_molecula),
            inch_key    VARCHAR(255),
            hmdb_id     VARCHAR(100),
            foodb_id    VARCHAR(100),
            link        TEXT
        );
        """,
        # Criação de índices para otimização
        "CREATE INDEX IF NOT EXISTS idx_molecula_fk_composto    ON molecula(fk_composto);",
        "CREATE INDEX IF NOT EXISTS idx_origem_fk_molecula      ON origem(fk_molecula);",
        "CREATE INDEX IF NOT EXISTS idx_origem_fk_natureza      ON origem(fk_natureza);",
        "CREATE INDEX IF NOT EXISTS idx_classificacao_fk_mol    ON classificacao(fk_molecula);",
        "CREATE INDEX IF NOT EXISTS idx_classificacao_fk_origem ON classificacao(fk_origem);",
        "CREATE INDEX IF NOT EXISTS idx_id_api_fk_molecula      ON identificacao_api(fk_molecula);"
    ]
    
    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor()
        
        print("Criando tabelas e índices...")
        for comando in comandos:
            cur.execute(comando)
            
        cur.close()
        conn.commit()  # Confirma as alterações no banco
        print("Banco de dados configurado com sucesso!")
        
    except (Exception, psycopg2.DatabaseError) as error:
        print(f"Erro ao criar esquema: {error}")
        if conn:
            conn.rollback() # Cancela em caso de erro catastrófico
    finally:
        if conn is not None:
            conn.close()

if __name__ == '__main__':
    criar_esquema()