import { act, renderHook, waitFor } from '@testing-library/react';

import useApiRequest, { statusForError } from './useApiRequest';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('loads data and reports ready', async () => {
  const request = jest.fn().mockResolvedValue({ id: 1 });
  const onSuccess = jest.fn();
  const { result } = renderHook(() => useApiRequest(request, { onSuccess }));

  expect(result.current.status).toBe('loading');
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.data).toEqual({ id: 1 });
  expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
});

test('maps 403 and 404 to forbidden and not-found, and anything else to error', () => {
  expect(statusForError({ status: 403 })).toBe('forbidden');
  expect(statusForError({ status: 404 })).toBe('not-found');
  expect(statusForError(new Error('Network'))).toBe('error');
});

test('reports a failed request and retries with reload', async () => {
  const failure = Object.assign(new Error('Nope'), { status: 500 });
  const request = jest.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(['ok']);
  const { result } = renderHook(() => useApiRequest(request));

  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.error).toBe(failure);

  await act(() => result.current.reload());
  expect(result.current.status).toBe('ready');
  expect(result.current.data).toEqual(['ok']);
});

test('does not request while skipped', async () => {
  const request = jest.fn().mockResolvedValue('data');
  const { result, rerender } = renderHook(({ skip }) => useApiRequest(request, { skip }), {
    initialProps: { skip: true },
  });

  expect(request).not.toHaveBeenCalled();
  expect(result.current.status).toBe('loading');

  rerender({ skip: false });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(request).toHaveBeenCalledTimes(1);
});

test('ignores a slow earlier response once a newer request has started', async () => {
  const first = deferred();
  const second = deferred();
  const request = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { result } = renderHook(() => useApiRequest(request));

  act(() => { result.current.reload(); });
  await act(async () => { second.resolve('new'); });
  await act(async () => { first.resolve('old'); });

  expect(result.current.data).toBe('new');
});

test('setData updates the loaded data locally', async () => {
  const request = jest.fn().mockResolvedValue({ count: 1 });
  const { result } = renderHook(() => useApiRequest(request));
  await waitFor(() => expect(result.current.status).toBe('ready'));

  act(() => result.current.setData((current) => ({ count: current.count + 1 })));
  expect(result.current.data).toEqual({ count: 2 });
});
