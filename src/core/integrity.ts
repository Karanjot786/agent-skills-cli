/**
 * Content integrity hash. The website scan job (scan.mjs) imports this file from dist so lock hashes,
 * item_metrics.content_hash and /advisories.json hashes are identical. Install specs hash JSON.stringify(spec).
 */
import { createHash } from 'crypto';

export function hashText(text: string): string {
    return 'sha256-' + createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}
