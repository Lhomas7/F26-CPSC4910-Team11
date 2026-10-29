import { useState } from 'react';

import { ImageIcon, ImageOffIcon } from '../../../components/primitives/Icons';
import './ProductImage.css';

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function ImageContent({ src, name, emptyText, failedText }) {
  const [failed, setFailed] = useState(false);
  const missing = !src;
  const showImage = !missing && isHttpsUrl(src) && !failed;
  const FallbackIcon = missing ? ImageIcon : ImageOffIcon;

  return (
    <div className="catalog-product-media">
      {showImage ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="catalog-product-media-fallback">
          <FallbackIcon size={26} />
          <span>{missing ? emptyText : failedText}</span>
        </span>
      )}
    </div>
  );
}

export default function ProductImage({
  src,
  name,
  emptyText = 'No image added',
  failedText = 'Image didn’t load',
}) {
  // A replacement URL gets a fresh error state; one failed image never affects
  // another card. Images are loaded by the browser, not fetched by our server.
  return (
    <ImageContent
      key={src || ''}
      src={src}
      name={name}
      emptyText={emptyText}
      failedText={failedText}
    />
  );
}
