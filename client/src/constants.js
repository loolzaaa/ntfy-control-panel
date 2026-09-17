export const PERMISSIONS = ['read-only', 'write-only', 'read-write', 'deny'];

export const ROLES = ['user', 'admin'];

export const ACTION_KEYS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.change_password',
  'user.create',
  'user.delete',
  'token.create',
  'token.delete',
  'token.delete_all',
  'access.set',
  'access.delete',
];

export const PERMISSION_OPTIONS = PERMISSIONS.map((value) => ({ value }));
