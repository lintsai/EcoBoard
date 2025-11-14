-- 建立週報資料表
CREATE TABLE IF NOT EXISTS weekly_reports (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  report_name VARCHAR(255) NOT NULL,
  report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('statistics', 'analysis', 'burndown', 'productivity', 'task_distribution')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  report_content TEXT NOT NULL,
  generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_weekly_reports_team ON weekly_reports(team_id);
CREATE INDEX idx_weekly_reports_dates ON weekly_reports(team_id, start_date, end_date);
CREATE INDEX idx_weekly_reports_type ON weekly_reports(report_type);
CREATE INDEX idx_weekly_reports_created ON weekly_reports(created_at DESC);

COMMENT ON TABLE weekly_reports IS '週報記錄';
COMMENT ON COLUMN weekly_reports.team_id IS '團隊 ID';
COMMENT ON COLUMN weekly_reports.report_name IS '報表名稱（AI 生成）';
COMMENT ON COLUMN weekly_reports.report_type IS '報表類型：statistics(統計報表), analysis(分析報表), burndown(燃盡圖), productivity(生產力報告), task_distribution(任務分布)';
COMMENT ON COLUMN weekly_reports.start_date IS '報告起始日期';
COMMENT ON COLUMN weekly_reports.end_date IS '報告結束日期';
COMMENT ON COLUMN weekly_reports.report_content IS 'AI 生成的報告內容（Markdown 格式）';
COMMENT ON COLUMN weekly_reports.generated_by IS '生成者（使用者 ID）';
