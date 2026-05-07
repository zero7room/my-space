'use client';
import * as React from 'react';
import { cn } from '../../lib/cn';
import { GuardDecisionBadge, type GuardDecision } from './GuardDecisionBadge';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string; // ISO timestamp
  guardDecision?: GuardDecision;
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function MessageBubble(props: {
  message: ChatMessage;
}): React.JSX.Element {
  const { message } = props;

  if (message.role === 'system') {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="max-w-[80%] text-center text-sm text-muted">
          {message.text}
        </div>
        <div className="text-[10px] text-muted/80">{formatTime(message.at)}</div>
      </div>
    );
  }

  const isUser = message.role === 'user';
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-1',
        isUser ? 'items-end' : 'items-start',
      )}
    >
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap break-words px-4 py-3 text-sm leading-7',
          isUser
            ? 'rounded-panel rounded-br-md bg-user-bubble text-foreground'
            : 'rounded-panel rounded-bl-md bg-surface text-foreground shadow-soft',
        )}
      >
        {message.text}
      </div>
      <div
        className={cn(
          'text-[10px] text-muted/80',
          isUser ? 'pr-1 text-right' : 'pl-1 text-left',
        )}
      >
        {formatTime(message.at)}
      </div>
      {message.guardDecision ? (
        <div className={cn(isUser ? 'items-end' : 'items-start')}>
          <GuardDecisionBadge decision={message.guardDecision} />
        </div>
      ) : null}
    </div>
  );
}
