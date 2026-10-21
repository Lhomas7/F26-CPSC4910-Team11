import { act, fireEvent, render, screen } from '@testing-library/react';

import ClampedText from './ClampedText';

const originalResizeObserver = global.ResizeObserver;
let observers;
let clippedHeight;
let fullHeight;

beforeEach(() => {
  observers = [];
  clippedHeight = 40;
  fullHeight = 80;
  jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => clippedHeight);
  jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => fullHeight);
  global.ResizeObserver = jest.fn().mockImplementation((callback) => {
    const observer = { observe: jest.fn(), disconnect: jest.fn(), callback };
    observers.push(observer);
    return observer;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  global.ResizeObserver = originalResizeObserver;
});

test('omits an empty description', () => {
  const { container } = render(<ClampedText text="" productName="Mug" />);
  expect(container).toBeEmptyDOMElement();
});

test('short descriptions do not get an unnecessary Show more button', () => {
  fullHeight = clippedHeight;
  render(<ClampedText text="A short description." productName="Mug" />);
  expect(screen.getByText('A short description.')).toHaveClass('is-clamped');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('expands and collapses only measured overflowing text with product-specific labels', () => {
  render(<ClampedText text="A long description." productName="Mug" />);
  const button = screen.getByRole('button', { name: 'Show more of the description for Mug' });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('A long description.')).toHaveAttribute('id', button.getAttribute('aria-controls'));
  fireEvent.click(button);
  expect(screen.getByText('A long description.')).not.toHaveClass('is-clamped');
  expect(screen.getByRole('button', { name: 'Show less of the description for Mug' })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(button);
  expect(screen.getByText('A long description.')).toHaveClass('is-clamped');
});

test('remeasures overflow after the content width changes', () => {
  fullHeight = clippedHeight;
  render(<ClampedText text="A responsive description." productName="Mug" />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  fullHeight = 120;
  act(() => observers[0].callback());
  expect(screen.getByRole('button', { name: /Show more/ })).toBeInTheDocument();
  fullHeight = clippedHeight;
  act(() => observers[0].callback());
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('window resize is a fallback when ResizeObserver is unavailable', () => {
  global.ResizeObserver = undefined;
  fullHeight = clippedHeight;
  render(<ClampedText text="A responsive description." productName="Mug" />);
  fullHeight = 80;
  fireEvent(window, new Event('resize'));
  expect(screen.getByRole('button', { name: /Show more/ })).toBeInTheDocument();
});

test('a new description starts collapsed instead of inheriting another card state', () => {
  const { rerender } = render(<ClampedText text="First description." productName="Mug" />);
  fireEvent.click(screen.getByRole('button'));
  rerender(<ClampedText text="Replacement description." productName="Jacket" />);
  expect(screen.getByRole('button', { name: /Show more.*Jacket/ })).toHaveAttribute('aria-expanded', 'false');
});

test('disconnects measurements when the card unmounts', () => {
  const { unmount } = render(<ClampedText text="Description." productName="Mug" />);
  unmount();
  expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
});
