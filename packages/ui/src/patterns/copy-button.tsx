'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/button';
import { cn } from '../lib/cn';

export function CopyButton({
  value,
  label = 'Copy',
  successMessage = 'Copied to clipboard',
  size = 'icon-sm',
  variant = 'ghost',
  className,
  children,
}: {
  value: string;
  label?: string;
  successMessage?: string;
  size?: 'sm' | 'icon-sm' | 'default' | 'xs';
  variant?: 'ghost' | 'outline' | 'secondary' | 'default';
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={label}
      className={cn(className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(successMessage);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Could not copy to clipboard');
        }
      }}
    >
      {copied ? <Check className="size-3.5 text-success-text" /> : <Copy className="size-3.5" />}
      {children}
    </Button>
  );
}
