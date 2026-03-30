// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * File Manager Utilities
 * Shared utility functions for file management
 */

/**
 * Convert Unix permissions mode (e.g., 0o755) to rwxr-xr-x string
 * @param mode - Unix file mode (32-bit integer)
 * @returns Permission string like "rwxr-xr-x" or "-rw-r--r--"
 */
export function formatUnixPermissions(mode: number): string {
  // Extract the permission bits (last 9 bits)
  const perms = mode & 0o777;
  
  const r = (perm: number, bit: number) => (perm & bit) ? 'r' : '-';
  const w = (perm: number, bit: number) => (perm & bit) ? 'w' : '-';
  const x = (perm: number, bit: number) => (perm & bit) ? 'x' : '-';
  
  return [
    r(perms, 0o400), w(perms, 0o200), x(perms, 0o100), // owner
    r(perms, 0o040), w(perms, 0o020), x(perms, 0o010), // group
    r(perms, 0o004), w(perms, 0o002), x(perms, 0o001), // others
  ].join('');
}

/**
 * Format Unix permissions mode as octal string
 * @param mode - Unix file mode
 * @returns Octal string like "755" or "644"
 */
export function formatOctalPermissions(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, '0');
}

/**
 * Format file size in human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted string like "1.5 KB" or "2.3 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Format Unix timestamp to localized date string
 * @param timestamp - Unix timestamp in seconds
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatTimestamp(
  timestamp: number | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
): string {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleString(undefined, options);
}

/**
 * Format timestamp to relative time (e.g., "2 hours ago")
 * @param timestamp - Unix timestamp in seconds
 * @returns Relative time string
 */
export function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return '-';
  
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  
  return formatTimestamp(timestamp, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Get Prism.js language identifier from file extension
 * @param ext - File extension (without dot)
 * @param filename - Optional filename for special cases
 * @returns Prism language identifier
 */
export function getPrismLanguage(ext: string, filename?: string): string {
  // Special filename mappings (shell configs, etc.)
  const filenameMap: Record<string, string> = {
    '.bashrc': 'bash',
    '.bash_profile': 'bash',
    '.bash_login': 'bash',
    '.bash_logout': 'bash',
    '.bash_aliases': 'bash',
    '.zshrc': 'bash',
    '.zprofile': 'bash',
    '.zshenv': 'bash',
    '.zlogin': 'bash',
    '.zlogout': 'bash',
    '.profile': 'bash',
    '.cshrc': 'bash',
    '.tcshrc': 'bash',
    '.kshrc': 'bash',
    '.gitignore': 'gitignore',
    '.gitconfig': 'git',
    '.gitattributes': 'git',
    '.gitmodules': 'git',
    '.dockerignore': 'docker',
    '.editorconfig': 'ini',
    '.npmrc': 'ini',
    '.yarnrc': 'yaml',
    'Dockerfile': 'docker',
    'Makefile': 'makefile',
    'CMakeLists.txt': 'cmake',
    '.env': 'bash',
    '.env.local': 'bash',
    '.env.development': 'bash',
    '.env.production': 'bash',
    '.env.test': 'bash',
    '.htaccess': 'apacheconf',
    '.eslintrc': 'json',
    '.prettierrc': 'json',
    'tsconfig.json': 'json',
    'package.json': 'json',
    'composer.json': 'json',
  };
  
  if (filename) {
    // Exact match
    if (filenameMap[filename]) {
      return filenameMap[filename];
    }
    
    // Handle dotfiles with extensions like .zshrc.pre-oh-my-zsh or .bashrc.backup
    // Check if the base name (before first .) matches a shell config pattern
    const baseName = filename.startsWith('.') 
      ? '.' + filename.slice(1).split('.')[0]  // .zshrc from .zshrc.pre-oh-my-zsh
      : filename.split('.')[0];
    
    if (filenameMap[baseName]) {
      return filenameMap[baseName];
    }
    
    // Pattern-based detection for shell-related dotfiles
    const shellPatterns = [
      /^\.(bash|zsh|sh|csh|tcsh|ksh|fish)/i,
      /^\.?(profile|login|logout|aliases)/i,
      /rc$/i,  // Matches .zshrc, .bashrc, etc.
    ];
    
    if (filename.startsWith('.') && shellPatterns.some(p => p.test(filename))) {
      return 'bash';
    }
  }
  
  // Extension mappings
  const extMap: Record<string, string> = {
    // Web
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'vue': 'markup',
    'svelte': 'markup',
    
    // Data formats
    'json': 'json',
    'json5': 'json5',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'xml': 'xml',
    'csv': 'csv',
    'ini': 'ini',
    
    // Programming languages
    'py': 'python',
    'rb': 'ruby',
    'rs': 'rust',
    'go': 'go',
    'java': 'java',
    'kt': 'kotlin',
    'scala': 'scala',
    'swift': 'swift',
    'c': 'c',
    'h': 'c',
    'cpp': 'cpp',
    'hpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'lua': 'lua',
    'r': 'r',
    'dart': 'dart',
    'zig': 'zig',
    'nim': 'nim',
    'ex': 'elixir',
    'exs': 'elixir',
    'erl': 'erlang',
    'clj': 'clojure',
    'hs': 'haskell',
    'ml': 'ocaml',
    'fs': 'fsharp',
    'pl': 'perl',
    'pm': 'perl',
    
    // Shell/Scripts
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'fish': 'bash',
    'ps1': 'powershell',
    'psm1': 'powershell',
    'bat': 'batch',
    'cmd': 'batch',
    
    // Config/Build
    'dockerfile': 'docker',
    'makefile': 'makefile',
    'cmake': 'cmake',
    'gradle': 'groovy',
    'groovy': 'groovy',
    
    // Documentation
    'md': 'markdown',
    'mdx': 'markdown',
    'rst': 'rest',
    'tex': 'latex',
    
    // Database
    'sql': 'sql',
    'pgsql': 'sql',
    'mysql': 'sql',
    
    // Others
    'diff': 'diff',
    'patch': 'diff',
    'log': 'log',
    'txt': 'plain',
    'graphql': 'graphql',
    'gql': 'graphql',
    'proto': 'protobuf',
    'asm': 'nasm',
    's': 'nasm',
    'wasm': 'wasm',
  };
  
  return extMap[ext.toLowerCase()] || 'plain';
}

/**
 * Get file extension from filename (handles dotfiles)
 * @param filename - File name
 * @returns Extension without dot, or empty string
 */
export function getFileExtension(filename: string): string {
  // Handle dotfiles like .zshrc (no extension)
  if (filename.startsWith('.') && !filename.slice(1).includes('.')) {
    return '';
  }
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Normalize file path to avoid double slashes and trailing slashes
 * @param path - File path
 * @returns Normalized path
 */
export function normalizePath(path: string): string {
  // Replace multiple slashes with single slash (except for protocol like file://)
  let normalized = path.replace(/([^:])\/+/g, '$1/');
  // Remove trailing slash (except for root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
