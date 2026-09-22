import sharp from 'sharp';

// Genuine, uncompressed pixels exceed the old limit without trailing padding.
export async function largePhotoSource() {
  const buffer = await sharp({ create: { width: 2000, height: 1200, channels: 3, background: '#805347' } })
    .png({ compressionLevel: 0 }).toBuffer();
  return { name: 'phone-original.png', mimeType: 'image/png', buffer };
}
