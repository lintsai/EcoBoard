import { Server as HttpServer } from 'http';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import { query } from '../database/pool';

interface TokenPayload {
  id: number;
  username?: string;
  displayName?: string;
}

export type StandupEventAction =
  | 'standup-refresh'
  | 'checkin-created'
  | 'workitem-created'
  | 'workitem-updated'
  | 'workitem-progress'
  | 'workitem-reassigned'
  | 'workitem-moved-to-today'
  | 'workitem-deleted'
  | 'workitem-cohandler-added'
  | 'workitem-cohandler-removed'
  | 'backlog-promoted'
  | 'standup-session-started'
  | 'standup-session-warning'
  | 'standup-session-ended'
  | 'standup-participant-left'
  | 'standup-participant-joined';

export interface StandupBroadcastPayload {
  action: StandupEventAction | string;
  actorId?: number;
  itemId?: number;
  checkinId?: number;
  metadata?: Record<string, unknown>;
}

interface StandupClientMeta {
  userId: number;
  username?: string;
  displayName?: string;
  teamId: number;
  teamSize?: number;
}

let wss: WebSocketServer | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
const teamClients = new Map<number, Set<WebSocket>>();
const clientMetadata = new WeakMap<WebSocket, StandupClientMeta>();
const teamUserPresence = new Map<number, Map<number, number>>();
const teamMemberCounts = new Map<number, number>();

const STANDUP_DURATION_MS = 15 * 60 * 1000;

interface StandupSession {
  startTime: number;
  startedBy?: string;
  warningTimer?: NodeJS.Timeout;
  lastWarningIndex: number;
  requiredParticipants?: number;
}


const teamStandupSessions = new Map<number, StandupSession>();

const safeSend = (ws: WebSocket, data: Record<string, unknown>) => {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    ws.send(JSON.stringify(data));
  } catch (error) {
    console.error('[StandupSocket] Failed to send message', error);
  }
};

const getActorName = (meta: StandupClientMeta | StandupSession) => {
  if ('teamId' in meta) {
    const typed = meta as StandupClientMeta;
    return typed.displayName || typed.username || `成員#${typed.userId}`;
  }
  return (meta as StandupSession).startedBy || '系統';
};

const getTeamPresenceCount = (teamId: number) => teamUserPresence.get(teamId)?.size || 0;

const incrementTeamPresence = (meta: StandupClientMeta) => {
  let presence = teamUserPresence.get(meta.teamId);
  if (!presence) {
    presence = new Map();
    teamUserPresence.set(meta.teamId, presence);
  }
  const prev = presence.get(meta.userId) || 0;
  presence.set(meta.userId, prev + 1);
  return prev === 0;
};

const decrementTeamPresence = (meta: StandupClientMeta) => {
  const presence = teamUserPresence.get(meta.teamId);
  if (!presence) {
    return false;
  }
  const prev = presence.get(meta.userId) || 0;
  if (prev <= 1) {
    presence.delete(meta.userId);
    if (presence.size === 0) {
      teamUserPresence.delete(meta.teamId);
    }
    return true;
  }
  presence.set(meta.userId, prev - 1);
  return false;
};

const fetchTeamMemberCount = async (teamId: number) => {
  try {
    const result = await query('SELECT COUNT(*) FROM team_members WHERE team_id = $1', [teamId]);
    const count = parseInt(result.rows[0]?.count || '0', 10);
    teamMemberCounts.set(teamId, count);
    return count;
  } catch (error) {
    console.error('[StandupSocket] Failed to fetch team member count', { teamId, error });
    return teamMemberCounts.get(teamId) || 0;
  }
};

const getSessionPayload = (teamId: number, session: StandupSession) => {
  const serverTimestamp = Date.now();
  const elapsed = serverTimestamp - session.startTime;
  const remainingMs = Math.max(STANDUP_DURATION_MS - elapsed, 0);
  return {
    startTime: session.startTime,
    durationMs: STANDUP_DURATION_MS,
    startedBy: session.startedBy,
    requiredParticipants: session.requiredParticipants ?? teamMemberCounts.get(teamId) ?? null,
    currentParticipants: getTeamPresenceCount(teamId),
    serverTimestamp,
    remainingMs
  };
};

const handleSessionTimerTick = (teamId: number) => {
  const session = teamStandupSessions.get(teamId);
  if (!session) {
    return;
  }

  const elapsed = Date.now() - session.startTime;
  if (elapsed < STANDUP_DURATION_MS) {
    return;
  }

  const warningIndex = Math.floor((elapsed - STANDUP_DURATION_MS) / 60000);
  if (warningIndex <= session.lastWarningIndex) {
    return;
  }

  session.lastWarningIndex = warningIndex;
  broadcastStandupUpdate(teamId, {
    action: 'standup-session-warning',
    metadata: {
      ...getSessionPayload(teamId, session),
      actorName: '系統提醒',
      overMinutes: warningIndex
    }
  });
};

const ensureStandupSession = (teamId: number, meta: StandupClientMeta) => {
  let session = teamStandupSessions.get(teamId);
  if (!session) {
    session = {
      startTime: Date.now(),
      startedBy: getActorName(meta),
      lastWarningIndex: -1,
      requiredParticipants: meta.teamSize
    };
    session.warningTimer = setInterval(() => handleSessionTimerTick(teamId), 15000);
    teamStandupSessions.set(teamId, session);

    broadcastStandupUpdate(teamId, {
      action: 'standup-session-started',
      actorId: meta.userId,
      metadata: {
        ...getSessionPayload(teamId, session),
        actorName: session.startedBy
      }
    });
  }
  return session;
};

const maybeStartStandupSession = (meta: StandupClientMeta) => {
  const required = meta.teamSize || teamMemberCounts.get(meta.teamId) || 0;
  if (!required) {
    return;
  }
  if (getTeamPresenceCount(meta.teamId) >= required) {
    ensureStandupSession(meta.teamId, meta);
  }
};

export const forceStartStandupSession = async (
  teamId: number,
  actor: { userId: number; username?: string; displayName?: string }
) => {
  const teamSize = teamMemberCounts.get(teamId) || await fetchTeamMemberCount(teamId);
  const meta: StandupClientMeta = {
    teamId,
    userId: actor.userId,
    username: actor.username,
    displayName: actor.displayName,
    teamSize
  };
  const session = ensureStandupSession(teamId, meta);
  broadcastSessionStatus(teamId);
  return session;
};

export const forceStopStandupSession = async (
  teamId: number,
  actor: { userId: number; username?: string; displayName?: string }
) => {
  const session = teamStandupSessions.get(teamId);
  if (!session) {
    broadcastSessionStatus(teamId);
    return null;
  }

  broadcastStandupUpdate(teamId, {
    action: 'standup-session-ended',
    actorId: actor.userId,
    metadata: {
      ...getSessionPayload(teamId, session),
      actorName: actor.displayName || actor.username || `成員#${actor.userId}`
    }
  });

  clearStandupSession(teamId);
  broadcastSessionStatus(teamId);
  return session;
};

const sendSessionStatusToClient = (ws: WebSocket, teamId: number) => {
  const session = teamStandupSessions.get(teamId);

  if (session) {
    safeSend(ws, {
      type: 'standup:session-status',
      teamId,
      active: true,
      ...getSessionPayload(teamId, session)
    });
  } else {
    safeSend(ws, {
      type: 'standup:session-status',
      teamId,
      active: false,
      currentParticipants: getTeamPresenceCount(teamId),
      requiredParticipants: teamMemberCounts.get(teamId) ?? null,
      serverTimestamp: Date.now()
    });
  }
};

const clearStandupSession = (teamId: number) => {
  const session = teamStandupSessions.get(teamId);
  if (!session) {
    return;
  }
  if (session.warningTimer) {
    clearInterval(session.warningTimer);
  }
  teamStandupSessions.delete(teamId);
};

const broadcastSessionStatus = (teamId: number) => {
  const clients = teamClients.get(teamId);
  if (!clients) {
    return;
  }
  clients.forEach((client) => sendSessionStatusToClient(client, teamId));
};

const removeClientFromTeam = (ws: WebSocket) => {
  const meta = clientMetadata.get(ws);
  if (!meta) {
    return;
  }

  const clients = teamClients.get(meta.teamId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) {
      teamClients.delete(meta.teamId);
    }
  }

  const fullyLeft = decrementTeamPresence(meta);
  if (fullyLeft) {
    broadcastStandupUpdate(meta.teamId, {
      action: 'standup-participant-left',
      actorId: meta.userId,
      metadata: {
        actorName: getActorName(meta),
        currentParticipants: getTeamPresenceCount(meta.teamId),
        requiredParticipants: meta.teamSize || teamMemberCounts.get(meta.teamId) || null
      }
    });
  }

  broadcastSessionStatus(meta.teamId);
  clientMetadata.delete(ws);
};
export const initStandupSocket = (server: HttpServer) => {
  if (wss) {
    return wss;
  }

  wss = new WebSocketServer({
    server,
    path: '/ws/standup'
  });

  wss.on('connection', (ws, req) => {
    if (!process.env.JWT_SECRET) {
      safeSend(ws, {
        type: 'standup:error',
        message: 'WebSocket 初始化設定錯誤'
      });
      ws.close(1011, 'Server misconfigured');
      return;
    }

    (async () => {
      try {
        const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const token = parsedUrl.searchParams.get('token');
        const teamParam = parsedUrl.searchParams.get('teamId');

        if (!token || !teamParam) {
          throw new Error('MISSING_PARAMS');
        }

        const teamId = Number(teamParam);
        if (Number.isNaN(teamId)) {
          throw new Error('INVALID_TEAM');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
        if (!decoded?.id) {
          throw new Error('INVALID_TOKEN');
        }

        const membership = await query(
          'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2 LIMIT 1',
          [teamId, decoded.id]
        );

        if (membership.rows.length === 0) {
          throw new Error('NOT_IN_TEAM');
        }

        const teamSize = await fetchTeamMemberCount(teamId);

        clientMetadata.set(ws, {
          userId: decoded.id,
          username: decoded.username,
          displayName: decoded.displayName,
          teamId,
          teamSize
        });

        const meta = clientMetadata.get(ws)!;

        if (!teamClients.has(teamId)) {
          teamClients.set(teamId, new Set());
        }
        teamClients.get(teamId)!.add(ws);

        sendSessionStatusToClient(ws, teamId);

        const isFirstPresence = incrementTeamPresence(meta);
        if (isFirstPresence) {
          broadcastStandupUpdate(meta.teamId, {
            action: 'standup-participant-joined',
            actorId: meta.userId,
            metadata: {
              actorName: getActorName(meta),
              currentParticipants: getTeamPresenceCount(meta.teamId),
              requiredParticipants: meta.teamSize || teamMemberCounts.get(meta.teamId) || null
            }
          });
        }
        broadcastSessionStatus(teamId);
        maybeStartStandupSession(meta);

        safeSend(ws, {
          type: 'standup:connected',
          teamId,
          timestamp: new Date().toISOString()
        });

        ws.on('close', () => removeClientFromTeam(ws));
        ws.on('error', (error) => {
          console.error('[StandupSocket] Client error', error);
          removeClientFromTeam(ws);
        });
      } catch (error) {
        console.error('[StandupSocket] Connection rejected', error);
        safeSend(ws, {
          type: 'standup:error',
          message: '無法建立連線，請確認權限與連線參數'
        });
        ws.close(4001, 'Unauthorized');
      }
    })();
  });

  heartbeatInterval = setInterval(() => {
    if (!wss) {
      return;
    }

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    });
  }, 30000);

  wss.on('close', () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    teamClients.clear();
    teamUserPresence.clear();
    teamStandupSessions.clear();
    teamMemberCounts.clear();
  });

  console.log('[StandupSocket] WebSocket server initialized');
  return wss;
};

const cleanupInactiveClient = (ws: WebSocket) => {
  removeClientFromTeam(ws);
  try {
    ws.terminate();
  } catch {
    // ignore terminate errors
  }
};

export const broadcastStandupUpdate = (teamId: number, payload: StandupBroadcastPayload) => {
  if (!teamId || !teamClients.size) {
    return;
  }

  const clients = teamClients.get(teamId);
  if (!clients || clients.size === 0) {
    return;
  }

  const message = JSON.stringify({
    type: 'standup:update',
    teamId,
    ...payload,
    timestamp: new Date().toISOString()
  });

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('[StandupSocket] Failed to broadcast update', error);
        cleanupInactiveClient(client);
      }
    } else {
      cleanupInactiveClient(client);
    }
  });
};

export const notifyStandupUpdateForTeam = (teamId: number, payload: StandupBroadcastPayload) => {
  try {
    broadcastStandupUpdate(teamId, payload);
  } catch (error) {
    console.error('[StandupSocket] Failed to broadcast team update', error);
  }
};

export const notifyStandupUpdateForCheckin = async (
  checkinId: number,
  payload: StandupBroadcastPayload
) => {
  if (!checkinId) {
    return;
  }

  try {
    const result = await query('SELECT team_id FROM checkins WHERE id = $1', [checkinId]);
    if (result.rows.length === 0 || !result.rows[0].team_id) {
      return;
    }

    broadcastStandupUpdate(result.rows[0].team_id, {
      ...payload,
      checkinId: payload.checkinId ?? checkinId
    });
  } catch (error) {
    console.error('[StandupSocket] Failed to notify for checkin', { checkinId, error });
  }
};

export const notifyStandupUpdateForWorkItem = async (
  workItemId: number,
  payload: StandupBroadcastPayload
) => {
  if (!workItemId) {
    return;
  }

  try {
    const result = await query(
      `SELECT wi.checkin_id, c.team_id
       FROM work_items wi
       LEFT JOIN checkins c ON wi.checkin_id = c.id
       WHERE wi.id = $1`,
      [workItemId]
    );

    if (result.rows.length === 0 || !result.rows[0].team_id) {
      return;
    }

    broadcastStandupUpdate(result.rows[0].team_id, {
      ...payload,
      itemId: payload.itemId ?? workItemId,
      checkinId: payload.checkinId ?? result.rows[0].checkin_id
    });
  } catch (error) {
    console.error('[StandupSocket] Failed to notify for work item', { workItemId, error });
  }
};

