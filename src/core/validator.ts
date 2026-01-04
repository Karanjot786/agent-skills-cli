/**
 * Skill Validator Module
 * Validates skills against the Agent Skills specification
 */

import type {
    SkillMetadata,
    ValidationResult,
    ValidationError,
    ValidationWarning
} from '../types/index.js';

/**
 * Reserved words that cannot be used in skill names
 */
const RESERVED_WORDS = ['anthropic', 'claude', 'google', 'openai'];

/**
 * Regex pattern for valid skill names
 * - Lowercase letters, numbers, and hyphens only
 * - Cannot start or end with hyphen
 * - No consecutive hyphens
 */
const NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Validate skill metadata against the Agent Skills specification
 */
export function validateMetadata(metadata: Partial<SkillMetadata>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate name (required)
    if (!metadata.name) {
        errors.push({
            field: 'name',
            message: 'Name is required'
        });
    } else {
        // Check length
        if (metadata.name.length > 64) {
            errors.push({
                field: 'name',
                message: 'Name must be 64 characters or less',
                value: metadata.name.length
            });
        }

        // Check pattern
        if (!NAME_PATTERN.test(metadata.name)) {
            errors.push({
                field: 'name',
                message: 'Name must contain only lowercase letters, numbers, and hyphens. Cannot start/end with hyphen or have consecutive hyphens.',
                value: metadata.name
            });
        }

        // Check reserved words
        for (const word of RESERVED_WORDS) {
            if (metadata.name.toLowerCase().includes(word)) {
                errors.push({
                    field: 'name',
                    message: `Name cannot contain reserved word: ${word}`,
                    value: metadata.name
                });
            }
        }

        // Check for XML tags
        if (/<[^>]+>/.test(metadata.name)) {
            errors.push({
                field: 'name',
                message: 'Name cannot contain XML tags',
                value: metadata.name
            });
        }
    }

    // Validate description (required)
    if (!metadata.description) {
        errors.push({
            field: 'description',
            message: 'Description is required'
        });
    } else {
        // Check length
        if (metadata.description.length > 1024) {
            errors.push({
                field: 'description',
                message: 'Description must be 1024 characters or less',
                value: metadata.description.length
            });
        }

        // Check for XML tags
        if (/<[^>]+>/.test(metadata.description)) {
            errors.push({
                field: 'description',
                message: 'Description cannot contain XML tags'
            });
        }

        // Warn if description is too short
        if (metadata.description.length < 50) {
            warnings.push({
                field: 'description',
                message: 'Description is short. Consider adding more detail about when to use this skill.',
                value: metadata.description.length
            });
        }
    }

    // Validate optional compatibility field
    if (metadata.compatibility && metadata.compatibility.length > 500) {
        errors.push({
            field: 'compatibility',
            message: 'Compatibility must be 500 characters or less',
            value: metadata.compatibility.length
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validate the body content of a skill
 */
export function validateBody(body: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check if body is empty
    if (!body || body.trim().length === 0) {
        warnings.push({
            field: 'body',
            message: 'Skill body is empty. Consider adding instructions.'
        });
    }

    // Count lines
    const lineCount = body.split('\n').length;
    if (lineCount > 500) {
        warnings.push({
            field: 'body',
            message: `Skill body has ${lineCount} lines. Consider using progressive disclosure (splitting into separate files) for optimal performance.`,
            value: lineCount
        });
    }

    // Estimate tokens (rough: ~4 chars per token)
    const estimatedTokens = Math.ceil(body.length / 4);
    if (estimatedTokens > 5000) {
        warnings.push({
            field: 'body',
            message: `Skill body is large (~${estimatedTokens} tokens). This may consume significant context when activated.`,
            value: estimatedTokens
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Format validation result for display
 */
export function formatValidationResult(
    result: ValidationResult,
    skillName?: string
): string {
    const lines: string[] = [];

    if (skillName) {
        lines.push(`Validation result for: ${skillName}`);
        lines.push('─'.repeat(40));
    }

    if (result.valid) {
        lines.push('✓ Valid');
    } else {
        lines.push('✗ Invalid');
    }

    if (result.errors.length > 0) {
        lines.push('\nErrors:');
        for (const error of result.errors) {
            lines.push(`  ✗ ${error.field}: ${error.message}`);
        }
    }

    if (result.warnings.length > 0) {
        lines.push('\nWarnings:');
        for (const warning of result.warnings) {
            lines.push(`  ⚠ ${warning.field}: ${warning.message}`);
        }
    }

    return lines.join('\n');
}
