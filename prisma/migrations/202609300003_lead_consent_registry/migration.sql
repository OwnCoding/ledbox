-- Constancia de consentimiento del lead (issue #105, Tanda 1 del plan #100):
-- canal por el que se aceptó el aviso (`sitio-web`, `whatsapp`, …) y versión
-- del aviso vigente al aceptar. El momento ya vive en `consentAt`.
--
-- Aditiva, idempotente y re-ejecutable: las columnas nacen nulas porque los
-- leads anteriores no tienen constancia completa; no se rellena nada.

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "consentChannel" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "consentVersion" TEXT;
