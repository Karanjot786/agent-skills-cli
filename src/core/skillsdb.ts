/**
 * Skills Database Client
 * Fetches skills from our Supabase-powered API
 * 
 * Note: The API URL is embedded at build time using esbuild define
 */

// Build-time constant - replaced during esbuild
declare const __SKILLS_API_URL__: string | undefined;

// Fallback for development (will be replaced in production build)
const SKILLS_API = typeof __SKILLS_API_URL__ !== 'undefined'
    ? __SKILLS_API_URL__
    : 'https://www.agentskills.in/api/skills';

export interface DBSkill {
    id: string;
    name: string;
    author: string;
    scoped_name: string;
    description: string;
    stars: number;
    forks: number;
    github_url: string;
    raw_url: string;
    repo_full_name: string;
    path: string;
    branch: string;
    author_avatar: string;
    assets: Asset[];
    content?: string;
    has_assets: boolean;
    folder_url?: string;
}

export interface Asset {
    name: string;
    rawUrl: string;
    size: number;
}

export interface SkillsDBResult {
    skills: DBSkill[];
    total: number;
}

export interface FetchOptions {
    search?: string;
    author?: string;
    category?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'stars' | 'recent' | 'name';
}

/**
 * Parse a scoped name into author and name parts
 * Supports: @author/name, author/name, or just name
 */
export function parseScopedName(input: string): { author?: string; name: string } {
    const clean = input.replace(/^@/, '').trim();

    if (clean.includes('/')) {
        const [author, ...nameParts] = clean.split('/');
        return {
            author: author.trim(),
            name: nameParts.join('/').trim()
        };
    }

    return { name: clean };
}

/**
 * Fetch skills from the database API
 */
export async function fetchFromDB(options: FetchOptions = {}): Promise<SkillsDBResult> {
    const params = new URLSearchParams();

    if (options.search) params.set('search', options.search);
    if (options.author) params.set('author', options.author);
    if (options.category) params.set('category', options.category);
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.offset) params.set('offset', options.offset.toString());
    if (options.sortBy) params.set('sortBy', options.sortBy);

    try {
        const res = await fetch(`${SKILLS_API}?${params}`, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'agent-skills-cli'
            }
        });

        if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
        }

        return await res.json() as SkillsDBResult;
    } catch (error) {
        throw new Error(`Failed to fetch skills: ${error}`);
    }
}

/**
 * Get a specific skill by scoped name
 * Returns exact match for @author/name, or first match for just name
 */
export async function getSkillByScoped(scopedName: string): Promise<DBSkill | null> {
    const { author, name } = parseScopedName(scopedName);

    // Try exact name lookup first (works even for authors with thousands of skills)
    const params = new URLSearchParams();
    params.set('name', name);
    if (author) params.set('author', author);
    params.set('limit', '10');

    try {
        const res = await fetch(`${SKILLS_API}?${params}`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'agent-skills-cli' }
        });
        if (res.ok) {
            const result = await res.json() as SkillsDBResult;
            const exactMatch = result.skills.find(s =>
                s.name.toLowerCase() === name.toLowerCase() &&
                (!author || s.author.toLowerCase() === author.toLowerCase())
            );
            if (exactMatch) return exactMatch;
        }
    } catch { /* fall through to fuzzy search */ }

    // Fallback: fuzzy search
    const result = await fetchFromDB({ search: name, author, limit: 50, sortBy: 'stars' });

    const exactMatch = result.skills.find(s =>
        s.name.toLowerCase() === name.toLowerCase() &&
        (!author || s.author.toLowerCase() === author.toLowerCase())
    );

    if (exactMatch) return exactMatch;
    if (author) return null;
    return result.skills[0] || null;
}

/**
 * Search skills with optional author filter
 */
export async function searchSkillsDB(
    query: string,
    options: Omit<FetchOptions, 'search'> = {}
): Promise<SkillsDBResult> {
    return fetchFromDB({ search: query, ...options });
}

/**
 * Get skills by author
 */
export async function getSkillsByAuthor(
    author: string,
    options: Omit<FetchOptions, 'author'> = {}
): Promise<SkillsDBResult> {
    return fetchFromDB({ author, ...options });
}

/**
 * Marketplace-compatible skill format (matches fetchSkillsMP output)
 * Used for CLI compatibility
 */
export interface MarketplaceCompatibleSkill {
    name: string;
    description: string;
    author: string;
    stars: number;
    forks: number;
    githubUrl: string;
    rawUrl: string;
    path: string;
    branch: string;
    // Extra fields from our DB
    scopedName: string;
    hasAssets: boolean;
    authorAvatar?: string;
}

export interface MarketplaceFetchResult {
    skills: MarketplaceCompatibleSkill[];
    total: number;
    hasNext: boolean;
    page: number;
}

/**
 * Unified fetch function for CLI - returns data in SkillsMP-compatible format
 * This is the primary function the CLI should use for marketplace operations
 */
export async function fetchSkillsForCLI(options: {
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: 'stars' | 'recent' | 'name';
} = {}): Promise<MarketplaceFetchResult> {
    const { search = '', page = 1, limit = 50, sortBy = 'stars' } = options;

    // Convert page to offset for our API
    const offset = (page - 1) * limit;

    const result = await fetchFromDB({
        search: search || undefined,
        limit,
        offset,
        sortBy
    });

    // Convert DBSkill to MarketplaceCompatibleSkill
    // Handle both camelCase (API response) and snake_case (DBSkill interface) field names
    const skills: MarketplaceCompatibleSkill[] = result.skills.map((s: any) => ({
        name: s.name,
        description: s.description || '',
        author: s.author,
        stars: s.stars || 0,
        forks: s.forks || 0,
        githubUrl: s.githubUrl || s.github_url || '',
        rawUrl: s.rawUrl || s.raw_url || '',
        path: s.path,
        branch: s.branch || 'main',
        scopedName: s.scopedName || s.scoped_name || `@${s.author}/${s.name}`,
        hasAssets: s.hasAssets ?? s.has_assets ?? false,
        authorAvatar: s.authorAvatar || s.author_avatar || ''
    }));

    const hasNext = offset + skills.length < result.total;

    return {
        skills,
        total: result.total,
        hasNext,
        page
    };
}

/**
 * Search skills from our database - CLI-compatible version
 */
export async function searchSkillsForCLI(
    query: string,
    limit = 20
): Promise<MarketplaceCompatibleSkill[]> {
    const result = await fetchSkillsForCLI({ search: query, limit, sortBy: 'stars' });
    return result.skills;
}

// ============================================
// GitHub URL Helpers (moved from skillsmp.ts)
// ============================================

/**
 * Extract GitHub path from URL
 */
function extractGitHubPath(url: string): string {
    // https://github.com/owner/repo/tree/branch/path -> path
    const match = url.match(/github\.com\/[^/]+\/[^/]+\/tree\/[^/]+\/(.+)/);
    return match ? match[1] : '';
}

/**
 * Extract repo name from GitHub URL
 */
function extractRepoName(url: string): string {
    const match = url.match(/github\.com\/[^/]+\/([^/]+)/);
    return match ? match[1] : '';
}

/**
 * Extract owner from GitHub URL
 */
function extractOwner(url: string): string {
    const match = url.match(/github\.com\/([^/]+)/);
    return match ? match[1] : '';
}

/**
 * Extract branch from GitHub URL
 */
function extractBranch(url: string): string {
    const match = url.match(/github\.com\/[^/]+\/[^/]+\/tree\/([^/]+)/);
    return match ? match[1] : 'main';
}

/**
 * Install a skill directly from a GitHub URL
 */
export async function installFromGitHubUrl(
    githubUrl: string,
    installDir: string
): Promise<{ name: string; path: string }> {
    const owner = extractOwner(githubUrl);
    const repo = extractRepoName(githubUrl);
    const branch = extractBranch(githubUrl);
    const skillPath = extractGitHubPath(githubUrl);

    if (!owner || !repo || !skillPath) {
        throw new Error(`Invalid GitHub URL: ${githubUrl}`);
    }

    // Get skill name from path (last segment)
    const skillName = skillPath.split('/').pop() || 'skill';
    const destPath = `${installDir}/${skillName}`;

    const { mkdir, writeFile } = await import('fs/promises');
    await mkdir(destPath, { recursive: true });

    // Fetch all files in the skill directory via GitHub Trees API
    const treeRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        { headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'agent-skills-cli' } }
    );

    if (treeRes.ok) {
        const treeData = await treeRes.json() as { tree: Array<{ type: string; path: string }> };
        const skillFiles = treeData.tree.filter(
            f => f.type === 'blob' && f.path.startsWith(skillPath + '/')
        );

        for (const file of skillFiles) {
            const relativePath = file.path.slice(skillPath.length + 1);
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
            const fileRes = await fetch(rawUrl);
            if (!fileRes.ok) continue;

            const content = await fileRes.arrayBuffer();
            const filePath = `${destPath}/${relativePath}`;

            // Create subdirectory if needed
            const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
            if (fileDir !== destPath) {
                await mkdir(fileDir, { recursive: true });
            }

            await writeFile(filePath, Buffer.from(content));
        }

        if (skillFiles.length > 0) {
            return { name: skillName, path: destPath };
        }
    }

    // Fallback: fetch only SKILL.md if tree API failed or returned no files
    const skillMdUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}/SKILL.md`;
    const response = await fetch(skillMdUrl);

    if (!response.ok) {
        throw new Error(`Could not fetch SKILL.md from ${skillMdUrl}`);
    }

    await writeFile(`${destPath}/SKILL.md`, await response.text());

    return { name: skillName, path: destPath };
}
