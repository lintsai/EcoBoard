-- Add AI-related fields to work_items table
ALTER TABLE work_items 
ADD COLUMN IF NOT EXISTS session_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS ai_summary TEXT,
ADD COLUMN IF NOT EXISTS ai_title VARCHAR(500);

-- Create index for session_id
CREATE INDEX IF NOT EXISTS idx_work_items_session ON work_items(session_id);

-- Add comment
COMMENT ON COLUMN work_items.session_id IS 'Chat session ID for this work item';
COMMENT ON COLUMN work_items.ai_summary IS 'AI-generated summary of the work item based on conversation';
COMMENT ON COLUMN work_items.ai_title IS 'AI-generated title for the work item';
