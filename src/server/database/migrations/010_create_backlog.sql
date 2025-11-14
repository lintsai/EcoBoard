-- 在 work_items 表中新增欄位來支援 backlog 功能
-- is_backlog: 標記是否為 backlog 項目（尚未安排到具體日期）
-- estimated_date: 預計處理時間（用於 backlog 項目的排程）

ALTER TABLE work_items 
ADD COLUMN IF NOT EXISTS is_backlog BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS estimated_date DATE;

-- 允許 checkin_id 為 NULL（backlog 項目不需要綁定打卡）
ALTER TABLE work_items 
ALTER COLUMN checkin_id DROP NOT NULL;

-- 創建索引以優化 backlog 相關查詢
CREATE INDEX IF NOT EXISTS idx_work_items_is_backlog ON work_items(is_backlog);
CREATE INDEX IF NOT EXISTS idx_work_items_estimated_date ON work_items(estimated_date);

-- 為 backlog 項目創建複合索引，優化常見查詢
CREATE INDEX IF NOT EXISTS idx_work_items_backlog_priority 
ON work_items(user_id, is_backlog, priority) 
WHERE is_backlog = TRUE;

COMMENT ON COLUMN work_items.is_backlog IS '標記是否為 backlog 項目（尚未安排到具體打卡日期）';
COMMENT ON COLUMN work_items.estimated_date IS '預計處理時間（主要用於 backlog 項目的排程規劃）';
COMMENT ON COLUMN work_items.checkin_id IS '打卡記錄 ID，backlog 項目可為 NULL';
