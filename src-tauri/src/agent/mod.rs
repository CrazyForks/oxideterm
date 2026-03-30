// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! OxideTerm Agent Module
//!
//! Manages remote agent lifecycle: deploy, connect via JSON-RPC over SSH exec channel,
//! and provide an `AgentRegistry` for other modules to call agent RPCs.
//!
//! The agent is an optional enhancement — when unavailable, the system falls back to
//! SFTP-based operations.

mod deploy;
mod protocol;
mod registry;
mod transport;

pub use deploy::{AgentDeployer, DeployError};
pub use protocol::*;
pub use registry::{AgentRegistry, AgentSession};
pub use transport::AgentTransport;
