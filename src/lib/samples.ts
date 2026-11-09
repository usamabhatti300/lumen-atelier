/**
 * The bundled sample photo for a first visit (roadmap 1.4): roll covers on home render on it until
 * the user has a photo of their own, and "try a sample" opens it as an ordinary edit.
 *
 * Source: "Perspective view of a narrow uphill street leading to A Coruña City Hall" by diaz827,
 * WordPress.org Photo Directory, CC0 1.0 (public domain dedication), 5712 × 4284 original
 * (SHA-256 0037a7b1…4b231b67). Shipped re-encoded at 2048 px and 480 px, without EXIF.
 */
export const SAMPLE_PHOTO = {
  name: 'a-coruna-street.jpg',
  url: '/samples/a-coruna-street.jpg',
  thumbUrl: '/samples/a-coruna-street-thumb.jpg',
  source: 'https://wordpress.org/photos/photo/5586a9e729/',
  author: 'diaz827',
  licence: 'CC0 1.0',
} as const;

/** The sample as a File, ready for the normal import path. Same origin, so it works offline once cached. */
export async function sampleFile(fetcher: typeof fetch = fetch): Promise<File> {
  const res = await fetcher(SAMPLE_PHOTO.url);
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) throw new Error('The sample photo could not be loaded.');
  return new File([await res.blob()], SAMPLE_PHOTO.name, { type: 'image/jpeg' });
}
