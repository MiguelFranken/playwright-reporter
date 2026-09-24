'use client';

import { ChevronDown, Copy, ExternalLink, Settings2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/dropdown-menu';
import { cursorPromptLink, vscodePromptLink } from '../lib/ai-handoff';
import { Link } from '../provider';

/**
 * Hands a failure over to the user's AI assistant.
 *
 * It takes a finished `prompt` string rather than building one, so a server
 * component can decide the scope (a result or a run) and pass plain data across
 * the client boundary — no builder functions (AGENTS.md, trap 1). The prompt
 * names only a URL; the assistant fetches the evidence through the MCP server,
 * which is why the same text works for copying and for every deep link.
 */
export function DebugWithAiMenu({
  prompt,
  setupHref,
  label = 'Debug with AI',
}: {
  /** A scope-only prompt from `debugPrompt` / `triagePrompt` in `lib/ai-handoff`. */
  prompt: string;
  /** The page that explains how to connect an assistant to this instance. */
  setupHref: string;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Sparkles className="size-3.5" />
        {label}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(prompt);
              toast.success('Prompt copied — paste it into your assistant');
            } catch {
              toast.error('Could not copy to clipboard');
            }
          }}
        >
          <Copy />
          Copy prompt
        </DropdownMenuItem>
        <DropdownMenuLinkItem href={cursorPromptLink(prompt)} closeOnClick>
          <ExternalLink />
          Open in Cursor
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem href={vscodePromptLink(prompt)} closeOnClick>
          <ExternalLink />
          Open in VS Code
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href={setupHref} />} closeOnClick>
          <Settings2 />
          Set up an assistant
        </DropdownMenuLinkItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
