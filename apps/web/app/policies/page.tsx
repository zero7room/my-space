'use client';
import * as React from 'react';
import { WorkbenchPage } from '../../components/workbench/WorkbenchPage';

export default function PoliciesPage(): React.JSX.Element {
  return <WorkbenchPage initialDeepLink="policies" />;
}
