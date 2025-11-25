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

interface ActiveParticipant {
  userId: number;
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
  | 'standup-participant-joined'
  | 'standup-focus-started'
  | 'standup-focus-stopped'
  | 'standup-auto-start-prompt'
  | 'standup-auto-start-cancelled';

export interface StandupBroadcastPayload {
  action: StandupEventAction | string;
  actorId?: number;
  itemId?: number;
  checkinId?: number;
  metadata?: Record<string, unknown>;
  participants?: ActiveParticipant[];
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

interface FocusState {
  presenterId: number;
  presenterName?: string;
  itemId?: number | null;
  startedAt: number;
}

interface AutoStartState {
  pending: boolean;
  promptActorId?: number;
  promptActorName?: string;
  requiredParticipants?: number;
  currentParticipants?: number;
  declinedBy?: number;
  declinedAt?: number;
}

const teamFocusState = new Map<number, FocusState>();
const teamAutoStartState = new Map<number, AutoStartState>();

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

const resolveParticipantLabel = (participant: ActiveParticipant) =>
  participant.displayName || participant.username || `成員#${participant.userId}`;

const getActiveParticipants = (teamId: number): ActiveParticipant[] => {
  const presence = teamUserPresence.get(teamId);
  if (!presence || presence.size === 0) {
    return [];
  }

  const clients = teamClients.get(teamId);
  if (!clients || clients.size === 0) {
    return [];
  }

  const participants: ActiveParticipant[] = [];
  const presenceEntries = Array.from(presence.keys());

  presenceEntries.forEach((userId) => {
    let participant: ActiveParticipant | null = null;
    clients.forEach((client) => {
      if (participant) {
        return;
      }
      const meta = clientMetadata.get(client);
      if (meta?.userId === userId) {
        participant = {
          userId,
          username: meta.username,
          displayName: meta.displayName
        };
      }
    });

    participants.push(
      participant || {
        userId
      }
    );
  });

  return participants.sort((a, b) =>
    resolveParticipantLabel(a).localeCompare(resolveParticipantLabel(b), 'zh-Hant')
  );
};

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
    participants: getActiveParticipants(teamId),
    serverTimestamp,
    remainingMs
  };
};

const clearFocusState = (teamId: number) => {
  if (teamFocusState.has(teamId)) {
    teamFocusState.delete(teamId);
  }
};

const broadcastFocusState = (teamId: number, focus: FocusState, actorId?: number) => {
  teamFocusState.set(teamId, focus);
  broadcastStandupUpdate(teamId, {
    action: 'standup-focus-started',
    actorId: actorId ?? focus.presenterId,
    metadata: {
      presenterId: focus.presenterId,
      presenterName: focus.presenterName,
      itemId: focus.itemId ?? null,
      startedAt: focus.startedAt
    }
  });
};

const broadcastFocusStopped = (teamId: number, actor: { userId: number; username?: string; displayName?: string } | null) => {
  const previous = teamFocusState.get(teamId);
  if (!previous && !actor) {
    return;
  }
  clearFocusState(teamId);
  broadcastStandupUpdate(teamId, {
    action: 'standup-focus-stopped',
    actorId: actor?.userId ?? previous?.presenterId,
    metadata: {
      actorName: actor?.displayName || actor?.username || (previous?.presenterName ?? '成員'),
      presenterId: previous?.presenterId,
      itemId: previous?.itemId ?? null
    }
  });
};

const resetAutoStartState = (teamId: number) => {
  if (teamAutoStartState.has(teamId)) {
    teamAutoStartState.delete(teamId);
  }
};

const getPendingAutoStart = (teamId: number) => {
  const state = teamAutoStartState.get(teamId);
  if (state?.pending) {
    return state;
  }
  return null;
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
    resetAutoStartState(teamId);
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
  const current = getTeamPresenceCount(meta.teamId);
  const hasSession = teamStandupSessions.has(meta.teamId);

  if (current < required) {
    resetAutoStartState(meta.teamId);
    return;
  }

  if (hasSession) {
    resetAutoStartState(meta.teamId);
    return;
  }

  if (getPendingAutoStart(meta.teamId)) {
    return;
  }

  const actorName = getActorName(meta);
  const promptState: AutoStartState = {
    pending: true,
    promptActorId: meta.userId,
    promptActorName: actorName,
    requiredParticipants: required,
    currentParticipants: current
  };
  teamAutoStartState.set(meta.teamId, promptState);

  broadcastStandupUpdate(meta.teamId, {
    action: 'standup-auto-start-prompt',
    actorId: meta.userId,
    metadata: {
      actorName,
      requiredParticipants: required,
      currentParticipants: current,
      promptUserId: meta.userId
    }
  });
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

  if (teamFocusState.has(teamId)) {
    broadcastFocusStopped(teamId, actor);
  }

  clearStandupSession(teamId);
  broadcastSessionStatus(teamId);
  return session;
};

export const handleAutoStartDecision = async (
  teamId: number,
  actor: { userId: number; username?: string; displayName?: string },
  decision: 'start' | 'cancel'
) => {
  if (decision === 'start') {
    resetAutoStartState(teamId);
    return forceStartStandupSession(teamId, actor);
  }

  teamAutoStartState.set(teamId, {
    pending: false,
    declinedBy: actor.userId,
    declinedAt: Date.now()
  });

  broadcastStandupUpdate(teamId, {
    action: 'standup-auto-start-cancelled',
    actorId: actor.userId,
    metadata: {
      actorName: actor.displayName || actor.username || `成員#${actor.userId}`
    }
  });
  broadcastSessionStatus(teamId);
  return null;
};

export const startStandupFocus = (
  teamId: number,
  actor: { userId: number; username?: string; displayName?: string },
  payload: { itemId?: number | null; presenterId?: number }
) => {
  const presenterId = payload.presenterId ?? actor.userId;
  const focus: FocusState = {
    presenterId,
    presenterName: actor.displayName || actor.username,
    itemId: typeof payload.itemId === 'number' ? payload.itemId : null,
    startedAt: Date.now()
  };
  broadcastFocusState(teamId, focus, actor.userId);
};

export const stopStandupFocus = (
  teamId: number,
  actor: { userId: number; username?: string; displayName?: string }
) => {
  if (!teamFocusState.has(teamId)) {
    return;
  }
  broadcastFocusStopped(teamId, actor);
};

const sendSessionStatusToClient = (ws: WebSocket, teamId: number) => {
  const session = teamStandupSessions.get(teamId);
  const currentFocus = teamFocusState.get(teamId);
  const pendingAutoStart = getPendingAutoStart(teamId);

  if (session) {
    safeSend(ws, {
      type: 'standup:session-status',
      teamId,
      active: true,
      ...getSessionPayload(teamId, session),
      currentFocus: currentFocus
        ? {
          presenterId: currentFocus.presenterId,
          presenterName: currentFocus.presenterName,
          itemId: currentFocus.itemId ?? null,
          startedAt: currentFocus.startedAt
        }
        : null,
      pendingAutoStart: pendingAutoStart
        ? {
          actorId: pendingAutoStart.promptActorId,
          actorName: pendingAutoStart.promptActorName,
          requiredParticipants: pendingAutoStart.requiredParticipants,
          currentParticipants: pendingAutoStart.currentParticipants
        }
        : null
    });
  } else {
    safeSend(ws, {
      type: 'standup:session-status',
      teamId,
      active: false,
      currentParticipants: getTeamPresenceCount(teamId),
      requiredParticipants: teamMemberCounts.get(teamId) ?? null,
      participants: getActiveParticipants(teamId),
      serverTimestamp: Date.now(),
      currentFocus: currentFocus
        ? {
          presenterId: currentFocus.presenterId,
          presenterName: currentFocus.presenterName,
          itemId: currentFocus.itemId ?? null,
          startedAt: currentFocus.startedAt
        }
        : null,
      pendingAutoStart: pendingAutoStart
        ? {
          actorId: pendingAutoStart.promptActorId,
          actorName: pendingAutoStart.promptActorName,
          requiredParticipants: pendingAutoStart.requiredParticipants,
          currentParticipants: pendingAutoStart.currentParticipants
        }
        : null
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
  resetAutoStartState(teamId);
  clearFocusState(teamId);
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
        requiredParticipants: meta.teamSize || teamMemberCounts.get(meta.teamId) || null,
        participants: getActiveParticipants(meta.teamId)
      },
      participants: getActiveParticipants(meta.teamId)
    });
  }

  const required = meta.teamSize || teamMemberCounts.get(meta.teamId) || 0;
  if (getTeamPresenceCount(meta.teamId) < required) {
    resetAutoStartState(meta.teamId);
  }

  const focus = teamFocusState.get(meta.teamId);
  if (focus?.presenterId === meta.userId) {
    broadcastFocusStopped(meta.teamId, meta);
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
              requiredParticipants: meta.teamSize || teamMemberCounts.get(meta.teamId) || null,
              participants: getActiveParticipants(meta.teamId)
            },
            participants: getActiveParticipants(meta.teamId)
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
    participants: payload.participants ?? getActiveParticipants(teamId),
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

