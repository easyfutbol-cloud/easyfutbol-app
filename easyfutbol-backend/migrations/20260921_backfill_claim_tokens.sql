-- Las entradas compradas antes de que la ruta real de compra generase enlace
-- (matches.js) se quedaron sin claim_token, así que sus botones de
-- "Voy yo" / "Enviar enlace" no hacían nada. Les damos uno ahora.
UPDATE inscriptions
SET claim_token = REPLACE(UUID(), '-', '')
WHERE claim_token IS NULL;
