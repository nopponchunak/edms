let signatureFontFacePromise: Promise<void> | null = null;

export function ensureSignatureFontDataFace(): Promise<void> {
  if (typeof document === 'undefined' || typeof fetch === 'undefined') {
    return Promise.resolve();
  }

  if (document.getElementById('signature-font-data-face')) {
    return Promise.resolve();
  }

  if (signatureFontFacePromise) {
    return signatureFontFacePromise;
  }

  signatureFontFacePromise = fetch('/fonts/testimonia/Testimonia-3zp8X.ttf', { cache: 'force-cache' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load signature font: ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then(async (buffer) => {
      const fontBase64 = arrayBufferToBase64(buffer);
      const style = document.createElement('style');
      style.id = 'signature-font-data-face';
      style.textContent = `
        @font-face {
          font-family: 'testimonia-font-data';
          src: url('data:font/ttf;base64,${fontBase64}') format('truetype');
          font-weight: normal;
          font-style: normal;
          font-display: block;
        }

        .signature-name {
          font-family: 'testimonia-font-data', 'testimonia-font', cursive !important;
        }
      `;
      document.head.appendChild(style);

      await document.fonts?.load?.('18px testimonia-font-data');
    })
    .catch((error) => {
      console.warn('Unable to inject signature font data face:', error);
    });

  return signatureFontFacePromise;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
