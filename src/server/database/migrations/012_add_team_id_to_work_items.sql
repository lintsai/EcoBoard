-- Add team scope to work items so backlog entries can be shared per team
ALTER TABLE work_items
ADD COLUMN IF NOT EXISTS team_id INTEGER REFERENCES teams(id);

-- Backfill team_id for existing records that are already tied to a checkin
UPDATE work_items wi
SET team_id = c.team_id
FROM checkins c
WHERE wi.team_id IS NULL
  AND wi.checkin_id = c.id;

-- Ensure queries can efficiently filter by team
CREATE INDEX IF NOT EXISTS idx_work_items_team_id ON work_items(team_id);

COMMENT ON COLUMN work_items.team_id IS 'Owning team for this work item (including backlog items without checkins)';
