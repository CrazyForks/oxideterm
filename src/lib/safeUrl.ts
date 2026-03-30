// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Safe URL Handler for Terminal Links
 * 
 * 提供安全的 URL 打开功能，防止恶意协议执行。
 * 
 * 安全措施：
 * 1. 只允许 http/https 协议
 * 2. 过滤危险协议（file://, javascript:, data:）
 * 3. 处理终端换行导致的 URL 断裂
 */

import { openUrl } from '@tauri-apps/plugin-opener';

/** 允许的安全协议 */
const SAFE_PROTOCOLS = ['http:', 'https:'];

/** 危险协议黑名单 */
const DANGEROUS_PROTOCOLS = [
  'file:',
  'javascript:',
  'data:',
  'vbscript:',
  'about:',
  'blob:',
];

/**
 * 清理终端换行导致的 URL 断裂
 * 终端会在固定列宽处强制换行，可能导致 URL 中间断开
 */
function cleanTerminalUrl(url: string): string {
  // 移除可能的换行符和多余空格
  return url
    .replace(/[\r\n]+/g, '')  // 移除换行
    .replace(/\s+/g, '')      // 移除空格
    .trim();
}

/**
 * 验证 URL 是否安全
 * @param url 要验证的 URL
 * @returns 验证结果
 */
export function validateUrl(url: string): { safe: boolean; reason?: string } {
  const cleanedUrl = cleanTerminalUrl(url);
  
  // 尝试解析 URL
  let parsed: URL;
  try {
    parsed = new URL(cleanedUrl);
  } catch {
    // 如果解析失败，尝试添加 https:// 前缀
    try {
      parsed = new URL(`https://${cleanedUrl}`);
    } catch {
      return { safe: false, reason: 'Invalid URL format' };
    }
  }
  
  const protocol = parsed.protocol.toLowerCase();
  
  // 检查危险协议
  if (DANGEROUS_PROTOCOLS.some(p => protocol === p)) {
    return { safe: false, reason: `Blocked protocol: ${protocol}` };
  }
  
  // 只允许安全协议
  if (!SAFE_PROTOCOLS.includes(protocol)) {
    return { safe: false, reason: `Unsupported protocol: ${protocol}` };
  }
  
  return { safe: true };
}

/**
 * 安全打开 URL
 * @param url 要打开的 URL
 * @returns Promise<boolean> 是否成功打开
 */
export async function safeOpenUrl(url: string): Promise<boolean> {
  const cleanedUrl = cleanTerminalUrl(url);
  const validation = validateUrl(cleanedUrl);
  
  if (!validation.safe) {
    console.warn(`[SafeUrl] Blocked: ${validation.reason} - ${url}`);
    return false;
  }
  
  try {
    // 确保 URL 有协议前缀
    let finalUrl = cleanedUrl;
    if (!finalUrl.match(/^https?:\/\//i)) {
      finalUrl = `https://${finalUrl}`;
    }
    
    await openUrl(finalUrl);
    return true;
  } catch (e) {
    console.error('[SafeUrl] Failed to open URL:', e);
    return false;
  }
}

/**
 * WebLinksAddon 的 URL 处理回调
 * 用于 xterm.js WebLinksAddon 的 handler 参数
 */
export function terminalLinkHandler(
  _event: MouseEvent,
  uri: string
): void {
  safeOpenUrl(uri);
}
