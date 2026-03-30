// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { LanguageSupport } from '@codemirror/language';

/**
 * 动态加载 CodeMirror 语言包
 *
 * The Oxide Way: 按需加载，不打包未使用的语言
 * 核心包 ~150KB，每个语言包 ~10-50KB
 */
export async function loadLanguage(lang: string): Promise<LanguageSupport | null> {
  try {
    switch (lang) {
      // Web 语言
      case 'javascript':
      case 'jsx':
        return (await import('@codemirror/lang-javascript')).javascript({ jsx: true });
      case 'typescript':
      case 'tsx':
        return (await import('@codemirror/lang-javascript')).javascript({
          jsx: true,
          typescript: true,
        });
      case 'html':
        return (await import('@codemirror/lang-html')).html();
      case 'css':
      case 'scss':
      case 'less':
        return (await import('@codemirror/lang-css')).css();

      // 系统语言
      case 'python':
        return (await import('@codemirror/lang-python')).python();
      case 'rust':
        return (await import('@codemirror/lang-rust')).rust();
      case 'go':
        return (await import('@codemirror/lang-go')).go();
      case 'cpp':
      case 'c':
      case 'h':
      case 'hpp':
      case 'cxx':
        return (await import('@codemirror/lang-cpp')).cpp();
      case 'java':
        return (await import('@codemirror/lang-java')).java();

      // 配置/数据格式
      case 'json':
      case 'jsonc':
        return (await import('@codemirror/lang-json')).json();
      case 'yaml':
      case 'yml':
        return (await import('@codemirror/lang-yaml')).yaml();
      case 'xml':
      case 'svg':
      case 'xsl':
        return (await import('@codemirror/lang-xml')).xml();
      case 'markdown':
      case 'md':
        return (await import('@codemirror/lang-markdown')).markdown();

      // Shell & DevOps
      case 'shell':
      case 'bash':
      case 'sh':
      case 'zsh':
      case 'shellscript': {
        const { StreamLanguage } = await import('@codemirror/language');
        const { shell } = await import('@codemirror/legacy-modes/mode/shell');
        return new LanguageSupport(StreamLanguage.define(shell));
      }

      case 'dockerfile': {
        const { StreamLanguage } = await import('@codemirror/language');
        const { dockerFile } = await import('@codemirror/legacy-modes/mode/dockerfile');
        return new LanguageSupport(StreamLanguage.define(dockerFile));
      }

      case 'nginx': {
        const { StreamLanguage } = await import('@codemirror/language');
        const { nginx } = await import('@codemirror/legacy-modes/mode/nginx');
        return new LanguageSupport(StreamLanguage.define(nginx));
      }

      case 'toml': {
        const { StreamLanguage } = await import('@codemirror/language');
        const { toml } = await import('@codemirror/legacy-modes/mode/toml');
        return new LanguageSupport(StreamLanguage.define(toml));
      }

      // Database
      case 'sql':
        return (await import('@codemirror/lang-sql')).sql();

      // PHP
      case 'php':
        return (await import('@codemirror/lang-php')).php();

      // Ruby (legacy mode)
      case 'ruby':
      case 'rb': {
        const { StreamLanguage } = await import('@codemirror/language');
        const { ruby } = await import('@codemirror/legacy-modes/mode/ruby');
        return new LanguageSupport(StreamLanguage.define(ruby));
      }

      // Perl (legacy mode)
      case 'perl':
      case 'pl': {
        const { StreamLanguage } = await import('@codemirror/language');
        const { perl } = await import('@codemirror/legacy-modes/mode/perl');
        return new LanguageSupport(StreamLanguage.define(perl));
      }

      // Lua (legacy mode)
      case 'lua': {
        const { StreamLanguage } = await import('@codemirror/language');
        const { lua } = await import('@codemirror/legacy-modes/mode/lua');
        return new LanguageSupport(StreamLanguage.define(lua));
      }

      // R (legacy mode)
      case 'r': {
        const { StreamLanguage } = await import('@codemirror/language');
        const { r } = await import('@codemirror/legacy-modes/mode/r');
        return new LanguageSupport(StreamLanguage.define(r));
      }

      // Common Lisp (legacy mode)
      case 'lisp':
      case 'commonlisp':
      case 'cl': {
        const { StreamLanguage } = await import('@codemirror/language');
        const { commonLisp } = await import('@codemirror/legacy-modes/mode/commonlisp');
        return new LanguageSupport(StreamLanguage.define(commonLisp));
      }

      // Diff
      case 'diff':
      case 'patch': {
        const { StreamLanguage } = await import('@codemirror/language');
        const { diff } = await import('@codemirror/legacy-modes/mode/diff');
        return new LanguageSupport(StreamLanguage.define(diff));
      }

      default:
        console.log(`[CodeMirror] No language support for: ${lang}, using plaintext`);
        return null;
    }
  } catch (e) {
    console.error(`[CodeMirror] Failed to load language: ${lang}`, e);
    return null;
  }
}

/**
 * 从文件扩展名推断 CodeMirror 语言标识符
 * 复用后端 get_language_from_extension() 的返回值
 */
export function normalizeLanguage(backendLanguage: string | null): string {
  if (!backendLanguage) return 'plaintext';

  const lang = backendLanguage.toLowerCase();

  // 后端返回的语言名可能需要映射
  const mapping: Record<string, string> = {
    'c++': 'cpp',
    'c#': 'csharp',
    'objective-c': 'cpp',
    'objective-c++': 'cpp',
    makefile: 'shell',
    cmake: 'shell',
    powershell: 'shell',
    'f#': 'fsharp',
  };

  return mapping[lang] || lang;
}

/**
 * 获取语言的显示名称
 */
export function getLanguageDisplayName(lang: string): string {
  const displayNames: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    jsx: 'JSX',
    tsx: 'TSX',
    python: 'Python',
    rust: 'Rust',
    go: 'Go',
    cpp: 'C++',
    c: 'C',
    java: 'Java',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    less: 'LESS',
    json: 'JSON',
    jsonc: 'JSON with Comments',
    yaml: 'YAML',
    xml: 'XML',
    markdown: 'Markdown',
    sql: 'SQL',
    php: 'PHP',
    ruby: 'Ruby',
    perl: 'Perl',
    lua: 'Lua',
    r: 'R',
    shell: 'Shell',
    bash: 'Bash',
    dockerfile: 'Dockerfile',
    nginx: 'Nginx',
    toml: 'TOML',
    diff: 'Diff',
    plaintext: 'Plain Text',
  };

  return displayNames[lang.toLowerCase()] || lang;
}
