UPDATE easypass_packs ep
INNER JOIN locations l ON l.id = ep.location_id
SET ep.price_cents = CASE ep.credits
  WHEN 1 THEN 700
  WHEN 3 THEN 1900
  WHEN 5 THEN 3000
  WHEN 8 THEN 4600
  WHEN 10 THEN 5500
END
WHERE l.slug = 'valladolid'
  AND ep.credits IN (1, 3, 5, 8, 10);
