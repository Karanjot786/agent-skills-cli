import { describe, it, expect } from 'vitest';
import { AGENTS, agentsSupporting, getMcpTarget } from '../src/cli/agents.js';

describe('agent MCP/subagent/plugin capabilities', () => {
    it('agentsSupporting lists capable agents in AGENTS order (Claude Desktop is MCP-only, stdio-only)', () => {
        expect(agentsSupporting('mcp')).toEqual(['cursor', 'claude', 'copilot', 'codex', 'gemini-cli', 'windsurf', 'claude-desktop']);
        expect(agentsSupporting('agent')).toEqual(['claude']);
        expect(agentsSupporting('plugin')).toEqual(['claude']);
        expect(agentsSupporting('skill')).toEqual(Object.keys(AGENTS));
        expect(getMcpTarget('claude-desktop')).toMatchObject({ key: 'mcpServers', stdioOnly: true });
        expect(getMcpTarget('zed')).toBeUndefined();
    });
});
