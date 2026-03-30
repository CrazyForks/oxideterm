// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

//! SFTP error types

use thiserror::Error;

/// SFTP-specific errors
#[derive(Debug, Error)]
pub enum SftpError {
    #[error("SFTP subsystem not available: {0}")]
    SubsystemNotAvailable(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Directory not found: {0}")]
    DirectoryNotFound(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Channel error: {0}")]
    ChannelError(String),

    #[error("Protocol error: {0}")]
    ProtocolError(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("File too large for preview: {size} bytes (max: {max} bytes)")]
    FileTooLarge { size: u64, max: u64 },

    #[error("Unsupported file type: {0}")]
    UnsupportedFileType(String),

    #[error("Transfer cancelled")]
    TransferCancelled,

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("SFTP session not initialized for: {0}")]
    NotInitialized(String),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Transfer error: {0}")]
    TransferError(String),

    #[error("Resume not supported for: {0}")]
    ResumeNotSupported(String),

    #[error("Write error: {0}")]
    WriteError(String),
}

impl SftpError {
    /// 判断错误是否为通道级别可恢复错误
    ///
    /// 可恢复错误意味着 SFTP 通道可能损坏，但底层 SSH 连接可能仍然有效。
    /// 对于这类错误，可以尝试重建 SFTP session 后重试操作。
    ///
    /// # Returns
    /// - `true`: 通道/协议/IO 连接错误，值得尝试重建 SFTP
    /// - `false`: 业务错误（文件不存在、权限拒绝等），不应重试
    pub fn is_channel_recoverable(&self) -> bool {
        match self {
            // 通道/协议错误：SFTP 通道可能损坏，值得重试
            SftpError::ChannelError(_) => true,
            SftpError::ProtocolError(_) => true,
            SftpError::SubsystemNotAvailable(_) => true,

            // IO 错误：部分可恢复（排除文件相关的 IO 错误）
            SftpError::IoError(e) => {
                use std::io::ErrorKind;
                matches!(
                    e.kind(),
                    ErrorKind::ConnectionReset
                        | ErrorKind::ConnectionAborted
                        | ErrorKind::BrokenPipe
                        | ErrorKind::TimedOut
                        | ErrorKind::UnexpectedEof
                )
            }

            // 业务错误：不应重试
            SftpError::PermissionDenied(_) => false,
            SftpError::FileNotFound(_) => false,
            SftpError::DirectoryNotFound(_) => false,
            SftpError::InvalidPath(_) => false,
            SftpError::FileTooLarge { .. } => false,
            SftpError::UnsupportedFileType(_) => false,
            SftpError::TransferCancelled => false,
            SftpError::SessionNotFound(_) => false,
            SftpError::NotInitialized(_) => false,
            SftpError::StorageError(_) => false,
            SftpError::TransferError(_) => false,
            SftpError::ResumeNotSupported(_) => false,
            SftpError::WriteError(_) => false,
        }
    }
}

impl serde::Serialize for SftpError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
