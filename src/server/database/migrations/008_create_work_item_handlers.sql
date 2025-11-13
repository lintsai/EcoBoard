-- 創建工作項目處理人關聯表
CREATE TABLE IF NOT EXISTS work_item_handlers (
  id SERIAL PRIMARY KEY,
  work_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handler_type VARCHAR(20) NOT NULL DEFAULT 'co_handler', -- 'primary' 或 'co_handler'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(work_item_id, user_id) -- 防止重複添加同一個人
);

-- 創建索引以優化查詢
CREATE INDEX IF NOT EXISTS idx_work_item_handlers_work_item ON work_item_handlers(work_item_id);
CREATE INDEX IF NOT EXISTS idx_work_item_handlers_user ON work_item_handlers(user_id);
CREATE INDEX IF NOT EXISTS idx_work_item_handlers_type ON work_item_handlers(handler_type);

-- 遷移現有數據：將 work_items.user_id 作為主要處理人添加到 work_item_handlers
INSERT INTO work_item_handlers (work_item_id, user_id, handler_type)
SELECT id, user_id, 'primary'
FROM work_items
WHERE NOT EXISTS (
  SELECT 1 FROM work_item_handlers 
  WHERE work_item_id = work_items.id AND user_id = work_items.user_id
);
