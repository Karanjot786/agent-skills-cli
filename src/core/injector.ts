/**
 * Context Injector Module
 * Generates system prompt XML for skill discovery
 */

import type { SkillRef, Skill, SkillPromptXML } from '../types/index.js';

/**
 * Generate XML for system prompt injection (Level 1 - metadata only)
 * This is what gets injected at startup for skill discovery
 */
export function generateSkillsPromptXML(skills: SkillRef[]): SkillPromptXML {
    if (skills.length === 0) {
        return {
            xml: '',
            skillCount: 0,
            estimatedTokens: 0
        };
    }

    const skillElements = skills.map(skill => `
  <skill>
    <name>${escapeXML(skill.name)}</name>
    <description>${escapeXML(skill.description)}</description>
    <location>${escapeXML(skill.path)}/SKILL.md</location>
  </skill>`).join('');

    const xml = `<available_skills>${skillElements}
</available_skills>`;

    // Estimate tokens (~4 chars per token)
    const estimatedTokens = Math.ceil(xml.length / 4);

    return {
        xml,
        skillCount: skills.length,
        estimatedTokens
    };
}

/**
 * Generate the skill activation prompt (Level 2 - full instructions)
 * This is what gets sent when a skill is triggered
 */
export function generateSkillActivationPrompt(skill: Skill): string {
    const lines: string[] = [
        `<skill_activated name="${escapeXML(skill.metadata.name)}">`,
        '',
        skill.body,
        '',
        '</skill_activated>'
    ];

    return lines.join('\n');
}

/**
 * Generate instructions for the agent on how to use skills
 */
export function generateSkillSystemInstructions(): string {
    return `## Agent Skills System

You have access to specialized skills that extend your capabilities. Each skill provides domain-specific instructions for particular tasks.

### How to use skills:
1. **Discovery**: Review the <available_skills> section to see what skills are installed
2. **Activation**: When a task matches a skill's description, read the skill's SKILL.md file to load detailed instructions
3. **Execution**: Follow the skill's instructions, loading additional reference files or running scripts as needed

### Skill activation:
- When you determine a skill is relevant to the user's request, use bash to read the skill file:
  \`cat /path/to/skill/SKILL.md\`
- The skill may reference additional files (references/, scripts/) that you can load as needed
- Scripts in the scripts/ directory can be executed when the skill instructions require it

### Best practices:
- Only activate skills when they match the user's request
- Follow skill instructions carefully
- Load referenced files progressively (only when needed)
- Report when using a skill so the user knows specialized behavior is active
`;
}

/**
 * Generate a combined system prompt section with skills
 */
export function generateFullSkillsContext(skills: SkillRef[]): string {
    const instructions = generateSkillSystemInstructions();
    const { xml } = generateSkillsPromptXML(skills);

    if (!xml) {
        return '';
    }

    return `${instructions}

### Installed Skills:
${xml}
`;
}

/**
 * Escape special XML characters
 */
function escapeXML(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
