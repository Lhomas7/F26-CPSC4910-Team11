export function catalogIdentity(user) {
  return JSON.stringify([
    user.id,
    user.username,
    user.account_type,
    user.company,
    Boolean(user.impersonation?.active),
    user.impersonation?.admin?.id,
    user.impersonation?.expires_at,
  ]);
}
