const SELECTED_TEAM_KEY = 'selectedTeam';
const SELECTED_TEAM_OWNER_KEY = 'selectedTeamOwner';

const parseNumber = (value: string | null) => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const storeSelectedTeam = (teamId: number, userId?: number | null) => {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(SELECTED_TEAM_KEY, String(teamId));
  if (typeof userId === 'number') {
    localStorage.setItem(SELECTED_TEAM_OWNER_KEY, String(userId));
  }
};

export const getStoredSelectedTeam = () => {
  if (typeof window === 'undefined') {
    return { teamId: null as number | null, ownerId: null as number | null };
  }
  const teamId = parseNumber(localStorage.getItem(SELECTED_TEAM_KEY));
  const ownerId = parseNumber(localStorage.getItem(SELECTED_TEAM_OWNER_KEY));
  return { teamId, ownerId };
};

export const clearStoredSelectedTeam = () => {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(SELECTED_TEAM_KEY);
  localStorage.removeItem(SELECTED_TEAM_OWNER_KEY);
};

export const withTeamQuery = (target: string, teamId?: number | null) => {
  if (!target || !teamId) {
    return target;
  }
  const [base, hashFragment] = target.split('#');
  const [path, search = ''] = base.split('?');
  const params = new URLSearchParams(search);
  params.set('teamId', String(teamId));
  const searchString = params.toString();
  const searchSuffix = searchString ? `?${searchString}` : '';
  const hashSuffix = hashFragment ? `#${hashFragment}` : '';
  return `${path}${searchSuffix}${hashSuffix}`;
};
