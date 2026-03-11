/**
 * AI Tool Definitions
 *
 * Defines the built-in tools available to AI models for agentic interactions.
 * Each tool has a JSON Schema definition that gets sent to the provider API.
 */

import type { AiToolDefinition } from '../providers';

// ═══════════════════════════════════════════════════════════════════════════
// Tool Definitions
// ═══════════════════════════════════════════════════════════════════════════

export const BUILTIN_TOOLS: AiToolDefinition[] = [
  {
    name: 'terminal_exec',
    description:
      'Execute a shell command on the connected remote server (or local terminal) and return stdout/stderr. Use this for running shell commands, inspecting system state, building projects, etc.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command. Optional.',
        },
        timeout_secs: {
          type: 'number',
          minimum: 1,
          maximum: 60,
          description: 'Timeout in seconds. Default: 30. Max: 60.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description:
      'Read the contents of a file on the remote server. Returns the file content as text. Best for source code, config files, and other text files.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the file to read.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write content to a file on the remote server. Creates the file if it does not exist, overwrites if it does.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the file to write.',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description:
      'List files and directories at the given path on the remote server. Returns a recursive directory tree.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the directory to list.',
        },
        max_depth: {
          type: 'number',
          minimum: 1,
          maximum: 8,
          description: 'Maximum recursion depth. Default: 3. Max: 8.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'grep_search',
    description:
      'Search for a text pattern across files in a directory on the remote server. Returns matching lines with file paths and line numbers.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Search pattern (regex supported).',
        },
        path: {
          type: 'string',
          description: 'Directory path to search in.',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Whether the search is case-sensitive. Default: false.',
        },
        max_results: {
          type: 'number',
          minimum: 1,
          maximum: 200,
          description: 'Maximum number of matches to return. Default: 50. Max: 200.',
        },
      },
      required: ['pattern', 'path'],
    },
  },
  {
    name: 'git_status',
    description:
      'Get the git status of a repository on the remote server. Returns the current branch and list of modified/untracked files.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the git repository root.',
        },
      },
      required: ['path'],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Safety Classification
// ═══════════════════════════════════════════════════════════════════════════

/** Tools that only read data — safe for auto-approve */
export const READ_ONLY_TOOLS = new Set([
  'read_file',
  'list_directory',
  'grep_search',
  'git_status',
]);

/** Tools that modify state — require explicit user approval */
export const WRITE_TOOLS = new Set([
  'terminal_exec',
  'write_file',
]);

/**
 * Command deny-list for terminal_exec safety.
 * These patterns are checked against the command string before execution.
 * If any pattern matches, the command is rejected without prompting the user.
 *
 * NOTE: Deny-lists are fundamentally incomplete. This is a defense-in-depth
 * measure, not a security boundary. The real boundary is user approval.
 */
export const COMMAND_DENY_LIST: RegExp[] = [
  // ── Destructive filesystem ──
  /\brm\s+.*\s+\/(\s|$|\*)/,            // rm ... / or rm ... /*
  /\brm\s+(-[a-zA-Z]*)*\s*--no-preserve-root/, // rm --no-preserve-root
  /\bmkfs\b/,                           // mkfs (format disk)
  /\bdd\s+if=/,                         // dd if= (raw disk write)
  /\bfdisk\b/,                          // fdisk (partition table)
  /\bchmod\s+777\s+\//,                 // chmod 777 /
  /\bchown\s+-R\s+.*\s+\//,            // chown -R ... /

  // ── Privilege escalation ──
  /\bsudo\b/,                           // sudo
  /\bdoas\b/,                           // doas (OpenBSD)
  /\bpkexec\b/,                         // pkexec (Polkit)
  /\brunuser\b/,                        // runuser (systemd)
  /\brun0\b/,                           // run0 (systemd)
  /\bsu\s+-?c\b/,                       // su -c "command"

  // ── System control ──
  /\bshutdown\b/,                       // shutdown
  /\breboot\b/,                         // reboot
  /\bhalt\b/,                           // halt
  /\bpoweroff\b/,                       // poweroff
  /\bsystemctl\s+(disable|mask)\b/,     // systemctl disable/mask

  // ── Resource exhaustion ──
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/, // fork bomb

  // ── Network ──
  /\biptables\s+-F\b/,                  // iptables -F (flush all rules)

  // ── Remote code execution via pipe ──
  /\b(?:curl|wget)\b[^\n]*\|\s*(?:sh|bash|zsh)\b/, // curl/wget | sh
  /\b(?:curl|wget)\b[^\n]*-[oO]\s*[^\s]+.*;\s*(?:sh|bash|zsh)\b/, // curl -o file; sh file

  // ── Encoding / obfuscation bypass ──
  /\bbase64\b[^\n]*\|\s*(?:sh|bash|zsh)\b/, // base64 decode | sh
  /\bprintf\b[^\n]*\|\s*(?:sh|bash|zsh)\b/, // printf | sh
  /\becho\b[^\n]*\|\s*(?:sh|bash|zsh)\b/,   // echo ... | sh

  // ── Dangerous builtins ──
  /\beval\b/,                           // eval (arbitrary code execution)
  /(?:^|[;&|]\s*)exec\s/,               // exec at command position (replaces shell process)
  /\bsource\s/,                         // source (execute file in current shell)
];

/**
 * Check if a command is in the deny-list.
 */
export function isCommandDenied(command: string): boolean {
  return COMMAND_DENY_LIST.some((pattern) => pattern.test(command));
}
