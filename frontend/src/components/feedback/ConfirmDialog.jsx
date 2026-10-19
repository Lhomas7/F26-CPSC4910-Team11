import Modal from './Modal';

/** Yes/no confirmation. Focus starts on Cancel so Enter never confirms by accident. */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      title={title}
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
            {cancelLabel}
          </button>
          <button
            className="button button-large button-primary"
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}
