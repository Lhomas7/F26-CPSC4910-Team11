export const EMPTY_PRODUCT = {
  name: '',
  price_usd: '',
  description: '',
  image_url: '',
  is_available: true,
};

export function isHttpsImageUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function hasControls(value) {
  return [...value].some((character) => /\p{C}/u.test(character) && !/\s/u.test(character));
}

export function validateProductInput(form) {
  const values = {
    name: form.name.normalize('NFKC').trim().replace(/\s+/g, ' '),
    price_usd: form.price_usd.trim(),
    description: form.description.normalize('NFKC').replace(/\r\n?/g, '\n').trim(),
    image_url: form.image_url.trim(),
    is_available: form.is_available,
  };
  const errors = {};
  if (!values.name) errors.name = 'Enter a product name.';
  else if (values.name.length > 200) errors.name = 'Use 200 characters or fewer.';
  else if (hasControls(values.name)) errors.name = 'Control characters are not allowed.';
  if (!values.price_usd) errors.price_usd = 'Enter a price in US dollars.';
  else if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(values.price_usd)) {
    errors.price_usd = 'Use a nonnegative number with up to two decimal places, such as 24.95.';
  }
  if (values.description.length > 5000) errors.description = 'Use 5,000 characters or fewer.';
  else if (hasControls(values.description))
    errors.description = 'Control characters are not allowed.';
  if (values.image_url.length > 2048) errors.image_url = 'Use 2,048 characters or fewer.';
  else if (values.image_url && !isHttpsImageUrl(values.image_url))
    errors.image_url = 'Enter a valid image link starting with https://.';
  if (typeof values.is_available !== 'boolean')
    errors.is_available = 'Choose Available or Unavailable.';
  return { values, errors };
}

export function productFieldErrors(data) {
  const errors = {};
  for (const field of Object.keys(EMPTY_PRODUCT)) {
    const value = data?.[field];
    const message = Array.isArray(value)
      ? value.filter((item) => typeof item === 'string').join(' ')
      : value;
    if (typeof message === 'string' && message) errors[field] = message;
  }
  return errors;
}
