import * as React from 'react';
import './globals.css';

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
    <html lang="zh" className="h-full">
      <body className="h-dvh min-h-0 overflow-hidden">
        {children}
      </body>
    </html>
  );
}
