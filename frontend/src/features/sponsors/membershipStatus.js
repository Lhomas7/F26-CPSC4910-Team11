const STATUSES = {
  approved: { label: 'Approved', badge: 'badge-success' },
  pending: { label: 'Pending approval', badge: 'badge-warning' },
  rejected: { label: 'Not approved', badge: 'badge-danger' },
  dropped: { label: 'Removed', badge: 'badge-neutral' },
};

/** The label and badge class for a driver's status with one sponsor. */
export default function membershipStatus(status) {
  return STATUSES[status] || { label: status, badge: 'badge-neutral' };
}
