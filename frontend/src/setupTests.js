// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom does not provide browser Web Crypto in this Jest version.
Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto, configurable: true });
