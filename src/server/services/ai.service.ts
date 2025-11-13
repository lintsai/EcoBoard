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

// AI 對話功能 - 增強版：生成標題和摘要
export const chat = async (
  userMessage: string,
  userId: number,
  sessionId?: string,
  context?: any
) => {
  const config = getVLLMConfig();
  const newSessionId = sessionId || `session_${Date.now()}_${userId}`;
  
  // Save user message
  await query(
    `INSERT INTO chat_messages (user_id, session_id, message_type, content)
     VALUES ($1, $2, 'user', $3)`,
    [userId, newSessionId, userMessage]
  );

  // Get conversation history
  const history = await query(
    `SELECT content, ai_response, message_type FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [newSessionId]
  );

  // Build messages for AI
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一個協助團隊工作管理的 AI 助手。你的任務是：
1. 幫助使用者清楚地描述他們的工作項目
2. 詢問必要的細節（如優先級、預計時間、依賴關係等）
3. 將對話整理成結構化的工作項目
4. 使用繁體中文回答

請以友善、專業的方式引導使用者，確保收集到足夠的資訊。${context ? '\n\n當前上下文：' + JSON.stringify(context) : ''}`
    }
  ];

  // Add history (reverse order)
  for (let i = history.rows.length - 1; i >= 0; i--) {
    const msg = history.rows[i];
    if (msg.message_type === 'user') {
      messages.push({ role: 'user', content: msg.content });
      if (msg.ai_response) {
        messages.push({ role: 'assistant', content: msg.ai_response });
      }
    }
  }

  // Call vLLM API
  try {
    const response = await axios.post(
      `${config.apiUrl}/chat/completions`,
      {
        model: config.modelName,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000  // 增加到 1000，避免回應被截斷
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;

    // Save AI response
    await query(
      `UPDATE chat_messages 
       SET ai_response = $1
       WHERE user_id = $2 AND session_id = $3 AND content = $4 AND ai_response IS NULL`,
      [aiResponse, userId, newSessionId, userMessage]
    );

    return {
      sessionId: newSessionId,
      response: aiResponse,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('vLLM API error:', error);
    throw new Error('AI 服務暫時無法使用');
  }
};

// 生成工作項目標題和摘要
export const generateWorkItemSummary = async (sessionId: string, userId: number) => {
  const config = getVLLMConfig();
  console.log('[AI Service] Generating summary for session:', sessionId, 'user:', userId);
  
  // Get all conversation from this session
  // Note: Only filter by session_id, not user_id, to allow loading conversation history
  // even if the work item is being edited by a different user or reassigned
  const history = await query(
    `SELECT content, ai_response FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at ASC`,
    [sessionId]
  );

  console.log('[AI Service] Found', history.rows.length, 'chat messages for session');

  if (history.rows.length === 0) {
    console.warn('[AI Service] No chat history found for session:', sessionId);
    return {
      title: '未命名工作項目',
      summary: '無對話記錄'
    };
  }

  // Build conversation text
  const conversation = history.rows
    .map(msg => `使用者: ${msg.content}\nAI: ${msg.ai_response || '(無回應)'}`)
    .join('\n\n');

  const prompt = `請根據以下對話，生成一個清晰簡潔的工作項目標題和詳細摘要。

對話內容：
${conversation}

請以 JSON 格式返回，包含以下欄位：
{
  "title": "工作項目標題（簡潔，不超過50字）",
  "summary": "工作項目詳細摘要（包含重點、目標、預計時間等，使用 Markdown 格式）"
}

要求：
- 標題要精準概括工作內容
- 摘要要包含所有討論的重要細節
- 使用繁體中文
- 摘要可使用 Markdown 格式（如列表、表格、粗體等）`;

  try {
    const response = await axios.post(
      `${config.apiUrl}/chat/completions`,
      {
        model: config.modelName,
        messages: [
          { role: 'system', content: '你是一個專業的項目管理 AI 助手，擅長整理和總結工作項目。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 4000  // 增加到 4000，確保複雜項目的完整摘要不被截斷
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    
    // Try to parse JSON from response
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          title: result.title || '未命名工作項目',
          summary: result.summary || conversation.substring(0, 500)
        };
      }
    } catch (e) {
      console.error('Failed to parse AI summary response as JSON:', e);
      console.error('AI Response:', aiResponse);
    }

    // Fallback: use first user message as title
    return {
      title: history.rows[0]?.content.substring(0, 50) || '未命名工作項目',
      summary: aiResponse || conversation.substring(0, 500)
    };
  } catch (error) {
    console.error('AI work item summary generation error:', error);
    // Fallback
    return {
      title: history.rows[0]?.content.substring(0, 50) || '未命名工作項目',
      summary: conversation.substring(0, 500)
    };
  }
};

// AI 分析工作項目
export const analyzeWorkItems = async (workItems: any[], teamId: number) => {
  const config = getVLLMConfig();
  // 統計每個成員的工作量（包含主要處理人和共同處理人）
  const memberWorkload = workItems.reduce((acc: any, item) => {
    // 主要處理人
    const primaryUserId = item.handlers?.primary?.user_id || item.user_id;
    const primaryKey = primaryUserId;
    if (!acc[primaryKey]) {
      acc[primaryKey] = {
        userId: primaryUserId,
        username: item.handlers?.primary?.username || item.username,
        displayName: item.handlers?.primary?.display_name || item.display_name,
        primaryCount: 0,
        coHandlerCount: 0,
        primaryItems: [],
        coHandlerItems: []
      };
    }
    acc[primaryKey].primaryCount++;
    acc[primaryKey].primaryItems.push(item.ai_title || item.content);
    
    // 共同處理人
    if (item.handlers?.co_handlers && item.handlers.co_handlers.length > 0) {
      item.handlers.co_handlers.forEach((coHandler: any) => {
        const coKey = coHandler.user_id;
        if (!acc[coKey]) {
          acc[coKey] = {
            userId: coHandler.user_id,
            username: coHandler.username,
            displayName: coHandler.display_name,
            primaryCount: 0,
            coHandlerCount: 0,
            primaryItems: [],
            coHandlerItems: []
          };
        }
        acc[coKey].coHandlerCount++;
        acc[coKey].coHandlerItems.push(item.ai_title || item.content);
      });
    }
    
    return acc;
  }, {});

  const workloadSummary = Object.values(memberWorkload);

  const prompt = `請分析以下團隊的工作分配狀況，提供工作負載分析和建議：

團隊工作分配（包含主要處理人和共同處理人）：
${JSON.stringify(workloadSummary, null, 2)}

註：
- primaryCount: 作為主要處理人的項目數
- coHandlerCount: 作為共同處理人的項目數
- 共同處理人雖然責任較輕，但也需要投入時間協作

請分析以下方面：
1. **工作負載均衡度**：評估團隊成員的工作量是否均衡（考慮主要處理和共同處理）
2. **潛在風險**：識別工作量過重或過輕的成員
3. **分配建議**：提供具體的工作重新分配建議
4. **團隊協作**：評估共同處理的協作模式，建議哪些工作可以協同完成

請用繁體中文回答，並以 JSON 格式返回結果，包含以下欄位：
{
  "workloadBalance": "工作負載均衡度評估（高/中/低）",
  "overloadedMembers": ["工作量過重的成員"],
  "underloadedMembers": ["工作量較輕的成員"],
  "redistributionSuggestions": [{"from": "成員A", "to": "成員B", "task": "任務", "reason": "原因"}],
  "collaborationOpportunities": ["協作建議"],
  "summary": "整體分析總結"
}`;

  try {
    const response = await axios.post(
      `${config.apiUrl}/chat/completions`,
      {
        model: config.modelName,
        messages: [
          { role: 'system', content: '你是一個專業的項目管理 AI 助手，擅長分析團隊工作分配並提供優化建議。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 2000  // 增加到 2000，確保複雜 JSON 完整
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    
    // Try to parse JSON from response
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedResult = JSON.parse(jsonMatch[0]);
        
        // Format as markdown analysis text
        let analysisText = `## 📊 團隊工作分配分析\n\n`;
        
        // 工作負載統計
        analysisText += `### 📈 當前工作負載\n\n`;
        analysisText += `| 成員 | 主要處理 | 共同處理 | 總計 | 負載狀態 |\n`;
        analysisText += `|------|----------|----------|------|----------|\n`;
        
        const totalWorkItems = workItems.length;
        const memberCount = Object.keys(memberWorkload).length;
        const avgWorkload = totalWorkItems / memberCount;
        
        Object.values(memberWorkload as any).forEach((member: any) => {
          // 計算總負載（主要處理權重為1，共同處理權重為0.5）
          const totalLoad = member.primaryCount + (member.coHandlerCount * 0.5);
          const loadStatus = totalLoad > avgWorkload * 1.3 ? '🔴 偏重' : 
                           totalLoad < avgWorkload * 0.7 ? '🟢 偏輕' : '🟡 適中';
          analysisText += `| ${member.displayName || member.username} | ${member.primaryCount} 項 | ${member.coHandlerCount} 項 | ${totalLoad.toFixed(1)} | ${loadStatus} |\n`;
        });
        analysisText += `\n平均負載：${avgWorkload.toFixed(1)} 項/人（共同處理以0.5權重計算）\n\n`;
        
        // 負載均衡評估
        if (parsedResult.workloadBalance) {
          analysisText += `### ⚖️ 負載均衡度\n`;
          const balanceEmoji = parsedResult.workloadBalance === '高' ? '✅' : 
                              parsedResult.workloadBalance === '中' ? '⚠️' : '❌';
          analysisText += `${balanceEmoji} **${parsedResult.workloadBalance}**\n\n`;
        }
        
        // 工作量異常成員
        if (parsedResult.overloadedMembers && parsedResult.overloadedMembers.length > 0) {
          analysisText += `### 🔴 工作量偏重成員\n`;
          parsedResult.overloadedMembers.forEach((member: string) => {
            analysisText += `- ${member}\n`;
          });
          analysisText += `\n`;
        }
        
        if (parsedResult.underloadedMembers && parsedResult.underloadedMembers.length > 0) {
          analysisText += `### 🟢 工作量偏輕成員\n`;
          parsedResult.underloadedMembers.forEach((member: string) => {
            analysisText += `- ${member}\n`;
          });
          analysisText += `\n`;
        }
        
        // 重新分配建議
        if (parsedResult.redistributionSuggestions && parsedResult.redistributionSuggestions.length > 0) {
          analysisText += `### � 工作重新分配建議\n\n`;
          analysisText += `| 從 | 到 | 建議任務 | 原因 |\n`;
          analysisText += `|-----|-----|----------|------|\n`;
          parsedResult.redistributionSuggestions.forEach((s: any) => {
            analysisText += `| ${s.from} | ➡️ ${s.to} | ${s.task} | ${s.reason} |\n`;
          });
          analysisText += `\n`;
        }
        
        // 協作機會
        if (parsedResult.collaborationOpportunities && parsedResult.collaborationOpportunities.length > 0) {
          analysisText += `### 🤝 團隊協作建議\n`;
          parsedResult.collaborationOpportunities.forEach((opp: string, index: number) => {
            analysisText += `${index + 1}. ${opp}\n`;
          });
          analysisText += `\n`;
        }
        
        // 總結
        if (parsedResult.summary) {
          analysisText += `### 📝 總結\n${parsedResult.summary}\n`;
        }
        
        return {
          analysis: analysisText,
          data: parsedResult
        };
      }
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', e);
      console.error('AI Response:', aiResponse);
    }

    return {
      analysis: aiResponse,
      data: {
        summary: aiResponse,
        workloadBalance: '未知',
        overloadedMembers: [],
        underloadedMembers: [],
        redistributionSuggestions: [],
        collaborationOpportunities: []
      }
    };
  } catch (error) {
    console.error('AI analysis error:', error);
    throw new Error('AI 分析失敗');
  }
};

// AI 智能分配任務
export const distributeTasksToTeam = async (
  workItems: any[],
  teamMembers: any[],
  teamId: number
) => {
  const config = getVLLMConfig();
  const prompt = `請根據以下工作項目和團隊成員，智能分配任務並提供執行順序建議。

工作項目：
${JSON.stringify(workItems, null, 2)}

團隊成員：
${JSON.stringify(teamMembers.map(m => ({ id: m.id, name: m.display_name, role: m.role })), null, 2)}

請考慮：
1. 任務的依賴關係和優先級
2. 合理的工作量分配
3. 任務的執行順序
4. 成員的角色

請用繁體中文回答，並以 JSON 格式返回，包含以下欄位：
{
  "distribution": [
    {
      "userId": 使用者ID,
      "userName": "使用者名稱",
      "tasks": ["任務1", "任務2"],
      "estimatedWorkload": "high/medium/low"
    }
  ],
  "executionOrder": [
    {
      "step": 1,
      "tasks": ["任務描述"],
      "assignees": ["成員名稱"],
      "reason": "執行順序原因"
    }
  ],
  "recommendations": ["建議1", "建議2"]
}`;

  try {
    const response = await axios.post(
      `${config.apiUrl}/chat/completions`,
      {
        model: config.modelName,
        messages: [
          { role: 'system', content: '你是一個專業的項目管理 AI 助手，擅長任務分配和規劃。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 2500  // 增加到 2500，確保複雜分配 JSON 完整
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        }
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    
    // Try to parse JSON from response
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', e);
      console.error('AI Response:', aiResponse);
    }

    return {
      distribution: [],
      executionOrder: [],
      recommendations: [aiResponse]
    };
  } catch (error) {
    console.error('AI distribution error:', error);
    throw new Error('AI 任務分配失敗');
  }
};

// 產生每日總結（帶緩存）
export const generateDailySummary = async (
  teamId: number,
  summaryDate: string,
  userId: number,
  forceRegenerate: boolean = false
) => {
  const config = getVLLMConfig();
  // Check if summary already exists (unless force regenerate)
  if (!forceRegenerate) {
    const existing = await query(
      `SELECT id, summary_content, created_at
       FROM daily_summaries
       WHERE team_id = $1 AND summary_date = $2`,
      [teamId, summaryDate]
    );

    if (existing.rows.length > 0) {
      return {
        summary: existing.rows[0].summary_content,
        date: summaryDate,
        teamId,
        cached: true,
        createdAt: existing.rows[0].created_at
      };
    }
  }

  // Get work items with current status
  // 包含：1) 今日建立的項目 2) 今日有更新記錄的所有項目（不論何時建立）
  const workItems = await query(
    `SELECT DISTINCT wi.*, u.display_name, u.username, c.checkin_date,
            COALESCE(latest_update.progress_status, 'in_progress') as current_status,
            latest_update.updated_at as last_update_time,
            CASE 
              WHEN c.checkin_date = $2 THEN true 
              ELSE false 
            END as created_today
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
       AND (
         c.checkin_date = $2  -- 今日建立的項目
         OR EXISTS (  -- 或今日有更新記錄的項目
           SELECT 1 FROM work_updates wu
           WHERE wu.work_item_id = wi.id
             AND DATE(wu.updated_at) = $2
         )
       )
     ORDER BY u.display_name, c.checkin_date DESC, wi.created_at`,
    [teamId, summaryDate]
  );

  // 獲取所有工作項目的處理人資訊
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
  
  // 附加處理人資訊到工作項目
  workItems.rows.forEach((item: any) => {
    item.handlers = handlersMap[item.id] || { primary: null, co_handlers: [] };
  });

  // Get all work updates with status progression
  // 只查詢今日的更新記錄（但項目可能是之前建立的）
  const updates = await query(
    `SELECT wu.*, wi.content as work_item_content, 
            wi.ai_title as work_item_title,
            u.display_name, u.username,
            c.checkin_date as item_created_date
     FROM work_updates wu
     INNER JOIN work_items wi ON wu.work_item_id = wi.id
     INNER JOIN users u ON wu.user_id = u.id
     INNER JOIN checkins c ON wi.checkin_id = c.id
     WHERE c.team_id = $1 AND DATE(wu.updated_at) = $2
     ORDER BY wu.updated_at ASC`,
    [teamId, summaryDate]
  );

  // Get checkin summary
  const checkinStats = await query(
    `SELECT COUNT(DISTINCT c.user_id) as checkin_count,
            COUNT(DISTINCT wi.id) as total_work_items,
            COUNT(DISTINCT wu.id) as total_updates
     FROM checkins c
     LEFT JOIN work_items wi ON wi.checkin_id = c.id
     LEFT JOIN work_updates wu ON wu.work_item_id = wi.id
     WHERE c.team_id = $1 AND c.checkin_date = $2`,
    [teamId, summaryDate]
  );

  const stats = checkinStats.rows[0];

  const prompt = `請根據以下資訊產生 ${summaryDate} 的團隊工作總結：

## 團隊基本數據
- 打卡人數：${stats.checkin_count}
- 工作項目總數：${stats.total_work_items}
- 更新記錄數：${stats.total_updates}

## 工作項目及狀態
${JSON.stringify(workItems.rows.map((item: any) => ({
  建立者: item.display_name || item.username,
  主要處理人: item.handlers?.primary ? 
    (item.handlers.primary.display_name || item.handlers.primary.username) : 
    '未指定',
  共同處理人: item.handlers?.co_handlers?.length > 0 ? 
    item.handlers.co_handlers.map((h: any) => h.display_name || h.username).join(', ') : 
    '無',
  項目: item.ai_title || item.content.substring(0, 100),
  建立日期: item.checkin_date,
  是否今日新建: item.created_today ? '是' : '否（跨日期追蹤）',
  當前狀態: item.current_status,
  最後更新時間: item.last_update_time
})), null, 2)}

## 今日工作更新記錄（時間順序）
${JSON.stringify(updates.rows.map((update: any) => ({
  成員: update.display_name || update.username,
  工作項目: update.work_item_title || update.work_item_content.substring(0, 50),
  項目建立日期: update.item_created_date,
  更新時間: update.updated_at,
  進度狀態: update.progress_status,
  更新內容: update.update_content
})), null, 2)}

請提供專業的工作總結報告，包含：

1. **每日概況** - 簡述今日整體工作情況和團隊參與度
2. **完成項目總覽** - 列出已完成（completed）的工作項目，按主要處理人分組。如有共同處理人，也要列出。特別標註跨日期完成的項目
3. **進行中項目** - 列出進行中（in_progress）的項目及進度說明，包含主要處理人和共同處理人
4. **遇到的問題** - 分析受阻（blocked）、已取消（cancelled）或未開始（not_started）的項目，並說明原因
5. **跨日期項目追蹤** - 特別關注並總結那些非今日建立但今日有更新的項目（表示持續追蹤中）
6. **團隊協作情況** - 評估有共同處理人的項目執行情況，協作是否順暢
7. **進度評估** - 評估整體進度是否符合預期，有哪些亮點和需要關注的地方
8. **明日建議** - 根據今日狀況，提出明天的工作重點和待辦事項

請使用 Markdown 格式撰寫，可以使用表格整理數據，文字專業且易讀，適合在團隊站立會議中分享。
注意：當分析工作項目時，請同時考慮主要處理人和共同處理人的貢獻。`;

  try {
    const response = await axios.post(
      `${config.apiUrl}/chat/completions`,
      {
        model: config.modelName,
        messages: [
          { role: 'system', content: '你是一個專業的敏捷開發團隊管理 AI 助手，擅長撰寫清晰、有洞察力的工作總結報告。你會分析工作狀態、進度變化，並提供有建設性的建議。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 3000  // 增加到 3000，確保完整的每日總結
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        }
      }
    );

    const summary = response.data.choices[0].message.content;

    // Save or update summary in database (不在這裡自動儲存，交由前端決定)
    // 如果是強制重新生成，不自動儲存
    if (!forceRegenerate) {
      await query(
        `INSERT INTO daily_summaries (team_id, summary_date, summary_content, generated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (team_id, summary_date) 
         DO UPDATE SET summary_content = EXCLUDED.summary_content, generated_by = EXCLUDED.generated_by`,
        [teamId, summaryDate, summary, userId]
      );
    }

    return {
      summary,
      date: summaryDate,
      teamId,
      cached: false,
      createdAt: new Date()
    };
  } catch (error) {
    console.error('AI summary generation error:', error);
    throw new Error('AI 總結產生失敗');
  }
};

// 取得歷史每日總結
export const getDailySummaryHistory = async (
  teamId: number,
  limit: number = 30
) => {
  try {
    const result = await query(
      `SELECT ds.id, ds.team_id, ds.summary_date, ds.summary_content, ds.created_at,
              u.display_name as generated_by_name
       FROM daily_summaries ds
       LEFT JOIN users u ON ds.generated_by = u.id
       WHERE ds.team_id = $1
       ORDER BY ds.summary_date DESC
       LIMIT $2`,
      [teamId, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Get summary history error:', error);
    throw new Error('取得歷史總結失敗');
  }
};

// 儲存每日總結
export const saveDailySummary = async (
  teamId: number,
  summaryDate: string,
  summaryContent: string,
  userId: number
) => {
  try {
    // 檢查是否已存在該日期的總結
    const existingResult = await query(
      `SELECT id FROM daily_summaries 
       WHERE team_id = $1 AND summary_date = $2`,
      [teamId, summaryDate]
    );

    if (existingResult.rows.length > 0) {
      // 更新現有總結
      await query(
        `UPDATE daily_summaries 
         SET summary_content = $1, generated_by = $2, created_at = NOW()
         WHERE team_id = $3 AND summary_date = $4`,
        [summaryContent, userId, teamId, summaryDate]
      );
    } else {
      // 插入新總結
      await query(
        `INSERT INTO daily_summaries (team_id, summary_date, summary_content, generated_by)
         VALUES ($1, $2, $3, $4)`,
        [teamId, summaryDate, summaryContent, userId]
      );
    }

    return { 
      success: true, 
      message: '總結已儲存',
      teamId,
      summaryDate
    };
  } catch (error) {
    console.error('Save daily summary error:', error);
    throw new Error('儲存每日總結失敗');
  }
};

// 取得特定日期的每日總結
export const getDailySummaryByDate = async (
  teamId: number,
  summaryDate: string
) => {
  try {
    const result = await query(
      `SELECT ds.id, ds.team_id, ds.summary_date, ds.summary_content, ds.created_at,
              u.display_name as generated_by_name
       FROM daily_summaries ds
       LEFT JOIN users u ON ds.generated_by = u.id
       WHERE ds.team_id = $1 AND ds.summary_date = $2`,
      [teamId, summaryDate]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Get summary by date error:', error);
    throw new Error('取得總結失敗');
  }
};

// 取得聊天歷史記錄
export const getChatHistory = async (sessionId: string) => {
  try {
    const result = await query(
      `SELECT id, content, ai_response, message_type, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    return result.rows;
  } catch (error) {
    console.error('Get chat history error:', error);
    throw new Error('取得聊天記錄失敗');
  }
};
