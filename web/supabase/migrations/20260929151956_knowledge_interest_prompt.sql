ALTER TABLE public.user_knowledge_preferences
ADD COLUMN IF NOT EXISTS interest_prompt text NOT NULL DEFAULT '';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_user_knowledge_interest_prompt_length'
          AND conrelid = 'public.user_knowledge_preferences'::regclass
    ) THEN
        ALTER TABLE public.user_knowledge_preferences
        ADD CONSTRAINT chk_user_knowledge_interest_prompt_length
        CHECK (char_length(interest_prompt) <= 500);
    END IF;
END
$$;
