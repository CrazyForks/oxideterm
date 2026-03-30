// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! Session Events Module
//!
//! Defines Tauri events for network status.
//! Note: Session state events have been migrated to connection_status_changed
//! in SshConnectionRegistry for unified topology-aware event handling.

use serde::{Deserialize, Serialize};

/// Event names as constants
pub mod event_names {
    /// Network status changed
    pub const NETWORK_STATUS_CHANGED: &str = "network:status_changed";
}

/// Network status payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStatusPayload {
    pub online: bool,
}
