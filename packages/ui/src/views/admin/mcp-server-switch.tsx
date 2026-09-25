'use client';

import { Switch } from '../../components/switch';

export interface McpServerSwitchProps {
  /** The saved setting. */
  checked: boolean;
  /**
   * `MCP_ENABLED=false` forces the server off: the switch then shows "off" and
   * is disabled — the saved setting is irrelevant until the environment allows
   * the server again, so letting it flip would only mislead.
   */
  forcedOffByEnv: boolean;
  pending?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** Admin → MCP: the instance-wide switch for the MCP server. */
export function McpServerSwitch({ checked, forcedOffByEnv, pending = false, onCheckedChange }: McpServerSwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span id="mcp-enabled-label" className="text-label-m">
          Allow AI assistants to connect
        </span>
        <span id="mcp-enabled-description" className="text-body-s text-muted-foreground">
          {forcedOffByEnv
            ? 'MCP_ENABLED=false is set in the server environment, which overrides this switch.'
            : 'Switching off rejects every MCP request at once. Tokens stay valid for when it is back on.'}
        </span>
      </div>
      <Switch
        checked={forcedOffByEnv ? false : checked}
        aria-labelledby="mcp-enabled-label"
        aria-describedby="mcp-enabled-description"
        disabled={forcedOffByEnv || pending}
        onCheckedChange={(next) => onCheckedChange(next)}
      />
    </div>
  );
}
