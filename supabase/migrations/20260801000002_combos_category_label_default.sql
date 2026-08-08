-- Remove the hardcoded 'Signature Bundle' default from combos.category_label.
--
-- Category labels must come from stored data only. New combos created without
-- an explicit category should store an empty string so the UI renders nothing,
-- instead of being silently forced to 'Signature Bundle'.

ALTER TABLE combos
  ALTER COLUMN category_label SET DEFAULT '';
