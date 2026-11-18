import { readJson, request } from './client';

/** The organization details drivers can see: a sponsor's own, or a driver's sponsor's. */
export function getOrganization() {
  return request('/sponsor/organization/').then(readJson);
}

export function updateOrganization(data) {
  return request('/sponsor/organization/', { method: 'PATCH', body: data }).then(readJson);
}

/** The sponsor users at the signed-in sponsor's company. */
export function getTeam() {
  return request('/sponsor/team/').then(readJson);
}

/** Turn a teammate's account off (or back on); the server asks for the caller's password. */
export function setTeamMemberActive(userId, isActive, currentPassword) {
  return request(`/sponsor/team/${userId}/`, {
    method: 'PATCH',
    body: { is_active: isActive, current_password: currentPassword },
  }).then(readJson);
}

/**
 * Upload a pipe-delimited (.txt) or CSV file of organizations, drivers, and
 * sponsors. With `dryRun` the file is only checked: the same report comes
 * back but nothing is created.
 */
export function uploadBulkFile(file, { dryRun = false } = {}) {
  const body = new FormData();
  body.append('file', file);
  if (dryRun) body.append('dry_run', 'true');
  return request('/bulk-upload/', { method: 'POST', body }).then(readJson);
}
