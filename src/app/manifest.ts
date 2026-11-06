import type { MetadataRoute } from 'next';

/** Lets drivers and staff install Afyaline on their phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Afyaline',
    short_name: 'Afyaline',
    description: 'Hospital-to-hospital patient transfers and ambulance coordination.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#0d8a76',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
