/**
 * Run external commands without a shell.
 *
 * Repo URLs, branches and commit SHAs come from lockfiles, marketplace data and
 * user input. Passing them as argument arrays means `;`, `$(...)` and quotes are
 * never interpreted, and `--` before a URL stops values such as
 * `--upload-pack=...` from being read as git options.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

export const execFileAsync = promisify(execFile);

type RunOptions = { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv };

/** Branch, tag or commit names only. Rejects option-like and shell-like values. */
export function assertRef(ref: string): string {
    if (!/^[A-Za-z0-9._/-]+$/.test(ref) || ref.startsWith('-')) {
        throw new Error(`Invalid git ref: ${ref}`);
    }
    return ref;
}

export function git(args: string[], opts: RunOptions = {}) {
    return execFileAsync('git', args, opts);
}

export function gitClone(
    url: string,
    dir: string,
    opts: RunOptions & { depth?: number; branch?: string } = {}
) {
    const args = ['clone'];
    if (opts.depth) args.push('--depth', String(opts.depth));
    if (opts.branch) args.push('--branch', assertRef(opts.branch));
    args.push('--', url, dir);
    return git(args, { cwd: opts.cwd, timeout: opts.timeout, env: opts.env });
}
