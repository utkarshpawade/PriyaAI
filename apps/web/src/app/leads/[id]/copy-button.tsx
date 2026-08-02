'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard is blocked in some embedded contexts; failing silently is
          // better than an error toast over a summary the user can still select.
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}
