UPDATE user_cards
SET card_number = RIGHT(regexp_replace(COALESCE(card_number, ''), '\D', '', 'g'), 4),
    cvv = NULL;
