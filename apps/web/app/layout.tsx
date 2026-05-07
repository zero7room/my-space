import * as React from 'react';
export const metadata = {
  title: 'AI Workflow',
  description: 'AI Workflow System V1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 0,
          background: '#0b0c10',
          color: '#e8eaed',
        }}
      >
        {children}
      </body>
    </html>
  );
}
