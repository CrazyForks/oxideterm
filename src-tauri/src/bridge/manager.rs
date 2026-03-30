// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Bridge Manager - manages all active WebSocket bridges

use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::ssh::SessionCommand;

/// Information about an active bridge
#[derive(Debug, Clone)]
pub struct BridgeInfo {
    pub session_id: String,
    pub port: u16,
    /// One-time authentication token to prevent local process hijacking
    pub token: String,
    pub created_at: Instant,
    pub last_activity: Instant,
}

/// Extended bridge info with control channel
pub struct BridgeHandle {
    pub info: BridgeInfo,
    /// Command sender for the SSH session (if extended mode)
    pub cmd_tx: Option<mpsc::Sender<SessionCommand>>,
}

/// Manages all active WebSocket bridges
pub struct BridgeManager {
    bridges: Arc<RwLock<HashMap<String, BridgeHandle>>>,
}

impl BridgeManager {
    pub fn new() -> Self {
        Self {
            bridges: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a new bridge (legacy mode)
    pub fn register(&self, session_id: String, port: u16, token: String) {
        let now = Instant::now();
        let handle = BridgeHandle {
            info: BridgeInfo {
                session_id: session_id.clone(),
                port,
                token,
                created_at: now,
                last_activity: now,
            },
            cmd_tx: None,
        };

        self.bridges.write().insert(session_id.clone(), handle);
        info!("Bridge registered: session={}, port={}", session_id, port);
    }

    /// Register a new bridge with command channel (extended mode)
    pub fn register_extended(
        &self,
        session_id: String,
        port: u16,
        token: String,
        cmd_tx: mpsc::Sender<SessionCommand>,
    ) {
        let now = Instant::now();
        let handle = BridgeHandle {
            info: BridgeInfo {
                session_id: session_id.clone(),
                port,
                token,
                created_at: now,
                last_activity: now,
            },
            cmd_tx: Some(cmd_tx),
        };

        self.bridges.write().insert(session_id.clone(), handle);
        info!(
            "Bridge registered (extended): session={}, port={}",
            session_id, port
        );
    }

    /// Unregister a bridge and send close command if available
    pub fn unregister(&self, session_id: &str) -> Option<BridgeInfo> {
        let handle = self.bridges.write().remove(session_id);
        if let Some(h) = handle {
            info!("Bridge unregistered: session={}", session_id);
            // If we have a command channel, send close command
            if let Some(cmd_tx) = h.cmd_tx {
                let sid = session_id.to_string();
                tokio::spawn(async move {
                    if let Err(e) = cmd_tx.send(SessionCommand::Close).await {
                        warn!("Failed to send Close command for session {}: {}", sid, e);
                    }
                });
            }
            Some(h.info)
        } else {
            None
        }
    }

    /// Get bridge info by session ID
    pub fn get(&self, session_id: &str) -> Option<BridgeInfo> {
        self.bridges.read().get(session_id).map(|h| h.info.clone())
    }

    /// Send a resize command to a session
    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let cmd_tx = {
            let bridges = self.bridges.read();
            bridges.get(session_id).and_then(|h| h.cmd_tx.clone())
        };

        if let Some(tx) = cmd_tx {
            tx.send(SessionCommand::Resize(cols, rows))
                .await
                .map_err(|e| format!("Failed to send resize command: {}", e))?;
            Ok(())
        } else {
            Err(format!(
                "Session {} not found or doesn't support resize",
                session_id
            ))
        }
    }

    /// Update last activity time for a session
    pub fn touch(&self, session_id: &str) {
        if let Some(handle) = self.bridges.write().get_mut(session_id) {
            handle.info.last_activity = Instant::now();
        }
    }

    /// List all active bridges
    pub fn list(&self) -> Vec<BridgeInfo> {
        self.bridges
            .read()
            .values()
            .map(|h| h.info.clone())
            .collect()
    }

    /// Get the number of active bridges
    pub fn count(&self) -> usize {
        self.bridges.read().len()
    }

    /// Close all sessions (for cleanup on app exit)
    pub async fn close_all(&self) {
        let handles: Vec<_> = {
            let mut bridges = self.bridges.write();
            bridges.drain().collect()
        };

        for (session_id, handle) in handles {
            info!("Closing session: {}", session_id);
            if let Some(cmd_tx) = handle.cmd_tx {
                let _ = cmd_tx.send(SessionCommand::Close).await;
            }
        }
    }
}

impl Default for BridgeManager {
    fn default() -> Self {
        Self::new()
    }
}
