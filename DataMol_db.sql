-- ============================================================
--  Banco de Dados: Compostos Químicos
--  Normalização: Terceira Forma Normal (3FN)
--  Gerado para PostgreSQL 15+
-- ============================================================
 
-- ============================================================
-- EXTENSÕES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- uuid_generate_v4() alternativa
CREATE EXTENSION IF NOT EXISTS "citext";     -- texto case-insensitive para fórmulas
 
 
-- ============================================================
-- 1. TABELAS DE DOMÍNIO / LOOKUP
-- ============================================================
 
-- 1.1 Natureza final do composto (ex: Natural Product, Synthetic, etc.)
CREATE TABLE compound_nature (
    nature_id   SERIAL      PRIMARY KEY,
    label       VARCHAR(80) NOT NULL UNIQUE
);
 
-- 1.2 Tipos ChEMBL (ex: Small molecule, Protein, Antibody…)
CREATE TABLE chembl_type (
    chembl_type_id  SERIAL      PRIMARY KEY,
    label           VARCHAR(80) NOT NULL UNIQUE
);
 
-- 1.3 Fontes de informação
CREATE TABLE info_source (
    source_id   SERIAL       PRIMARY KEY,
    name        VARCHAR(120) NOT NULL UNIQUE,
    url         TEXT
);
 
-- 1.4 Fases clínicas (0-4 + NULL)
CREATE TABLE clinical_phase (
    phase_id    SMALLINT    PRIMARY KEY,   -- 0, 1, 2, 3, 4
    description VARCHAR(60) NOT NULL       -- 'Pré-clínica', 'Fase I', …
);
 
INSERT INTO clinical_phase (phase_id, description) VALUES
    (0, 'Pré-clínica'),
    (1, 'Fase I'),
    (2, 'Fase II'),
    (3, 'Fase III'),
    (4, 'Aprovado / Fase IV');
 
 
-- ============================================================
-- 2. TABELA CENTRAL: COMPOUND
-- ============================================================
CREATE TABLE compound (
    compound_id         VARCHAR(40)  PRIMARY KEY,   -- ID original (ex: HMDB0001, CID_xxx)
    description         TEXT,
    formula             CITEXT,
    inchikey            VARCHAR(27)  UNIQUE,         -- formato padrão InChIKey (27 chars)
    iupac_name          TEXT,
    smiles              TEXT,
    information         TEXT,
 
    -- FK para domínios
    nature_id           INTEGER      REFERENCES compound_nature(nature_id),
    chembl_type_id      INTEGER      REFERENCES chembl_type(chembl_type_id),
 
    -- Produto natural? (booleano)
    natural_product     BOOLEAN,
 
    -- Dados clínicos (dependem somente do composto → ficam aqui)
    max_clinical_phase  SMALLINT     REFERENCES clinical_phase(phase_id),
    is_human_metabolite BOOLEAN,
 
    -- Auditoria
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_compound_inchikey ON compound(inchikey);
CREATE INDEX idx_compound_formula  ON compound(formula);
CREATE INDEX idx_compound_nature   ON compound(nature_id);
 
 
-- ============================================================
-- 3. USOS MOLECULARES  (multivalorado → tabela separada)
-- ============================================================
CREATE TABLE molecular_use (
    use_id      SERIAL       PRIMARY KEY,
    label       VARCHAR(200) NOT NULL UNIQUE   -- ex: 'Antifungal', 'Food additive'
);
 
-- Relação N:N entre composto e uso
CREATE TABLE compound_use (
    compound_id VARCHAR(40) NOT NULL REFERENCES compound(compound_id) ON DELETE CASCADE,
    use_id      INTEGER     NOT NULL REFERENCES molecular_use(use_id)  ON DELETE CASCADE,
    PRIMARY KEY (compound_id, use_id)
);
 
 
-- ============================================================
-- 4. FONTES DO COMPOSTO  (N:N composto ↔ fonte)
-- ============================================================
CREATE TABLE compound_source (
    compound_id VARCHAR(40) NOT NULL REFERENCES compound(compound_id) ON DELETE CASCADE,
    source_id   INTEGER     NOT NULL REFERENCES info_source(source_id) ON DELETE CASCADE,
    PRIMARY KEY (compound_id, source_id)
);
 
 
-- ============================================================
-- 5. IDENTIFICADORES EXTERNOS
-- ============================================================
 
-- 5.1 HMDB  (um composto pode ter 1 ID HMDB)
CREATE TABLE compound_hmdb (
    compound_id VARCHAR(40)  PRIMARY KEY REFERENCES compound(compound_id) ON DELETE CASCADE,
    hmdb_id     VARCHAR(20)  NOT NULL UNIQUE   -- ex: HMDB0000001
);
 
-- 5.2 FooDB  (um composto pode estar ou não no FooDB)
CREATE TABLE compound_foodb (
    compound_id VARCHAR(40)  PRIMARY KEY REFERENCES compound(compound_id) ON DELETE CASCADE,
    foodb_id    VARCHAR(30)  NOT NULL UNIQUE,   -- ex: FDB000001
    in_foodb    BOOLEAN      NOT NULL DEFAULT TRUE
);
 
 
-- ============================================================
-- 6. IDENTIFICAÇÃO ESPECTROMÉTRICA
--    (Score, Fragmentation Score, Isotope Similarity dependem
--     do composto E do contexto de análise → tabela própria)
-- ============================================================
CREATE TABLE spectral_identification (
    identification_id       SERIAL       PRIMARY KEY,
    compound_id             VARCHAR(40)  NOT NULL REFERENCES compound(compound_id) ON DELETE CASCADE,
 
    -- Pontuações
    score                   NUMERIC(6,4),
    fragmentation_score     NUMERIC(6,4),
    isotope_similarity      NUMERIC(6,4),
 
    -- Resultado da identificação (texto livre ou código)
    identifications         TEXT,
 
    -- Natureza final atribuída nesta identificação
    -- (pode diferir da natureza_id global do composto)
    nature_id               INTEGER      REFERENCES compound_nature(nature_id),
 
    -- Metadados da análise
    analysis_date           DATE,
    notes                   TEXT,
 
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
 
CREATE INDEX idx_spectral_compound ON spectral_identification(compound_id);
CREATE INDEX idx_spectral_score    ON spectral_identification(score DESC);
 
 
-- ============================================================
-- 7. TRIGGER: atualiza updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
 
CREATE TRIGGER trg_compound_updated_at
    BEFORE UPDATE ON compound
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
 
 
-- ============================================================
-- 8. VIEWS ÚTEIS
-- ============================================================
 
-- Vista consolidada (equivalente ao CSV original)
CREATE VIEW vw_compound_full AS
SELECT
    c.compound_id,
    c.description,
    cn.label                        AS natureza_final,
    c.formula,
    c.inchikey,
    c.iupac_name,
    c.smiles,
    c.information,
    -- usos concatenados
    (
        SELECT STRING_AGG(mu.label, '; ' ORDER BY mu.label)
        FROM compound_use cu
        JOIN molecular_use mu ON mu.use_id = cu.use_id
        WHERE cu.compound_id = c.compound_id
    )                               AS molecular_uses,
    -- fontes concatenadas
    (
        SELECT STRING_AGG(ins.name, '; ' ORDER BY ins.name)
        FROM compound_source cs
        JOIN info_source ins ON ins.source_id = cs.source_id
        WHERE cs.compound_id = c.compound_id
    )                               AS info_sources,
    ct.label                        AS chembl_type,
    c.natural_product,
    cp.description                  AS max_clinical_phase,
    c.is_human_metabolite,
    ch.hmdb_id,
    cf.in_foodb,
    cf.foodb_id,
    -- melhor score de identificação
    si.score,
    si.fragmentation_score,
    si.isotope_similarity,
    si.identifications
FROM compound c
LEFT JOIN compound_nature     cn ON cn.nature_id      = c.nature_id
LEFT JOIN chembl_type         ct ON ct.chembl_type_id = c.chembl_type_id
LEFT JOIN clinical_phase      cp ON cp.phase_id       = c.max_clinical_phase
LEFT JOIN compound_hmdb       ch ON ch.compound_id    = c.compound_id
LEFT JOIN compound_foodb      cf ON cf.compound_id    = c.compound_id
LEFT JOIN LATERAL (
    SELECT score, fragmentation_score, isotope_similarity, identifications
    FROM spectral_identification
    WHERE compound_id = c.compound_id
    ORDER BY score DESC NULLS LAST
    LIMIT 1
) si ON TRUE;
 
 
-- ============================================================
-- FIM DO SCRIPT
-- ============================================================