ALTER TABLE products ADD COLUMN special_actions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN referral_code TEXT DEFAULT '';
