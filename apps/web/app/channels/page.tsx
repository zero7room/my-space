'use client';
import * as React from 'react';
import { WorkbenchPage } from '../../components/workbench/WorkbenchPage';

export default function ChannelsPage(): React.JSX.Element {
  return <WorkbenchPage initialDeepLink="channels" />;
}
