-- 建立每日總結資料表
CREATE TABLE IF NOT EXISTS daily_summaries (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,
  summary_content TEXT NOT NULL,
  generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, summary_date)
);

CREATE INDEX idx_daily_summaries_team_date ON daily_summaries(team_id, summary_date);
CREATE INDEX idx_daily_summaries_date ON daily_summaries(summary_date);

COMMENT ON TABLE daily_summaries IS '每日工作總結記錄';
COMMENT ON COLUMN daily_summaries.team_id IS '團隊 ID';
COMMENT ON COLUMN daily_summaries.summary_date IS '總結日期';
COMMENT ON COLUMN daily_summaries.summary_content IS 'AI 生成的總結內容（Markdown 格式）';
COMMENT ON COLUMN daily_summaries.generated_by IS '生成者（使用者 ID）';
