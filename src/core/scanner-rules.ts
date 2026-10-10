/**
 * Scanner Rules - Security vulnerability detection rules
 * Used by the audit command to scan skills for potential threats
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ScannerRule {
    id: string;
    category: string;
    severity: Severity;
    title: string;
    description: string;
    pattern: RegExp;
    falsePositiveCheck?: (line: string, context: string[]) => boolean;
}

export interface ScanFinding {
    ruleId: string;
    category: string;
    severity: Severity;
    title: string;
    description: string;
    file: string;
    line: number;
    lineContent: string;
    column?: number;
}

export interface ScanResult {
    findings: ScanFinding[];
    filesScanned: number;
    summary: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
        total: number;
    };
}

/**
 * All scanner rules organized by category
 */
export const SCANNER_RULES: ScannerRule[] = [
    // ═══════════════════════════════════════════
    // PROMPT INJECTION (PI001-PI010)
    // ═══════════════════════════════════════════
    {
        id: 'PI001',
        category: 'prompt-injection',
        severity: 'critical',
        title: 'Direct prompt override attempt',
        description: 'Attempts to override or ignore previous instructions',
        pattern: /ignore\s+(all\s+)?previous\s+instructions/i,
    },
    {
        id: 'PI002',
        category: 'prompt-injection',
        severity: 'high', // role-setting ("You are now a ...") is normal in SKILL.md; critical would block legit installs
        title: 'System prompt override',
        description: 'Attempts to set a new system prompt or role',
        pattern: /you\s+are\s+now\s+(a|an|the)\s+/i,
    },
    {
        id: 'PI003',
        category: 'prompt-injection',
        severity: 'high',
        title: 'Role manipulation',
        description: 'Attempts to change the AI agent\'s role or behavior',
        pattern: /(act|behave|pretend|roleplay)\s+(as|like)\s+(a|an|the)\s+/i,
    },
    {
        id: 'PI004',
        category: 'prompt-injection',
        severity: 'high',
        title: 'Instruction bypass',
        description: 'Attempts to bypass safety restrictions',
        pattern: /(bypass|circumvent|override|disable)\s+(safety|restrictions?|filters?|guardrails?)/i,
    },
    {
        id: 'PI005',
        category: 'prompt-injection',
        severity: 'medium',
        title: 'Jailbreak attempt',
        description: 'Known jailbreak patterns detected',
        pattern: /(DAN|do\s+anything\s+now|STAN|jailbreak)/i,
    },
    {
        id: 'PI006',
        category: 'prompt-injection',
        severity: 'medium',
        title: 'Prompt leak request',
        description: 'Attempts to extract system prompts or instructions',
        pattern: /(reveal|show|print|output|display)\s+(your|the|system)\s+(prompt|instructions|rules)/i,
    },
    {
        id: 'PI007',
        category: 'prompt-injection',
        severity: 'high',
        title: 'Encoding-based injection',
        description: 'Using base64 or hex encoding to hide instructions',
        pattern: /(atob|btoa|Buffer\.from)\s*\(\s*['"`]/,
    },
    {
        id: 'PI008',
        category: 'prompt-injection',
        severity: 'medium',
        title: 'Delimiter manipulation',
        description: 'Using special delimiters to break prompt boundaries',
        pattern: /(```system|<\|im_start\|>|<\|endoftext\|>|<\/system>)/i,
    },

    // ═══════════════════════════════════════════
    // COMMAND INJECTION (CI001-CI008)
    // ═══════════════════════════════════════════
    {
        id: 'CI001',
        category: 'command-injection',
        severity: 'critical',
        title: 'Destructive command',
        description: 'Potentially destructive shell command',
        pattern: /\b(rm\s+-rf\s+[\/~]|rmdir\s+\/s|del\s+\/f\s+\/s|format\s+[a-z]:)/i,
    },
    {
        id: 'CI002',
        category: 'command-injection',
        severity: 'critical',
        title: 'Remote code execution',
        description: 'Piping remote content to shell execution',
        pattern: /\b(curl|wget)\s+.*\|\s*(bash|sh|zsh|python|node|eval)/i,
    },
    {
        id: 'CI003',
        category: 'command-injection',
        severity: 'high',
        title: 'Shell eval usage',
        description: 'Dynamic code evaluation which could execute arbitrary code',
        pattern: /\b(eval|exec|execSync|spawnSync|child_process)\s*\(/,
    },
    {
        id: 'CI004',
        category: 'command-injection',
        severity: 'high',
        title: 'Dangerous chmod',
        description: 'Setting overly permissive file permissions',
        pattern: /chmod\s+(777|666|a\+[rwx])/,
    },
    {
        id: 'CI005',
        category: 'command-injection',
        severity: 'medium',
        title: 'Sudo usage',
        description: 'Privilege escalation via sudo',
        pattern: /\bsudo\s+/,
    },
    {
        id: 'CI006',
        category: 'command-injection',
        severity: 'medium',
        title: 'Network download',
        description: 'Downloading content from external sources',
        pattern: /\b(curl|wget|fetch)\s+https?:\/\//i,
    },
    {
        id: 'CI007',
        category: 'command-injection',
        severity: 'high',
        title: 'Shell script generation',
        description: 'Dynamically creating and executing shell scripts',
        pattern: />\s*\/tmp\/.*\.sh|echo\s+.*>\s+.*\.sh\s*&&\s*(bash|sh|chmod)/,
    },

    // ═══════════════════════════════════════════
    // DATA EXFILTRATION (DE001-DE006)
    // ═══════════════════════════════════════════
    {
        id: 'DE001',
        category: 'data-exfiltration',
        severity: 'critical',
        title: 'Data exfiltration via webhook',
        description: 'Sending data to external webhook or API endpoint',
        pattern: /(fetch|axios|got|request)\s*\(\s*['"`](https?:\/\/[^'"]*?(webhook|exfil|ngrok|burp|requestbin))/i,
    },
    {
        id: 'DE002',
        category: 'data-exfiltration',
        severity: 'high',
        title: 'DNS exfiltration',
        description: 'Using DNS queries to exfiltrate data',
        pattern: /dns\.(resolve|lookup)\s*\(.*\$\{/,
    },
    {
        id: 'DE003',
        category: 'data-exfiltration',
        severity: 'high',
        title: 'Environment variable access',
        description: 'Reading sensitive environment variables',
        pattern: /process\.env\[(.*?(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL))/i,
    },
    {
        id: 'DE004',
        category: 'data-exfiltration',
        severity: 'medium',
        title: 'File read of sensitive paths',
        description: 'Reading from sensitive system paths',
        pattern: /readFile(Sync)?\s*\(\s*['"`](\/etc\/(passwd|shadow|ssh)|~\/\.ssh|~\/\.aws)/,
    },
    {
        id: 'DE005',
        category: 'data-exfiltration',
        severity: 'high',
        title: 'Base64 encoding of data',
        description: 'Encoding data to base64 before transmission',
        pattern: /Buffer\.from\(.*\)\.toString\(['"`]base64['"`]\)/,
    },

    // ═══════════════════════════════════════════
    // TOOL ABUSE (TA001-TA008)
    // ═══════════════════════════════════════════
    {
        id: 'TA001',
        category: 'tool-abuse',
        severity: 'high',
        title: 'Filesystem traversal',
        description: 'Accessing files outside project directory',
        pattern: /\.\.\/(\.\.\/){2,}|path\.(join|resolve)\s*\(.*\.\.\//,
    },
    {
        id: 'TA002',
        category: 'tool-abuse',
        severity: 'medium',
        title: 'Unrestricted file write',
        description: 'Writing to system or home directories',
        pattern: /writeFile(Sync)?\s*\(\s*['"`](\/usr|\/etc|\/var|\/home|\/root)/,
    },
    {
        id: 'TA003',
        category: 'tool-abuse',
        severity: 'medium',
        title: 'Process spawning',
        description: 'Spawning new processes from skill code',
        pattern: /\b(spawn|fork|exec)\s*\(\s*['"`]/,
    },
    {
        id: 'TA004',
        category: 'tool-abuse',
        severity: 'low',
        title: 'Global npm install',
        description: 'Installing packages globally',
        pattern: /npm\s+install\s+(-g|--global)/,
    },

    // ═══════════════════════════════════════════
    // HARDCODED SECRETS (HS001-HS008)
    // ═══════════════════════════════════════════
    {
        id: 'HS001',
        category: 'hardcoded-secrets',
        severity: 'critical',
        title: 'AWS access key',
        description: 'Hardcoded AWS access key ID',
        pattern: /AKIA[0-9A-Z]{16}/,
    },
    {
        id: 'HS002',
        category: 'hardcoded-secrets',
        severity: 'critical',
        title: 'API key pattern',
        description: 'Possible hardcoded API key',
        pattern: /(sk-[a-zA-Z0-9]{20,}|sk-proj-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36})/,
    },
    {
        id: 'HS003',
        category: 'hardcoded-secrets',
        severity: 'high',
        title: 'Generic secret assignment',
        description: 'Variable named secret/password/token with hardcoded value',
        pattern: /(password|secret|token|api_key|apikey|api[-_]?secret)\s*[:=]\s*['"`][A-Za-z0-9+/=]{8,}/i,
    },
    {
        id: 'HS004',
        category: 'hardcoded-secrets',
        severity: 'high',
        title: 'Private key block',
        description: 'Embedded private key',
        pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
    },
    {
        id: 'HS005',
        category: 'hardcoded-secrets',
        severity: 'high',
        title: 'JWT token',
        description: 'Hardcoded JWT token',
        pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    },
    {
        id: 'HS006',
        category: 'hardcoded-secrets',
        severity: 'medium',
        title: 'Database connection string',
        description: 'Hardcoded database URL with credentials',
        pattern: /(postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/,
    },

    // ═══════════════════════════════════════════
    // UNICODE STEGANOGRAPHY (UC001-UC006)
    // ═══════════════════════════════════════════
    {
        id: 'UC001',
        category: 'unicode-steganography',
        severity: 'high',
        title: 'Zero-width characters',
        description: 'Hidden zero-width characters that may contain embedded instructions',
        pattern: /[\u200B\u200C\u200D\uFEFF\u200E\u200F]/,
    },
    {
        id: 'UC002',
        category: 'unicode-steganography',
        severity: 'medium',
        title: 'Right-to-left override',
        description: 'Unicode RTL override that can disguise code direction',
        pattern: /[\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069]/,
    },
    {
        id: 'UC003',
        category: 'unicode-steganography',
        severity: 'medium',
        title: 'Homoglyph characters',
        description: 'Characters that look like ASCII but are different Unicode codepoints',
        pattern: /[\u0410\u0412\u0415\u041A\u041C\u041D\u041E\u0420\u0421\u0422\u0425]/,
    },
    {
        id: 'UC004',
        category: 'unicode-steganography',
        severity: 'low',
        title: 'Invisible separator characters',
        description: 'Unicode separator characters that may hide content',
        pattern: /[\u2028\u2029\u00A0\u2000-\u200A]/,
    },
];

/**
 * Get rules by category
 */
export function getRulesByCategory(category: string): ScannerRule[] {
    return SCANNER_RULES.filter(r => r.category === category);
}

/**
 * Get rule by ID
 */
export function getRuleById(id: string): ScannerRule | undefined {
    return SCANNER_RULES.find(r => r.id === id);
}

/**
 * Get all categories
 */
export function getCategories(): string[] {
    return [...new Set(SCANNER_RULES.map(r => r.category))];
}

/**
 * Create empty scan result
 */
export function createEmptyScanResult(): ScanResult {
    return {
        findings: [],
        filesScanned: 0,
        summary: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
            total: 0,
        },
    };
}
