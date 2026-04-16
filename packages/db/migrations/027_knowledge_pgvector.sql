CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE knowledge_nodes
  ADD COLUMN IF NOT EXISTS embedding_vector vector(3072);

DO $$
BEGIN
  BEGIN
    CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_embedding_vector
      ON knowledge_nodes
      USING hnsw ((embedding_vector::halfvec(3072)) halfvec_cosine_ops);
  EXCEPTION
    WHEN undefined_object
      OR undefined_function
      OR invalid_parameter_value
      OR program_limit_exceeded
      OR feature_not_supported
    THEN
      RAISE NOTICE 'Skipping pgvector ANN index creation: %', SQLERRM;
  END;
END
$$;
