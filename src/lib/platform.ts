/**
 * 平台检测工具
 * 用于实现平台特定的性能优化
 *
 * 优先使用 navigator.userAgentData（标准替代已废弃的 navigator.platform），
 * 不支持时回退到 navigator.platform。
 */
function detectPlatform(): 'windows' | 'macos' | 'linux' | 'unknown' {
  // 1. navigator.userAgentData (Chromium-based, including Tauri WebView)
  const uad = (navigator as any).userAgentData;
  if (uad?.platform) {
    const p = uad.platform.toLowerCase();
    if (p === 'windows') return 'windows';
    if (p === 'macos') return 'macos';
    if (p === 'linux') return 'linux';
  }
  // 2. Fallback: navigator.platform (deprecated but still available)
  const legacy = (navigator.platform ?? '').toLowerCase();
  if (legacy.includes('win')) return 'windows';
  if (legacy.includes('mac')) return 'macos';
  if (legacy.includes('linux')) return 'linux';
  return 'unknown';
}

const detectedPlatform = detectPlatform();

export const platform = {
  isWindows: detectedPlatform === 'windows',
  isMac: detectedPlatform === 'macos',
  isLinux: detectedPlatform === 'linux',
  detected: detectedPlatform,

  // 调试用
  userAgent: navigator.userAgent,
  language: navigator.language,
};

// 开发环境输出平台信息
if (import.meta.env.DEV) {
  console.log('[Platform]', {
    isWindows: platform.isWindows,
    isMac: platform.isMac,
    isLinux: platform.isLinux,
    detected: platform.detected,
  });
}
