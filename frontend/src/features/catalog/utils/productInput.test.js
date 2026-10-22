import { EMPTY_PRODUCT, productFieldErrors, validateProductInput } from './productInput';

test('requires name and price without inventing a point cost', () => {
  const { errors } = validateProductInput(EMPTY_PRODUCT);
  expect(Object.keys(errors)).toEqual(['name', 'price_usd']);
});

test('normalizes human input, preserves paragraphs, and keeps money as a string', () => {
  const { values, errors } = validateProductInput({
    ...EMPTY_PRODUCT, name: '  Ｔｒａｖｅｌ\t Mug ', price_usd: ' 12.50 ',
    description: ' First\r\n\r\nSecond ', image_url: ' https://images.example.com/x.png ',
  });
  expect(errors).toEqual({});
  expect(values).toEqual({
    name: 'Travel Mug', price_usd: '12.50', description: 'First\n\nSecond',
    image_url: 'https://images.example.com/x.png', is_available: true,
  });
});

test.each(['0', '0.00', '12.5', '9999999999.99'])('accepts valid nonnegative price %s', (price_usd) => {
  expect(validateProductInput({ ...EMPTY_PRODUCT, name: 'Mug', price_usd }).errors).toEqual({});
});

test.each(['-1', '1.234', '1e3', 'NaN', '10000000000.00', '$12.50'])('rejects invalid price %s', (price_usd) => {
  expect(validateProductInput({ ...EMPTY_PRODUCT, name: 'Mug', price_usd }).errors.price_usd).toBeTruthy();
});

test.each([
  ['name', 'x'.repeat(201)], ['name', 'Bad\x00Name'], ['description', 'x'.repeat(5001)],
  ['description', 'Bad\x00Description'], ['image_url', 'http://images.example.com/x.png'],
  ['image_url', 'javascript:alert(1)'], ['image_url', 'https://example.com/' + 'x'.repeat(2048)],
  ['is_available', 'false'],
])('validates %s boundaries', (field, value) => {
  expect(validateProductInput({ ...EMPTY_PRODUCT, name: 'Mug', price_usd: '1', [field]: value }).errors[field]).toBeTruthy();
});

test('maps only recognized server validation fields into the form', () => {
  expect(productFieldErrors({ name: ['Required.'], price_usd: 'Invalid.', sponsor_id: ['Forbidden.'], detail: 'Other error' }))
    .toEqual({ name: 'Required.', price_usd: 'Invalid.' });
});
