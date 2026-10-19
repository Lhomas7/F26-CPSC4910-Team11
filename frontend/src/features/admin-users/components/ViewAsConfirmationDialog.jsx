import Modal from '../../../components/feedback/Modal';
import ViewedIdentitySummary from '../../../components/primitives/ViewedIdentitySummary';

export default function ViewAsConfirmationDialog({
  account,
  administratorName,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const role = account.role;
  const roleLabel = role === 'sponsor' ? 'sponsor' : 'driver';

  return (
    <Modal
      className="view-as-confirmation"
      title={`View as ${account.name}?`}
      onClose={busy ? undefined : onCancel}
      actions={
        <>
          <button
            className="button button-large"
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-autofocus
          >
            Cancel
          </button>
          <button
            className="button button-large button-primary"
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'Opening…' : `View as ${roleLabel}`}
          </button>
        </>
      }
    >
      <ViewedIdentitySummary
        name={account.name}
        username={account.username}
        role={role}
        organization={account.organization}
        avatarSrc={account.avatarSrc}
        status={account.isActive ? 'Active' : 'Inactive'}
      />
      <p className="view-as-confirmation-copy">
        You&apos;ll stay signed in as {administratorName} while viewing the application with{' '}
        {account.name}&apos;s access. You will not be signed in as them, and their password is not
        used.
      </p>
      <p className="view-as-confirmation-audit">
        This View-as session is recorded for auditing and ends automatically after 30 minutes.
      </p>
    </Modal>
  );
}
