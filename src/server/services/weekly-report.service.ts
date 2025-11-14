import axios from 'axios';
import { query } from '../database/pool';

// 使用函數來延遲讀取環境變數，確保 .env 已經載入
const getVLLMConfig = () => ({
  apiUrl: process.env.VLLM_API_URL || 'http://localhost:8000/v1',
  apiKey: process.env.VLLM_API_KEY || '',
  modelName: process.env.VLLM_MODEL_NAME || 'gpt-3.5-turbo'
});

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// 報表類型定義
export type ReportType = 'statistics' | 'analysis' | 'burndown' | 'productivity' | 'task_distribution';

export interface WeeklyReportParams {
  teamId: number;
  startDate: string;
  endDate: string;
  reportType: ReportType;
  userId: number;
}

// 取得團隊週報列表
export const getWeeklyReports = async (teamId: number, limit: number = 50) => {
  try {
    const result = await query(
      `SELECT wr.id, wr.team_id, wr.report_name, wr.report_type,
              TO_CHAR(wr.start_date, 'YYYY-MM-DD') as start_date,
              TO_CHAR(wr.end_date, 'YYYY-MM-DD') as end_date,
              wr.created_at, wr.updated_at,
              u.display_name as generated_by_name
       FROM weekly_reports wr
       LEFT JOIN users u ON wr.generated_by = u.id
       WHERE wr.team_id = $1
       ORDER BY wr.created_at DESC
       LIMIT $2`,
      [teamId, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Get weekly reports error:', error);
    throw new Error('取得週報列表失敗');
  }
};

// 取得特定週報詳情
export const getWeeklyReportById = async (reportId: number, teamId: number) => {
  try {
    const result = await query(
      `SELECT wr.id, wr.team_id, wr.report_name, wr.report_type,
              TO_CHAR(wr.start_date, 'YYYY-MM-DD') as start_date,
              TO_CHAR(wr.end_date, 'YYYY-MM-DD') as end_date,
              wr.report_content, wr.created_at, wr.updated_at,
              u.display_name as generated_by_name, u.username as generated_by_username
       FROM weekly_reports wr
       LEFT JOIN users u ON wr.generated_by = u.id
       WHERE wr.id = $1 AND wr.team_id = $2`,
      [reportId, teamId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Get weekly report by id error:', error);
    throw new Error('取得週報詳情失敗');
  }
};

// 收集週報數據
const collectWeeklyData = async (teamId: number, startDate: string, endDate: string) => {
  // 1. 取得時間範圍內的所有工作項目
  const workItems = await query(
    `SELECT DISTINCT wi.*, u.display_name, u.username, c.checkin_date,
            COALESCE(latest_update.progress_status, 'in_progress') as current_status,
            latest_update.updated_at as last_update_time
     FROM work_items wi
     INNER JOIN checkins c ON wi.checkin_id = c.id
     INNER JOIN users u ON wi.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT progress_status, updated_at
       FROM work_updates
       WHERE work_item_id = wi.id
       ORDER BY updated_at DESC
       LIMIT 1
     ) latest_update ON true
     WHERE c.team_id = $1 
       AND (wi.is_backlog IS NULL OR wi.is_backlog = FALSE)
       AND c.checkin_date BETWEEN $2 AND $3
     ORDER BY c.checkin_date, wi.created_at`,
    [teamId, startDate, endDate]
  );

  // 2. 取得工作項目的處理人資訊
  const workItemIds = workItems.rows.map((item: any) => item.id);
  const handlersMap: any = {};
  
  if (workItemIds.length > 0) {
    const handlers = await query(
      `SELECT wih.work_item_id, wih.handler_type, wih.user_id,
              u.username, u.display_name
       FROM work_item_handlers wih
       INNER JOIN users u ON wih.user_id = u.id
       WHERE wih.work_item_id = ANY($1)
       ORDER BY wih.work_item_id, 
                CASE wih.handler_type WHEN 'primary' THEN 1 ELSE 2 END`,
      [workItemIds]
    );
    
    handlers.rows.forEach((h: any) => {
      if (!handlersMap[h.work_item_id]) {
        handlersMap[h.work_item_id] = { primary: null, co_handlers: [] };
      }
      if (h.handler_type === 'primary') {
        handlersMap[h.work_item_id].primary = {
          user_id: h.user_id,
          username: h.username,
          display_name: h.display_name
        };
      } else {
        handlersMap[h.work_item_id].co_handlers.push({
          user_id: h.user_id,
          username: h.username,
          display_name: h.display_name
        });
      }
    });
  }
  
  workItems.rows.forEach((item: any) => {
    item.handlers = handlersMap[item.id] || { primary: null, co_handlers: [] };
  });

  // 3. 取得所有工作更新記錄
  const updates = await query(
    `SELECT wu.*, wi.content as work_item_content, 
            wi.ai_title as work_item_title,
            u.display_name, u.username,
            c.checkin_date as item_created_date
     FROM work_updates wu
     INNER JOIN work_items wi ON wu.work_item_id = wi.id
     INNER JOIN users u ON wu.user_id = u.id
     INNER JOIN checkins c ON wi.checkin_id = c.id
     WHERE c.team_id = $1 
       AND DATE(wu.updated_at) BETWEEN $2 AND $3
       AND (wi.is_backlog IS NULL OR wi.is_backlog = FALSE)
     ORDER BY wu.updated_at ASC`,
    [teamId, startDate, endDate]
  );

  // 4. 取得團隊成員資訊
  const teamMembers = await query(
    `SELECT u.id, u.username, u.display_name
     FROM team_members tm
     INNER JOIN users u ON tm.user_id = u.id
     WHERE tm.team_id = $1
     ORDER BY u.display_name`,
    [teamId]
  );

  // 5. 取得每日打卡統計
  const dailyCheckins = await query(
    `SELECT DATE(c.checkin_date) as date, COUNT(DISTINCT c.user_id) as checkin_count
     FROM checkins c
     WHERE c.team_id = $1 AND c.checkin_date BETWEEN $2 AND $3
     GROUP BY DATE(c.checkin_date)
     ORDER BY date`,
    [teamId, startDate, endDate]
  );

  return {
    workItems: workItems.rows,
    updates: updates.rows,
    teamMembers: teamMembers.rows,
    dailyCheckins: dailyCheckins.rows
  };
};

// AI 產生報表名稱和內容
const generateReportWithAI = async (
  reportType: ReportType,
  data: any,
  startDate: string,
  endDate: string
) => {
  const config = getVLLMConfig();

  let systemPrompt = '';
  let userPrompt = '';

  switch (reportType) {
    case 'statistics':
      systemPrompt = '你是一個專業的數據分析師，擅長撰寫統計報表。';
      userPrompt = `請根據以下數據產生 ${startDate} 至 ${endDate} 的週報統計報表：

## 基本統計
- 團隊總人數：${data.teamMembers.length}
- 工作項目總數：${data.workItems.length}
- 更新記錄總數：${data.updates.length}
- 工作天數：${data.dailyCheckins.length}

## 每日打卡統計
${JSON.stringify(data.dailyCheckins, null, 2)}

## 工作項目詳情
${JSON.stringify(data.workItems.map((item: any) => ({
  標題: item.ai_title || item.content.substring(0, 50),
  主要處理人: item.handlers?.primary?.display_name || '未指定',
  共同處理人: item.handlers?.co_handlers?.map((h: any) => h.display_name).join(', ') || '無',
  優先級: item.priority || 3,
  狀態: item.current_status,
  建立日期: item.checkin_date
})), null, 2)}

## 工作更新記錄
${JSON.stringify(data.updates.map((update: any) => ({
  成員: update.display_name,
  工作項目: update.work_item_title || update.work_item_content.substring(0, 50),
  狀態: update.progress_status,
  更新時間: update.updated_at
})), null, 2)}

請提供：
1. 報表名稱（20字以內，簡潔明瞭）
2. 詳細統計報表（包含：完成率、成員貢獻度、每日工作量等，使用 Markdown 格式，包含表格和圖表說明）

回傳 JSON 格式：
{
  "reportName": "報表名稱",
  "reportContent": "報表內容（Markdown 格式）"
}`;
      break;

    case 'analysis':
      systemPrompt = '你是一個專業的團隊管理顧問，擅長深度分析團隊績效和工作模式。';
      userPrompt = `請根據以下數據產生 ${startDate} 至 ${endDate} 的週報分析報表：

[數據同上...]

請提供：
1. 報表名稱（20字以內）
2. 深度分析報表（包含：工作模式分析、效率評估、團隊協作狀況、問題識別、改善建議等，使用 Markdown 格式）

回傳 JSON 格式：
{
  "reportName": "報表名稱",
  "reportContent": "報表內容（Markdown 格式）"
}`;
      break;

    case 'burndown':
      systemPrompt = '你是一個敏捷項目管理專家，擅長燃盡圖分析。';
      userPrompt = `請根據以下數據產生 ${startDate} 至 ${endDate} 的燃盡圖報表：

[數據同上...]

請提供：
1. 報表名稱（20字以內）
2. 燃盡圖分析報表（包含：每日剩餘工作量、完成趨勢、預計完成日期、風險評估等，使用 Markdown 格式）

回傳 JSON 格式：
{
  "reportName": "報表名稱",
  "reportContent": "報表內容（Markdown 格式）"
}`;
      break;

    case 'productivity':
      systemPrompt = '你是一個生產力分析專家，擅長評估團隊和個人的工作效率。';
      userPrompt = `請根據以下數據產生 ${startDate} 至 ${endDate} 的生產力報告：

[數據同上...]

請提供：
1. 報表名稱（20字以內）
2. 生產力報告（包含：個人產出統計、效率指標、時間分配分析、生產力趨勢等，使用 Markdown 格式）

回傳 JSON 格式：
{
  "reportName": "報表名稱",
  "reportContent": "報表內容（Markdown 格式）"
}`;
      break;

    case 'task_distribution':
      systemPrompt = '你是一個資源配置專家，擅長分析任務分配的合理性。';
      userPrompt = `請根據以下數據產生 ${startDate} 至 ${endDate} 的任務分布報表：

## 團隊成員
${JSON.stringify(data.teamMembers, null, 2)}

## 工作項目及分配
${JSON.stringify(data.workItems.map((item: any) => ({
  標題: item.ai_title || item.content.substring(0, 50),
  主要處理人: item.handlers?.primary?.display_name || '未指定',
  共同處理人: item.handlers?.co_handlers?.map((h: any) => h.display_name).join(', ') || '無',
  優先級: item.priority || 3,
  狀態: item.current_status
})), null, 2)}

請提供：
1. 報表名稱（20字以內）
2. 任務分布報表（包含：成員工作量統計、任務分配均衡度、優先級分布、協作模式分析、重新分配建議等，使用 Markdown 格式）

回傳 JSON 格式：
{
  "reportName": "報表名稱",
  "reportContent": "報表內容（Markdown 格式）"
}`;
      break;
  }

  try {
    const response = await axios.post(
      `${config.apiUrl}/chat/completions`,
      {
        model: config.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 8000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    
    // 嘗試解析 JSON
    try {
      // 移除可能的 markdown 代碼塊標記
      let cleanResponse = aiResponse.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/```\s*/g, '');
      }
      
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        
        // 確保返回的是字串，而不是物件
        if (result.reportName && result.reportContent) {
          return {
            reportName: result.reportName,
            reportContent: result.reportContent
          };
        }
      }
    } catch (e) {
      console.error('Failed to parse AI report response as JSON:', e);
      console.error('AI Response:', aiResponse);
    }

    // Fallback：如果無法解析，直接使用 AI 回應作為內容
    return {
      reportName: `週報 ${startDate} - ${endDate}`,
      reportContent: aiResponse
    };
  } catch (error) {
    console.error('AI report generation error:', error);
    throw new Error('AI 報表生成失敗');
  }
};

// 產生週報
export const generateWeeklyReport = async (params: WeeklyReportParams) => {
  const { teamId, startDate, endDate, reportType, userId } = params;

  try {
    // 1. 收集數據
    const data = await collectWeeklyData(teamId, startDate, endDate);

    // 2. AI 產生報表
    const { reportName, reportContent } = await generateReportWithAI(
      reportType,
      data,
      startDate,
      endDate
    );

    // 3. 儲存到資料庫
    const result = await query(
      `INSERT INTO weekly_reports (team_id, report_name, report_type, start_date, end_date, report_content, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [teamId, reportName, reportType, startDate, endDate, reportContent, userId]
    );

    return {
      id: result.rows[0].id,
      reportName,
      reportType,
      startDate,
      endDate,
      reportContent,
      createdAt: new Date()
    };
  } catch (error) {
    console.error('Generate weekly report error:', error);
    throw error;
  }
};

// 重新產生週報
export const regenerateWeeklyReport = async (reportId: number, teamId: number, userId: number) => {
  try {
    // 1. 取得原有報表資訊
    const existingReport = await getWeeklyReportById(reportId, teamId);
    if (!existingReport) {
      throw new Error('找不到該報表');
    }

    // 2. 重新收集數據並產生報表
    const data = await collectWeeklyData(teamId, existingReport.start_date, existingReport.end_date);
    const { reportName, reportContent } = await generateReportWithAI(
      existingReport.report_type,
      data,
      existingReport.start_date,
      existingReport.end_date
    );

    // 3. 更新資料庫
    await query(
      `UPDATE weekly_reports 
       SET report_name = $1, report_content = $2, generated_by = $3, updated_at = NOW()
       WHERE id = $4 AND team_id = $5`,
      [reportName, reportContent, userId, reportId, teamId]
    );

    return {
      id: reportId,
      reportName,
      reportType: existingReport.report_type,
      startDate: existingReport.start_date,
      endDate: existingReport.end_date,
      reportContent,
      updatedAt: new Date()
    };
  } catch (error) {
    console.error('Regenerate weekly report error:', error);
    throw error;
  }
};

// 刪除週報
export const deleteWeeklyReport = async (reportId: number, teamId: number) => {
  try {
    const result = await query(
      `DELETE FROM weekly_reports WHERE id = $1 AND team_id = $2 RETURNING id`,
      [reportId, teamId]
    );

    if (result.rows.length === 0) {
      throw new Error('找不到該報表或無權限刪除');
    }

    return { success: true, id: reportId };
  } catch (error) {
    console.error('Delete weekly report error:', error);
    throw error;
  }
};
