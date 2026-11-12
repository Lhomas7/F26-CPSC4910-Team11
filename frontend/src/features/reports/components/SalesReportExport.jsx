import { useEffect, useRef, useState } from 'react';

import { downloadSalesReport } from 'api';
import Modal from 'components/feedback/Modal';

const formats = [
  ['csv', 'CSV'],
  ['xlsx', 'Excel'],
  ['pdf', 'PDF'],
  ['html', 'HTML'],
];

function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export default function SalesReportExport({ scope, scopeText, onAccessDenied }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);

  useEffect(() => () => request.current?.abort(), []);

  function close() {
    request.current?.abort();
    request.current = null;
    setOpen(false);
    setPending(false);
    setError('');
  }

  async function download(format) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    try {
      const { blob, filename } = await downloadSalesReport(scope, format, controller.signal);
      if (controller.signal.aborted) return;
      saveFile(blob, filename);
      close();
    } catch (failure) {
      if (controller.signal.aborted) return;
      if ([401, 403, 409].includes(failure.status)) {
        close();
        onAccessDenied();
      } else {
        setError(failure.message || 'The report could not be downloaded. Try again.');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  return (
    <>
      <button className="button" type="button" onClick={() => setOpen(true)}>
        Export report
      </button>
      {open && (
        <Modal
          title="Export sales report"
          onClose={close}
          actions={
            <>
              <button className="button" type="button" onClick={close}>
                Cancel
              </button>
              {formats.map(([format, label]) => (
                <button
                  key={format}
                  className="button"
                  type="button"
                  aria-disabled={pending}
                  onClick={() => download(format)}
                >
                  Download {label}
                </button>
              ))}
            </>
          }
        >
          <p>{scopeText}</p>
          <p>The download includes all grouped results and totals for this report.</p>
          {pending && <p role="status">Preparing download…</p>}
          {error && (
            <p className="banner banner-error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
