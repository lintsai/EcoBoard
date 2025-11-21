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

interface ProductivitySummary {
  totalMembers: number;
  totalWorkItems: number;
  totalUpdates: number;
  completedItems: number;
  completionRate: number;
  avgUpdatesPerItem: number;
}

interface ProductivityMemberMetric {
  memberId: number;
  member: string;
  username: string;
  ownedItems: number;
  completedItems: number;
  activeItems: number;
  blockedItems: number;
  updatesAuthored: number;
  completionRate: number;
  avgUpdatesPerItem: number;
  focusScore: number;
  lastUpdate: string | null;
}

interface ProductivityRecentUpdate {
  member: string;
  workItem: string;
  status: string;
  updatedAt: string;
}

interface ProductivityMetrics {
  summary: ProductivitySummary;
  memberMetrics: ProductivityMemberMetric[];
  workloadBalance: Array<{
    member: string;
    ownedItems: number;
    activeItems: number;
    blockedItems: number;
  }>;
  recentUpdates: ProductivityRecentUpdate[];
}

interface BurndownTimelineEntry {
  date: string;
  plannedRemaining: number;
  actualRemaining: number;
  completedToday: number;
  completedToDate: number;
}

interface BurndownData {
  totalWorkItems: number;
  totalCompleted: number;
  completionRate: number;
  timeline: BurndownTimelineEntry[];
  scopeChanges: Array<{ date: string; newItems: number }>;
}

const formatDateOnly = (value: string | Date) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isMemberOwner = (item: any, memberId: number) => {
  if (!item) return false;
  if (item.user_id === memberId) return true;
  if (item.handlers?.primary?.user_id === memberId) return true;
  return (item.handlers?.co_handlers || []).some((handler: any) => handler.user_id === memberId);
};

const summarizeWorkItemsForPrompt = (items: any[]) => {
  const isOverdue = (item: any) => {
    if (!item.estimated_date || ['completed', 'cancelled'].includes(item.current_status || '')) {
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const itemDate = new Date(item.estimated_date);
    return itemDate < today;
  };

  return items.map((item: any) => ({
    id: item.id,
    title: `#${item.id} ${item.ai_title || (item.content ? String(item.content).substring(0, 80) : '未命名工作項目')}`,
    owner: item.handlers?.primary?.display_name || item.display_name || '未指派',
    coOwners: (item.handlers?.co_handlers || []).map((handler: any) => handler.display_name),
    priority: item.priority || 3,
    status: item.current_status,
    createdDate: item.checkin_date,
    estimatedDate: item.estimated_date,
    isOverdue: isOverdue(item),
    lastUpdateTime: item.last_update_time
  }));
};

const summarizeUpdatesForPrompt = (updates: any[]) => {
  return updates.map((update: any) => ({
    member: update.display_name,
    workItem:
      update.work_item_title ||
      (update.work_item_content ? String(update.work_item_content).substring(0, 80) : '未命名工作項目'),
    status: update.progress_status || 'in_progress',
    updatedAt: update.updated_at
  }));
};

const buildProductivityMetrics = (data: any): ProductivityMetrics => {
  const ownershipMap = new Map<number, any[]>();
  data.workItems.forEach((item: any) => {
    const owners = new Set<number>();
    if (item.user_id) owners.add(item.user_id);
    if (item.handlers?.primary?.user_id) owners.add(item.handlers.primary.user_id);
    (item.handlers?.co_handlers || []).forEach((handler: any) => owners.add(handler.user_id));
    owners.forEach((ownerId) => {
      if (!ownershipMap.has(ownerId)) {
        ownershipMap.set(ownerId, []);
      }
      ownershipMap.get(ownerId)!.push(item);
    });
  });

  const updatesByUser = new Map<number, any[]>();
  data.updates.forEach((update: any) => {
    if (!updatesByUser.has(update.user_id)) {
      updatesByUser.set(update.user_id, []);
    }
    updatesByUser.get(update.user_id)!.push(update);
  });

  const totalWorkItems = data.workItems.length;
  const completedItems = data.workItems.filter((item: any) => item.current_status === 'completed').length;

  const memberMetrics: ProductivityMemberMetric[] = data.teamMembers.map((member: any) => {
    const ownedItems = ownershipMap.get(member.id) || [];
    const completed = ownedItems.filter((item: any) => item.current_status === 'completed').length;
    const blocked = ownedItems.filter((item: any) => item.current_status === 'blocked').length;
    const active = ownedItems.filter(
      (item: any) => !['completed', 'cancelled'].includes(item.current_status)
    ).length;
    const memberUpdates = updatesByUser.get(member.id) || [];
    const denominator = ownedItems.length || 1;
    const fallbackDenominator = Math.max(totalWorkItems, 1);
    const focusNumerator = completed * 2 + memberUpdates.length - blocked;
    const computedFocus = ownedItems.length
      ? focusNumerator / denominator
      : memberUpdates.length / fallbackDenominator;
    const focusScore = Number(computedFocus.toFixed(2));

    const lastUpdate = memberUpdates.reduce<string | null>((latest, update) => {
      if (!latest) return update.updated_at;
      return new Date(update.updated_at) > new Date(latest) ? update.updated_at : latest;
    }, null);

    return {
      memberId: member.id,
      member: member.display_name,
      username: member.username,
      ownedItems: ownedItems.length,
      completedItems: completed,
      activeItems: active,
      blockedItems: blocked,
      updatesAuthored: memberUpdates.length,
      completionRate: ownedItems.length ? Number(((completed / denominator) * 100).toFixed(1)) : 0,
      avgUpdatesPerItem: ownedItems.length ? Number((memberUpdates.length / denominator).toFixed(2)) : 0,
      focusScore,
      lastUpdate: lastUpdate ? formatDateOnly(lastUpdate) : null
    };
  });

  const summary: ProductivitySummary = {
    totalMembers: data.teamMembers.length,
    totalWorkItems,
    totalUpdates: data.updates.length,
    completedItems,
    completionRate: totalWorkItems ? Number(((completedItems / totalWorkItems) * 100).toFixed(1)) : 0,
    avgUpdatesPerItem: totalWorkItems ? Number((data.updates.length / totalWorkItems).toFixed(2)) : 0
  };

  const workloadBalance = memberMetrics.map((metric) => ({
    member: metric.member,
    ownedItems: metric.ownedItems,
    activeItems: metric.activeItems,
    blockedItems: metric.blockedItems
  }));

  const recentUpdates: ProductivityRecentUpdate[] = [...data.updates]
    .sort(
      (a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, 15)
    .map((update: any) => ({
      member: update.display_name,
      workItem:
        update.work_item_title ||
        (update.work_item_content ? String(update.work_item_content).substring(0, 80) : '未命名工作項目'),
      status: update.progress_status || 'in_progress',
      updatedAt: update.updated_at
    }));

  return {
    summary,
    memberMetrics,
    workloadBalance,
    recentUpdates
  };
};

const buildBurndownData = (data: any, startDate: string, endDate: string): BurndownData => {
  const completionDates = new Map<number, string>();
  data.updates.forEach((update: any) => {
    if (update.progress_status === 'completed') {
      completionDates.set(update.work_item_id, formatDateOnly(update.updated_at));
    }
  });

  data.workItems.forEach((item: any) => {
    if (item.current_status === 'completed' && !completionDates.has(item.id)) {
      const fallbackDate = item.last_update_time || item.checkin_date || endDate;
      completionDates.set(item.id, formatDateOnly(fallbackDate));
    }
  });

  const createdByDate: Record<string, number> = {};
  data.workItems.forEach((item: any) => {
    const created = formatDateOnly(item.checkin_date);
    if (!created) return;
    createdByDate[created] = (createdByDate[created] || 0) + 1;
  });

  const completedByDate: Record<string, number> = {};
  completionDates.forEach((date) => {
    if (!date) return;
    completedByDate[date] = (completedByDate[date] || 0) + 1;
  });

  const start = new Date(startDate);
  const end = new Date(endDate);
  const days: string[] = [];

  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push(formatDateOnly(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  if (days.length === 0) {
    days.push(formatDateOnly(startDate || new Date()));
  }

  const totalWorkItems = data.workItems.length;
  const plannedStep = days.length > 1 ? totalWorkItems / (days.length - 1) : totalWorkItems;

  let cumulativeCompleted = 0;
  const timeline: BurndownTimelineEntry[] = days.map((date, index) => {
    const completedToday = completedByDate[date] || 0;
    cumulativeCompleted += completedToday;
    const actualRemaining = Math.max(totalWorkItems - cumulativeCompleted, 0);
    const plannedRemaining = Math.max(Math.round(totalWorkItems - plannedStep * index), 0);
    return {
      date,
      plannedRemaining,
      actualRemaining,
      completedToday,
      completedToDate: Math.min(cumulativeCompleted, totalWorkItems)
    };
  });

  const scopeChanges = days.map((date) => ({
    date,
    newItems: createdByDate[date] || 0
  }));

  return {
    totalWorkItems,
    totalCompleted: Math.min(cumulativeCompleted, totalWorkItems),
    completionRate: totalWorkItems ? Number(((cumulativeCompleted / totalWorkItems) * 100).toFixed(1)) : 0,
    timeline,
    scopeChanges
  };
};

const buildBurndownVisualizationMarkdown = (burndown: BurndownData) => {
  if (!burndown.timeline.length) {
    return '';
  }

  const width = 640;
  const height = 280;
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const maxValue =
    Math.max(...burndown.timeline.map((entry) => Math.max(entry.plannedRemaining, entry.actualRemaining)), 1) || 1;

  const getX = (index: number) => {
    if (burndown.timeline.length === 1) {
      return margin.left;
    }
    return margin.left + (index / (burndown.timeline.length - 1)) * chartWidth;
  };

  const getY = (value: number) => margin.top + chartHeight - (value / maxValue) * chartHeight;

  const plannedPath = burndown.timeline
    .map(
      (entry, index) =>
        `${index === 0 ? 'M' : 'L'} ${getX(index).toFixed(2)} ${getY(entry.plannedRemaining).toFixed(2)}`
    )
    .join(' ');

  const actualPath = burndown.timeline
    .map((entry, index) => `${index === 0 ? 'M' : 'L'} ${getX(index).toFixed(2)} ${getY(entry.actualRemaining).toFixed(2)}`)
    .join(' ');

  const yTicks = Array.from({ length: 5 }, (_, idx) => {
    const value = Math.round((maxValue / 4) * idx);
    const y = getY(value);
    return `<g>
      <line x1="${margin.left}" y1="${y.toFixed(2)}" x2="${width - margin.right}" y2="${y.toFixed(2)}" stroke="#e5e7eb" stroke-width="1" />
      <text x="${margin.left - 10}" y="${(y + 4).toFixed(2)}" text-anchor="end" font-size="10" fill="#6b7280">${value}</text>
    </g>`;
  }).join('');

  const xLabels = burndown.timeline
    .map((entry, index) => {
      const x = getX(index);
      return `<text x="${x.toFixed(2)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#6b7280">${entry.date.slice(
        5
      )}</text>`;
    })
    .join('');

  const svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="260" role="img" aria-label="燃盡圖">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="#e5e7eb"/>
    ${yTicks}
    ${xLabels}
    <path d="${plannedPath}" fill="none" stroke="#f97316" stroke-width="2" />
    <path d="${actualPath}" fill="none" stroke="#2563eb" stroke-width="2" />
  </svg>`;

  const tableRows = burndown.timeline
    .map(
      (entry) =>
        `| ${entry.date} | ${entry.plannedRemaining} | ${entry.actualRemaining} | ${entry.completedToday} | ${entry.completedToDate} |`
    )
    .join('\n');

  return `
### 燃盡圖視覺化

- 總工作項目數：${burndown.totalWorkItems}
- 已完成：${burndown.totalCompleted}
- 完成率：${burndown.completionRate.toFixed(1)}%

<div style="margin:16px 0;">
  ${svg}
</div>

| 日期 | 預期剩餘 | 實際剩餘 | 當日完成 | 累積完成 |
| --- | --- | --- | --- | --- |
${tableRows}
`;
};

const appendVisualization = (content: string, visualization: string) => {
  if (!visualization.trim()) {
    return content;
  }
  return `${content}\n\n${visualization}`;
};

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
  const workItemPromptData = summarizeWorkItemsForPrompt(data.workItems || []);
  const updatePromptData = summarizeUpdatesForPrompt(data.updates || []);
  let visualizationAppendix = '';

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

    case 'analysis': {

      const productivitySnapshot = buildProductivityMetrics(data);

      const recentUpdates = updatePromptData.slice(-40);

      systemPrompt = '你是一位資深的專案顧問，擅長根據真實工作紀錄提出洞察與風險評估。';

      userPrompt = `請根據以下數據產出 ${startDate} 至 ${endDate} 的週報分析報告：



## 核心統計

- 團隊成員數：${data.teamMembers.length}

- 工作項目數：${data.workItems.length}

- 更新紀錄數：${data.updates.length}



## 成員工作負載

${JSON.stringify(

  productivitySnapshot.memberMetrics.map((metric) => ({

    成員: metric.member,

    任務數量: metric.ownedItems,

    已完成: metric.completedItems,

    進行中: metric.activeItems,

    阻塞: metric.blockedItems

  })),

  null,

  2

)}



## 工作項目詳情

${JSON.stringify(workItemPromptData, null, 2)}



## 最近工作更新

${JSON.stringify(recentUpdates, null, 2)}



## 每日出勤統計

${JSON.stringify(data.dailyCheckins, null, 2)}



請提供：

1. 報表名稱（20 字以內）

2. 以 Markdown 呈現的分析報告，內容需包含：團隊優勢、風險與阻礙、負載過重成員、低產能成員，以及可立即執行的改進建議



需傳 JSON 物件：

{

  "reportName": "報表名稱",

  "reportContent": "報表內容（Markdown 格式）"

}`;

      break;

    }



    case 'burndown': {

      const burndownMetrics = buildBurndownData(data, startDate, endDate);

      systemPrompt = '你是一位敏捷專案管理專家，擅長以數據化方式解釋燃盡圖。';

      userPrompt = `請根據以下數據產出 ${startDate} 至 ${endDate} 的燃盡圖報告：



## 總覽

${JSON.stringify(

  {

    totalWorkItems: burndownMetrics.totalWorkItems,

    totalCompleted: burndownMetrics.totalCompleted,

    completionRate: `${burndownMetrics.completionRate}%`

  },

  null,

  2

)}



## 燃盡圖資料（Timeline）

${JSON.stringify(burndownMetrics.timeline, null, 2)}



## 工項新增情況

${JSON.stringify(burndownMetrics.scopeChanges, null, 2)}



## 工作項目詳情

${JSON.stringify(workItemPromptData, null, 2)}



請提供：

1. 報表名稱（20 字以內）

2. 燃盡圖分析（必須包含一個 Markdown 表格呈現 timeline 數據、風險與建議）

3. 對於落後或超前進度的解釋，以及下一步調整策略



需傳 JSON 物件：

{

  "reportName": "報表名稱",

  "reportContent": "報表內容（Markdown 格式）"

}`;

      visualizationAppendix = buildBurndownVisualizationMarkdown(burndownMetrics);

      break;

    }



    case 'productivity': {

      const productivityData = buildProductivityMetrics(data);

      systemPrompt = '你是一位團隊效率專家，擅長評估個人與整體產出表現。';

      userPrompt = `請根據以下真實數據產出 ${startDate} 至 ${endDate} 的生產力報告：



## 團隊生產力總覽

${JSON.stringify(productivityData.summary, null, 2)}



## 成員生產力指標

${JSON.stringify(productivityData.memberMetrics, null, 2)}



## 工作負載概況

${JSON.stringify(productivityData.workloadBalance, null, 2)}



## 最近工作更新

${JSON.stringify(productivityData.recentUpdates, null, 2)}



## 工作項目詳情

${JSON.stringify(workItemPromptData, null, 2)}



請提供：

1. 報表名稱（20 字以內）

2. 使用 Markdown 表格列出頂尖與需要協助的成員，並包含完成數、活躍工項、更新頻率等指標

3. 專注力 / 產能趨勢分析與下一步建議



需傳 JSON 物件：

{

  "reportName": "報表名稱",

  "reportContent": "報表內容（Markdown 格式）"

}`;

      break;

    }



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
        max_tokens: 12000
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
            reportContent: appendVisualization(result.reportContent, visualizationAppendix || '')
          };
        }
      }
    } catch (e) {
      console.error('Failed to parse AI report response as JSON:', e);
      console.error('AI Response:', aiResponse);
    }

    // Fallback：若無法解析 JSON，直接使用 AI 產出作為內容
    return {
      reportName: `週報 ${startDate} - ${endDate}`,
      reportContent: appendVisualization(aiResponse, visualizationAppendix || '')
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
