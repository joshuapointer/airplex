import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#000000',
        color: '#00FF66',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 96,
        fontWeight: 700,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        letterSpacing: '-4px',
      }}
    >
      ax
    </div>,
    size,
  );
}
