import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          const requestUrl = error.config?.url || '';
          const isLoginRequest = requestUrl.includes('/auth/login');

          if (!isLoginRequest) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');

            if (typeof window !== 'undefined') {
              const redirectTarget = window.location.pathname + window.location.search + window.location.hash;
              sessionStorage.setItem('postLoginRedirect', redirectTarget);
              window.location.href = '/login';
            }
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth
  async login(username: string, password: string) {
    const response = await this.api.post('/auth/login', { username, password });
    return response.data;
  }

  async verifyToken() {
    const response = await this.api.get('/auth/verify');
    return response.data;
  }

  // Teams
  async getTeams() {
    const response = await this.api.get('/teams');
    return response.data;
  }

  async getDiscoverableTeams() {
    const response = await this.api.get('/teams/discover');
    return response.data;
  }

  async searchUsers(searchTerm: string) {
    const response = await this.api.get('/teams/search-users', {
      params: { q: searchTerm }
    });
    return response.data;
  }

  async createTeam(name: string, description?: string) {
    const response = await this.api.post('/teams', { name, description });
    return response.data;
  }

  async getTeamMembers(teamId: number) {
    const response = await this.api.get(`/teams/${teamId}/members`);
    return response.data;
  }

  async addTeamMember(teamId: number, username: string) {
    const response = await this.api.post(`/teams/${teamId}/members`, { username });
    return response.data;
  }

  async updateTeam(teamId: number, data: { name?: string; description?: string }) {
    const response = await this.api.put(`/teams/${teamId}`, data);
    return response.data;
  }

  async deleteTeam(teamId: number) {
    const response = await this.api.delete(`/teams/${teamId}`);
    return response.data;
  }

  async removeTeamMember(teamId: number, userId: number) {
    const response = await this.api.delete(`/teams/${teamId}/members/${userId}`);
    return response.data;
  }

  async updateMemberRole(teamId: number, userId: number, role: string) {
    const response = await this.api.put(`/teams/${teamId}/members/${userId}/role`, { role });
    return response.data;
  }

  // Check-in
  async checkin(teamId: number) {
    const response = await this.api.post('/checkin', { teamId });
    return response.data;
  }

  async getTodayTeamCheckins(teamId: number) {
    const response = await this.api.get(`/checkin/team/${teamId}/today`);
    return response.data;
  }

  async getTodayUserCheckin(teamId: number) {
    const response = await this.api.get(`/checkin/today?teamId=${teamId}`);
    return response.data;
  }

  // Work Items
  async createWorkItem(checkinId: number, content: string, itemType?: string, sessionId?: string, aiSummary?: string, aiTitle?: string, priority?: number) {
    const response = await this.api.post('/workitems', { 
      checkinId, 
      content, 
      itemType,
      sessionId,
      aiSummary,
      aiTitle,
      priority
    });
    return response.data;
  }

  async getTodayWorkItems(teamId?: number) {
    const response = await this.api.get('/workitems/today', {
      params: { teamId },
    });
    return response.data;
  }

  async getIncompleteWorkItems(teamId?: number) {
    const response = await this.api.get('/workitems/incomplete', {
      params: { teamId },
    });
    return response.data;
  }

  async getTodayTeamWorkItems(teamId: number) {
    const response = await this.api.get(`/workitems/team/${teamId}/today`);
    return response.data;
  }

  async getIncompleteTeamWorkItems(teamId: number) {
    const response = await this.api.get(`/workitems/team/${teamId}/incomplete`);
    return response.data;
  }

  async createWorkUpdate(itemId: number, data: { updateContent: string; progressStatus?: string }) {
    const response = await this.api.post(`/workitems/${itemId}/updates`, data);
    return response.data;
  }

  async getWorkItemUpdates(itemId: number) {
    const response = await this.api.get(`/workitems/${itemId}/updates`);
    return response.data;
  }

  async updateWorkItem(itemId: number, data: { content?: string; aiSummary?: string; aiTitle?: string; priority?: number; sessionId?: string }) {
    const response = await this.api.put(`/workitems/${itemId}`, data);
    return response.data;
  }

  async reassignWorkItem(itemId: number, userId: number) {
    const response = await this.api.put(`/workitems/${itemId}/assign`, { userId });
    return response.data;
  }

  async moveWorkItemToToday(itemId: number) {
    const response = await this.api.put(`/workitems/${itemId}/move-to-today`);
    return response.data;
  }

  async moveWorkItemToBacklog(itemId: number) {
    const response = await this.api.put(`/workitems/${itemId}/move-to-backlog`);
    return response.data;
  }

  async deleteWorkItem(itemId: number) {
    const response = await this.api.delete(`/workitems/${itemId}`);
    return response.data;
  }

  async addCoHandler(itemId: number, userId: number) {
    const response = await this.api.post(`/workitems/${itemId}/co-handlers`, { userId });
    return response.data;
  }

  async removeCoHandler(itemId: number, userId: number) {
    const response = await this.api.delete(`/workitems/${itemId}/co-handlers/${userId}`);
    return response.data;
  }

  async getCompletedWorkHistory(params: {
    teamId?: number;
    startDate?: string;
    endDate?: string;
    keyword?: string;
    limit?: number;
    page?: number;
    status?: 'completed' | 'cancelled';
    sortBy?: 'completed_desc' | 'completed_asc' | 'id_desc' | 'id_asc';
  }) {
    const response = await this.api.get('/workitems/completed/history', {
      params
    });
    return response.data;
  }

  // AI
  async chat(message: string, sessionId?: string, context?: any) {
    const response = await this.api.post('/ai/chat', { message, sessionId, context });
    return response.data;
  }

  async analyzeWorkItems(teamId: number, workItems: any[]) {
    const response = await this.api.post('/ai/analyze-workitems', { teamId, workItems });
    return response.data;
  }

  async distributeTasks(teamId: number, workItems: any[], teamMembers: any[]) {
    const response = await this.api.post('/ai/distribute-tasks', {
      teamId,
      workItems,
      teamMembers,
    });
    return response.data;
  }

  async getTodayStandup(teamId: number) {
    const response = await this.api.get(`/ai/standup/team/${teamId}/today`);
    return response.data;
  }

  async completeStandupReview(teamId: number, standupId: number) {
    const response = await this.api.post('/ai/standup/review', { teamId, standupId });
    return response.data;
  }

  async generateDailySummary(teamId: number, summaryDate?: string, forceRegenerate: boolean = false) {
    const response = await this.api.post('/ai/daily-summary', { 
      teamId, 
      summaryDate,
      forceRegenerate 
    });
    return response.data;
  }

  async saveDailySummary(teamId: number, summaryDate: string, summaryContent: string) {
    const response = await this.api.post('/ai/daily-summary/save', { 
      teamId, 
      summaryDate, 
      summaryContent 
    });
    return response.data;
  }

  async getDailySummaryHistory(teamId: number, limit: number = 30) {
    const response = await this.api.get(`/ai/daily-summary/team/${teamId}/history`, {
      params: { limit }
    });
    return response.data;
  }

  async getDailySummaryByDate(teamId: number, date: string) {
    const response = await this.api.get(`/ai/daily-summary/team/${teamId}/date/${date}`);
    return response.data;
  }

  async getChatHistory(sessionId: string) {
    const response = await this.api.get(`/ai/chat/history/${sessionId}`);
    return response.data;
  }

  async generateWorkSummary(sessionId: string) {
    const response = await this.api.post('/ai/generate-work-summary', { sessionId });
    return response.data;
  }

  async regenerateDailySummary(teamId: number, summaryDate: string) {
    const response = await this.api.post('/ai/daily-summary', { teamId, summaryDate });
    return response.data;
  }

  // Backlog Items
  async createBacklogItem(teamId: number, title: string, content: string, priority?: number, estimatedDate?: string | null) {
    const response = await this.api.post('/backlog', { 
      teamId,
      title, 
      content, 
      priority, 
      estimatedDate 
    });
    return response.data;
  }

  async createBacklogItemsBatch(teamId: number, items: Array<{title: string; content: string; priority: number; estimatedDate?: string | null}>) {
    const response = await this.api.post('/backlog/batch', { teamId, items });
    return response.data;
  }

  async getUserBacklogItems(teamId?: number) {
    const response = await this.api.get('/backlog/my', {
      params: { teamId }
    });
    return response.data;
  }

  async getTeamBacklogItems(teamId: number) {
    const response = await this.api.get(`/backlog/team/${teamId}`);
    return response.data;
  }

  async updateBacklogItem(itemId: number, data: { title?: string; content?: string; priority?: number; estimatedDate?: string | null; teamId?: number }) {
    const response = await this.api.put(`/backlog/${itemId}`, data);
    return response.data;
  }

  async deleteBacklogItem(itemId: number) {
    const response = await this.api.delete(`/backlog/${itemId}`);
    return response.data;
  }

  async moveBacklogToWorkItem(backlogItemId: number, teamId: number) {
    const response = await this.api.post(`/backlog/${backlogItemId}/move-to-today`, { teamId });
    return response.data;
  }

  async parseTableToBacklogItems(tableText: string) {
    const response = await this.api.post('/ai/parse-table', { tableText });
    return response.data;
  }

  // Weekly Reports
  async getWeeklyReports(teamId: number, limit: number = 50) {
    const response = await this.api.get(`/weekly-reports/team/${teamId}`, {
      params: { limit }
    });
    return response.data;
  }

  async getWeeklyReportById(reportId: number, teamId: number) {
    const response = await this.api.get(`/weekly-reports/${reportId}/team/${teamId}`);
    return response.data;
  }

  async generateWeeklyReport(teamId: number, startDate: string, endDate: string, reportType: string) {
    const response = await this.api.post('/weekly-reports/generate', {
      teamId,
      startDate,
      endDate,
      reportType
    });
    return response.data;
  }

  async regenerateWeeklyReport(reportId: number, teamId: number) {
    const response = await this.api.post(`/weekly-reports/${reportId}/regenerate`, { teamId });
    return response.data;
  }

  async deleteWeeklyReport(reportId: number, teamId: number) {
    const response = await this.api.delete(`/weekly-reports/${reportId}/team/${teamId}`);
    return response.data;
  }

  async forceStartStandup(teamId: number) {
    const response = await this.api.post(`/standup/team/${teamId}/force-start`);
    return response.data;
  }

  async forceStopStandup(teamId: number) {
    const response = await this.api.post(`/standup/team/${teamId}/force-stop`);
    return response.data;
  }

  async respondStandupAutoStart(teamId: number, decision: 'start' | 'cancel') {
    const response = await this.api.post(`/standup/team/${teamId}/auto-start/respond`, { decision });
    return response.data;
  }

  async startStandupFocus(teamId: number, payload: { itemId?: number | null; presenterId?: number }) {
    const response = await this.api.post(`/standup/team/${teamId}/focus`, { ...payload, action: 'start' });
    return response.data;
  }

  async stopStandupFocus(teamId: number) {
    const response = await this.api.post(`/standup/team/${teamId}/focus`, { action: 'stop' });
    return response.data;
  }
}

export default new ApiService();
