import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/pages/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        np: {
          green: 'var(--np-green)',
          cyan: 'var(--np-cyan)',
          magenta: 'var(--np-magenta)',
          bg: 'var(--np-bg)',
          fg: 'var(--np-fg)',
          muted: 'var(--np-muted)',
        },
      },
      fontFamily: {
        display: ['var(--np-font-display)'],
        mono: ['var(--np-font-body)'],
      },
      borderRadius: {
        sharp: 'var(--np-radius-sharp)',
        soft: 'var(--np-radius-soft)',
      },
    },
  },
  plugins: [],
};

export default config;
