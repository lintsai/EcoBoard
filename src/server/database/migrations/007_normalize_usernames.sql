-- Normalize existing usernames to lowercase
-- Remove email domain if present and convert to lowercase

-- Step 1: Handle duplicate accounts before normalization
-- For each set of duplicates, keep the oldest account (lowest ID) and merge data

DO $$
DECLARE
  duplicate_record RECORD;
  keep_id INTEGER;
  delete_id INTEGER;
BEGIN
  -- Find duplicate groups (accounts that would become the same after normalization)
  FOR duplicate_record IN 
    SELECT 
      LOWER(CASE 
        WHEN username LIKE '%@%' THEN SUBSTRING(username FROM 1 FOR POSITION('@' IN username) - 1)
        ELSE username
      END) as normalized_username,
      array_agg(id ORDER BY id) as user_ids
    FROM users
    GROUP BY LOWER(CASE 
      WHEN username LIKE '%@%' THEN SUBSTRING(username FROM 1 FOR POSITION('@' IN username) - 1)
      ELSE username
    END)
    HAVING count(*) > 1
  LOOP
    -- Keep the first (oldest) account
    keep_id := duplicate_record.user_ids[1];
    
    RAISE NOTICE 'Merging accounts for "%": keeping ID %, processing % duplicate(s)', 
      duplicate_record.normalized_username, 
      keep_id, 
      array_length(duplicate_record.user_ids, 1) - 1;
    
    -- Process each duplicate
    FOR i IN 2..array_length(duplicate_record.user_ids, 1)
    LOOP
      delete_id := duplicate_record.user_ids[i];
      
      RAISE NOTICE '  Merging ID % into ID %', delete_id, keep_id;
      
      -- Update team_members (skip if combination already exists)
      UPDATE team_members SET user_id = keep_id 
      WHERE user_id = delete_id 
      AND NOT EXISTS (
        SELECT 1 FROM team_members tm2
        WHERE tm2.user_id = keep_id AND tm2.team_id = team_members.team_id
      );
      
      -- Delete remaining team_members for delete_id
      DELETE FROM team_members WHERE user_id = delete_id;
      
      -- Update checkins (skip if combination already exists)
      UPDATE checkins SET user_id = keep_id 
      WHERE user_id = delete_id 
      AND NOT EXISTS (
        SELECT 1 FROM checkins c2
        WHERE c2.user_id = keep_id 
        AND c2.team_id = checkins.team_id 
        AND c2.checkin_date = checkins.checkin_date
      );
      
      -- Delete remaining checkins for delete_id
      DELETE FROM checkins WHERE user_id = delete_id;
      
      -- Update work_items
      UPDATE work_items SET user_id = keep_id WHERE user_id = delete_id;
      
      -- Update work_updates
      UPDATE work_updates SET user_id = keep_id WHERE user_id = delete_id;
      
      -- Update standup_meetings (reviewed_by)
      UPDATE standup_meetings SET reviewed_by = keep_id WHERE reviewed_by = delete_id;
      
      -- Update daily_summaries (generated_by)
      UPDATE daily_summaries SET generated_by = keep_id WHERE generated_by = delete_id;
      
      -- Update chat_messages
      UPDATE chat_messages SET user_id = keep_id WHERE user_id = delete_id;
      
      -- Update teams (created_by)
      UPDATE teams SET created_by = keep_id WHERE created_by = delete_id;
      
      -- Delete the duplicate account
      DELETE FROM users WHERE id = delete_id;
      
      RAISE NOTICE '  ✓ ID % merged and deleted', delete_id;
    END LOOP;
    
  END LOOP;
END $$;

-- Step 2: Now normalize all remaining usernames
UPDATE users 
SET username = LOWER(
  CASE 
    WHEN username LIKE '%@%' THEN SUBSTRING(username FROM 1 FOR POSITION('@' IN username) - 1)
    ELSE username
  END
),
display_name = LOWER(
  CASE 
    WHEN username LIKE '%@%' THEN SUBSTRING(username FROM 1 FOR POSITION('@' IN username) - 1)
    ELSE username
  END
)
WHERE username != LOWER(
  CASE 
    WHEN username LIKE '%@%' THEN SUBSTRING(username FROM 1 FOR POSITION('@' IN username) - 1)
    ELSE username
  END
);

-- Step 3: Create an index on lowercase username to speed up case-insensitive queries
-- Note: We keep the original UNIQUE constraint on username column
-- This index helps with LOWER(username) = LOWER($1) queries
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
