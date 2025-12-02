export const sanitizeRedirectPath = (target?: string | null) => {
  if (!target) {
    return null;
  }
  if (!target.startsWith('/')) {
    return null;
  }
  return target;
};

export const buildLoginRedirectPath = (target: string) =>
  `/login?redirect=${encodeURIComponent(target)}`;
