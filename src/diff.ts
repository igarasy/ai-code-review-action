import { minimatch } from 'minimatch';

// Turns the per-file patches returned by the GitHub API into
//  1. text for the model, with the new-file line number on every line, and
//  2. the set of lines GitHub accepts review comments on (RIGHT side).

export interface PrFile {
  filename: string;
  status: string;
  patch?: string | undefined;
  additions: number;
  deletions: number;
}

export interface FileDiff {
  path: string;
  status: string;
  /** New-file line numbers that appear in the diff (added or context). */
  commentable: Set<number>;
  /** New-file lines that were added. */
  added: Set<number>;
  rendered: string;
}

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parsePatch(path: string, status: string, patch: string): FileDiff {
  const commentable = new Set<number>();
  const added = new Set<number>();
  const out: string[] = [];
  let newLine = 0;

  for (const line of patch.split('\n')) {
    const hunk = HUNK_RE.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      out.push(line);
      continue;
    }
    if (line.startsWith('\\')) continue; // "\ No newline at end of file"
    const mark = line[0];
    const text = line.slice(1);
    if (mark === '+') {
      commentable.add(newLine);
      added.add(newLine);
      out.push(`${String(newLine).padStart(5)} + ${text}`);
      newLine++;
    } else if (mark === '-') {
      out.push(`      - ${text}`);
    } else {
      commentable.add(newLine);
      out.push(`${String(newLine).padStart(5)}   ${text}`);
      newLine++;
    }
  }
  return { path, status, commentable, added, rendered: out.join('\n') };
}

export interface SelectedDiff {
  files: FileDiff[];
  /** Files left out, with the reason, so the summary can be honest about coverage. */
  skipped: Array<{ path: string; reason: 'excluded' | 'no-patch' | 'budget' | 'removed' }>;
  text: string;
}

export function selectFiles(prFiles: PrFile[], opts: { include: string[]; exclude: string[]; maxChars: number }): SelectedDiff {
  const skipped: SelectedDiff['skipped'] = [];
  const candidates: FileDiff[] = [];
  const match = (p: string, globs: string[]) => globs.some((g) => minimatch(p, g, { dot: true, nocase: true }));

  for (const f of prFiles) {
    if (f.status === 'removed') { skipped.push({ path: f.filename, reason: 'removed' }); continue; }
    if (match(f.filename, opts.exclude) || (opts.include.length > 0 && !match(f.filename, opts.include))) {
      skipped.push({ path: f.filename, reason: 'excluded' });
      continue;
    }
    if (!f.patch) { skipped.push({ path: f.filename, reason: 'no-patch' }); continue; }
    candidates.push(parsePatch(f.filename, f.status, f.patch));
  }

  // Smaller files first: more files reviewed for the same budget.
  candidates.sort((a, b) => a.rendered.length - b.rendered.length);
  const files: FileDiff[] = [];
  let used = 0;
  for (const c of candidates) {
    const block = fileBlock(c);
    if (used + block.length > opts.maxChars) { skipped.push({ path: c.path, reason: 'budget' }); continue; }
    files.push(c);
    used += block.length;
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped, text: files.map(fileBlock).join('\n') };
}

// Paths are rendered as data: anything that could close the wrapper tag is escaped.
const fileBlock = (f: FileDiff): string =>
  `<file path="${f.path.replace(/[<>"&]/g, '_')}" status="${f.status}">\n${f.rendered.replaceAll('</file>', '<\\/file>').replaceAll('</diff>', '<\\/diff>')}\n</file>\n`;
