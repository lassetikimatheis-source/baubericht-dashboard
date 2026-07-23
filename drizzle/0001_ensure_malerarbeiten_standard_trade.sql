INSERT INTO "trades" ("name", "normalized_name", "sort_order", "is_main_trade")
VALUES ('Malerarbeiten', 'malerarbeiten', 10, true)
ON CONFLICT ("name") DO NOTHING;
