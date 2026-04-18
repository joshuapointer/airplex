import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
  async headers() {
    const shareHeaders = [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
    ];
    const dashboardHeaders = [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
    ];
    return [
      { source: '/s/:path*', headers: shareHeaders },
      { source: '/dashboard/:path*', headers: dashboardHeaders },
    ];
  },
};

export default nextConfig;
