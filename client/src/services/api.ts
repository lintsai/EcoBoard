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
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
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

  async updateWorkItem(itemId: number, data: { content?: string; aiSummary?: string; aiTitle?: string; priority?: number }) {
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
}

export default new ApiService();
