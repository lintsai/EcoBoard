-- Add priority field to work_items table
-- Priority levels: 1 (highest) to 5 (lowest), default is 3 (medium)

ALTER TABLE work_items ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5);

-- Create index for efficient priority sorting
CREATE INDEX IF NOT EXISTS idx_work_items_priority ON work_items(priority);

-- Update existing records to have medium priority (3)
UPDATE work_items SET priority = 3 WHERE priority IS NULL;

-- Add comment to document the priority levels
COMMENT ON COLUMN work_items.priority IS 'Priority level: 1=Highest, 2=High, 3=Medium, 4=Low, 5=Lowest';
