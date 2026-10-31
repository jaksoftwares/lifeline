import { type MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lifeline',
    short_name: 'Lifeline',
    description: 'Healthcare Referral & Transfer Coordination',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F8FA',
    theme_color: '#12304A',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
