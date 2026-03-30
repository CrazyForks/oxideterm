// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Tauri commands for scroll buffer management

use std::sync::Arc;
use tauri::State;

use serde::Serialize;

use crate::session::{BufferStats, SearchOptions, SearchResult, SessionRegistry, TerminalLine};

/// Response for get_all_buffer_lines with truncation metadata
#[derive(Debug, Clone, Serialize)]
pub struct BufferLinesResponse {
    /// The returned lines (may be a subset if truncated)
    pub lines: Vec<TerminalLine>,
    /// Total lines available in the buffer
    pub total_lines: usize,
    /// Number of lines actually returned
    pub returned_lines: usize,
    /// Whether the result was truncated due to the hard limit
    pub truncated: bool,
}

/// Get scroll buffer contents for a session
#[tauri::command]
pub async fn get_scroll_buffer(
    session_id: String,
    start_line: usize,
    count: usize,
    registry: State<'_, Arc<SessionRegistry>>,
) -> Result<Vec<TerminalLine>, String> {
    let scroll_buffer = registry
        .with_session(&session_id, |entry| entry.scroll_buffer.clone())
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    Ok(scroll_buffer.get_range(start_line, count).await)
}

/// Get scroll buffer statistics
#[tauri::command]
pub async fn get_buffer_stats(
    session_id: String,
    registry: State<'_, Arc<SessionRegistry>>,
) -> Result<BufferStats, String> {
    let scroll_buffer = registry
        .with_session(&session_id, |entry| entry.scroll_buffer.clone())
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    Ok(scroll_buffer.stats().await)
}

/// Clear scroll buffer contents
#[tauri::command]
pub async fn clear_buffer(
    session_id: String,
    registry: State<'_, Arc<SessionRegistry>>,
) -> Result<(), String> {
    let scroll_buffer = registry
        .with_session(&session_id, |entry| entry.scroll_buffer.clone())
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    scroll_buffer.clear().await;
    Ok(())
}

/// Get all lines from scroll buffer (capped at 50,000 to prevent excessive memory use)
#[tauri::command]
pub async fn get_all_buffer_lines(
    session_id: String,
    registry: State<'_, Arc<SessionRegistry>>,
) -> Result<BufferLinesResponse, String> {
    let scroll_buffer = registry
        .with_session(&session_id, |entry| entry.scroll_buffer.clone())
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    // Single-lock cap-aware extraction: only clones up to HARD_LIMIT lines
    // and reads total atomically, avoiding both TOCTOU and full-buffer clone.
    const HARD_LIMIT: usize = 50_000;
    let (lines, total_lines) = scroll_buffer.get_capped(HARD_LIMIT).await;
    let returned_lines = lines.len();
    let truncated = total_lines > returned_lines;
    Ok(BufferLinesResponse {
        lines,
        total_lines,
        returned_lines,
        truncated,
    })
}

/// Search terminal buffer
#[tauri::command]
pub async fn search_terminal(
    session_id: String,
    options: SearchOptions,
    registry: State<'_, Arc<SessionRegistry>>,
) -> Result<SearchResult, String> {
    let scroll_buffer = registry
        .with_session(&session_id, |entry| entry.scroll_buffer.clone())
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    Ok(scroll_buffer.search(options).await)
}

/// Scroll to specific line and get context
#[tauri::command]
pub async fn scroll_to_line(
    session_id: String,
    line_number: usize,
    context_lines: usize,
    registry: State<'_, Arc<SessionRegistry>>,
) -> Result<Vec<TerminalLine>, String> {
    let scroll_buffer = registry
        .with_session(&session_id, |entry| entry.scroll_buffer.clone())
        .ok_or_else(|| format!("Session {} not found", session_id))?;

    // Calculate range: line_number ± context_lines
    let start = line_number.saturating_sub(context_lines);
    let count = context_lines * 2 + 1; // Before + target + after

    Ok(scroll_buffer.get_range(start, count).await)
}

#[cfg(test)]
mod tests {
    // Tests will be added when integrating with registry
}
