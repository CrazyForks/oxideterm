//! Biometric Keychain Integration (macOS only)
//!
//! Stores secrets in the macOS **file-based keychain** (login.keychain-db)
//! with `SecAccessControl` biometric-first policy.
//!
//! Used exclusively for AI API keys that are frequently accessed.
//! Other secrets (SSH passwords) continue using the cross-platform `keyring` crate.
//!
//! ## Design
//!
//! - Items use `kSecAccessControlBiometryAny | kSecAccessControlOr | kSecAccessControlDevicePasscode`:
//!   - Macs with Touch ID → fingerprint prompt preferred
//!   - No biometric → system password fallback
//! - Items live in the **file-based keychain** (login.keychain-db), NOT the
//!   Data Protection Keychain. This avoids `errSecMissingEntitlement (-34018)`
//!   which requires code-signed entitlements not available during `tauri dev`.
//! - `exists()` uses `kSecUseAuthenticationUISkip` to check without prompting.
//! - Write & delete operations do not require user authentication.

use core_foundation::base::{kCFAllocatorDefault, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::data::CFData;
use core_foundation::string::CFString;
use core_foundation_sys::base::{CFRelease, CFTypeRef, OSStatus};
use core_foundation_sys::dictionary::{
    CFDictionaryCreateMutable, CFDictionarySetValue, CFMutableDictionaryRef,
    kCFTypeDictionaryKeyCallBacks, kCFTypeDictionaryValueCallBacks,
};
use security_framework::access_control::{ProtectionMode, SecAccessControl};
use security_framework_sys::access_control::{
    kSecAccessControlBiometryAny, kSecAccessControlDevicePasscode, kSecAccessControlOr,
};
use security_framework_sys::item::*;
use security_framework_sys::keychain_item::*;

use super::KeychainError;

// ─── OSStatus codes ──────────────────────────────────────────────────────────

const SEC_SUCCESS: OSStatus = 0;
const SEC_ITEM_NOT_FOUND: OSStatus = -25300;
const SEC_DUPLICATE_ITEM: OSStatus = -25299;
const SEC_INTERACTION_NOT_ALLOWED: OSStatus = -25308;
const SEC_USER_CANCELED: OSStatus = -128;
const SEC_AUTH_FAILED: OSStatus = -25293;
const SEC_MISSING_ENTITLEMENT: OSStatus = -34018;

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn platform_err(msg: impl Into<String>) -> KeychainError {
    KeychainError::Keyring(keyring::Error::PlatformFailure(msg.into().into()))
}

/// Build a base query dictionary pre-filled with class, service, account.
///
/// Uses the **file-based keychain** (login.keychain-db) — does NOT set
/// `kSecUseDataProtectionKeychain` so no code-signing entitlements are needed.
///
/// # Safety
/// Caller must release the returned dictionary with `CFRelease`.
unsafe fn base_query(service: &str, account: &str) -> CFMutableDictionaryRef {
    let dict = CFDictionaryCreateMutable(
        kCFAllocatorDefault,
        0,
        &kCFTypeDictionaryKeyCallBacks,
        &kCFTypeDictionaryValueCallBacks,
    );

    let service_cf = CFString::new(service);
    let account_cf = CFString::new(account);

    // kSecClass = kSecClassGenericPassword
    CFDictionarySetValue(
        dict,
        kSecClass as *const _,
        kSecClassGenericPassword as *const _,
    );
    // kSecAttrService
    CFDictionarySetValue(
        dict,
        kSecAttrService as *const _,
        service_cf.as_CFTypeRef() as *const _,
    );
    // kSecAttrAccount
    CFDictionarySetValue(
        dict,
        kSecAttrAccount as *const _,
        account_cf.as_CFTypeRef() as *const _,
    );

    // NOTE: We intentionally do NOT set kSecUseDataProtectionKeychain.
    // The Data Protection Keychain requires the app binary to be code-signed
    // with keychain-access-groups entitlement. During `tauri dev` the binary
    // is unsigned, causing errSecMissingEntitlement (-34018) on every call.
    // The file-based keychain (login.keychain-db) supports SecAccessControl
    // with biometric flags since macOS 10.12.2 and works without entitlements.

    dict
}

// ─── Public API ──────────────────────────────────────────────────────────────

/// Store a secret with biometric-first access control.
///
/// Creates a new keychain item in login.keychain-db with biometric ACL.
/// Existing items with the same service+account are deleted first.
/// The write operation itself does NOT prompt for authentication.
pub fn biometric_store(
    service: &str,
    account: &str,
    secret: &str,
) -> Result<(), KeychainError> {
    // Delete any existing item (avoids errSecDuplicateItem)
    let _ = biometric_delete(service, account);

    // Create access control: Touch ID preferred, device password fallback
    // Expression: (BiometryAny OR DevicePasscode)
    let access_flags =
        kSecAccessControlBiometryAny | kSecAccessControlOr | kSecAccessControlDevicePasscode;

    let access = SecAccessControl::create_with_protection(
        Some(ProtectionMode::AccessibleWhenUnlockedThisDeviceOnly),
        access_flags,
    )
    .map_err(|e| platform_err(format!("SecAccessControl creation failed: {}", e)))?;

    let data = CFData::from_buffer(secret.as_bytes());

    unsafe {
        let dict = base_query(service, account);

        // kSecValueData = secret bytes
        CFDictionarySetValue(
            dict,
            kSecValueData as *const _,
            data.as_CFTypeRef() as *const _,
        );
        // kSecAttrAccessControl = biometric-first policy
        CFDictionarySetValue(
            dict,
            kSecAttrAccessControl as *const _,
            access.as_CFTypeRef() as *const _,
        );
        // Human-readable label in Keychain Access.app
        let label = CFString::new("OxideTerm AI API Key");
        CFDictionarySetValue(
            dict,
            kSecAttrLabel as *const _,
            label.as_CFTypeRef() as *const _,
        );

        let status = SecItemAdd(dict as _, std::ptr::null_mut());
        CFRelease(dict as CFTypeRef);

        match status {
            SEC_SUCCESS => {
                tracing::info!(
                    "Biometric keychain: stored item (service={}, account={})",
                    service,
                    account
                );
                Ok(())
            }
            SEC_DUPLICATE_ITEM => {
                tracing::error!("Biometric keychain: duplicate item (account={})", account);
                Err(platform_err("Duplicate keychain item"))
            }
            SEC_MISSING_ENTITLEMENT => {
                tracing::warn!(
                    "Biometric keychain: missing entitlement (-34018), \
                     this should not happen with file-based keychain"
                );
                Err(platform_err(
                    "Missing entitlement (-34018) — is the Data Protection Keychain \
                     flag accidentally set?",
                ))
            }
            other => {
                tracing::error!(
                    "Biometric keychain: SecItemAdd failed (OSStatus={})",
                    other
                );
                Err(platform_err(format!("SecItemAdd failed (OSStatus {})", other)))
            }
        }
    }
}

/// Retrieve a secret. Triggers Touch ID prompt (or login password on non-Touch ID Macs).
///
/// Returns `KeychainError::NotFound` if the item doesn't exist.
/// Returns a platform error if the user cancels or authentication fails.
pub fn biometric_get(service: &str, account: &str) -> Result<String, KeychainError> {
    unsafe {
        let dict = base_query(service, account);

        // kSecReturnData = true → return the secret bytes
        CFDictionarySetValue(
            dict,
            kSecReturnData as *const _,
            CFBoolean::true_value().as_CFTypeRef() as *const _,
        );

        let mut result: CFTypeRef = std::ptr::null();
        let status = SecItemCopyMatching(dict as _, &mut result);
        CFRelease(dict as CFTypeRef);

        match status {
            SEC_SUCCESS => {
                if result.is_null() {
                    return Err(KeychainError::NotFound(account.to_string()));
                }
                // Result is a CFDataRef when kSecReturnData=true and no kSecMatchLimit
                let data = CFData::wrap_under_create_rule(result as _);
                let secret = String::from_utf8(data.bytes().to_vec())
                    .map_err(|e| platform_err(format!("Invalid UTF-8 in keychain data: {}", e)))?;
                tracing::info!(
                    "Biometric keychain: retrieved item (account={}, len={})",
                    account,
                    secret.len()
                );
                Ok(secret)
            }
            SEC_ITEM_NOT_FOUND => Err(KeychainError::NotFound(account.to_string())),
            SEC_USER_CANCELED => {
                tracing::debug!("Biometric keychain: user canceled auth (account={})", account);
                Err(platform_err("Authentication canceled by user"))
            }
            SEC_AUTH_FAILED => {
                tracing::warn!("Biometric keychain: auth failed (account={})", account);
                Err(platform_err("Authentication failed"))
            }
            SEC_MISSING_ENTITLEMENT => {
                tracing::warn!(
                    "Biometric keychain: missing entitlement (-34018) on get, falling through"
                );
                Err(KeychainError::NotFound(account.to_string()))
            }
            other => {
                tracing::error!(
                    "Biometric keychain: SecItemCopyMatching failed (OSStatus={})",
                    other
                );
                Err(platform_err(format!(
                    "SecItemCopyMatching failed (OSStatus {})",
                    other
                )))
            }
        }
    }
}

/// Delete a secret from the biometric keychain. No authentication required.
///
/// Returns `Ok(())` even if the item doesn't exist (idempotent).
pub fn biometric_delete(service: &str, account: &str) -> Result<(), KeychainError> {
    unsafe {
        let dict = base_query(service, account);
        let status = SecItemDelete(dict as _);
        CFRelease(dict as CFTypeRef);

        match status {
            SEC_SUCCESS | SEC_ITEM_NOT_FOUND | SEC_MISSING_ENTITLEMENT => Ok(()),
            other => {
                tracing::error!(
                    "Biometric keychain: SecItemDelete failed (OSStatus={})",
                    other
                );
                Err(platform_err(format!(
                    "SecItemDelete failed (OSStatus {})",
                    other
                )))
            }
        }
    }
}

/// Check if a secret exists WITHOUT triggering authentication.
///
/// Uses `kSecUseAuthenticationUISkip` to prevent Touch ID / password prompt.
/// If the item exists but requires authentication, returns `true`
/// (via `errSecInteractionNotAllowed`).
pub fn biometric_exists(service: &str, account: &str) -> Result<bool, KeychainError> {
    unsafe {
        let dict = base_query(service, account);

        // Skip auth UI — if the item needs auth, we get errSecInteractionNotAllowed
        CFDictionarySetValue(
            dict,
            kSecUseAuthenticationUI as *const _,
            kSecUseAuthenticationUISkip as *const _,
        );

        let mut result: CFTypeRef = std::ptr::null();
        let status = SecItemCopyMatching(dict as _, &mut result);
        CFRelease(dict as CFTypeRef);

        if !result.is_null() {
            CFRelease(result);
        }

        match status {
            SEC_SUCCESS => Ok(true),
            SEC_INTERACTION_NOT_ALLOWED => Ok(true), // Exists, but needs authentication to read
            SEC_ITEM_NOT_FOUND => Ok(false),
            SEC_MISSING_ENTITLEMENT => Ok(false), // Can't access → treat as absent
            other => {
                tracing::error!(
                    "Biometric keychain: exists check failed (OSStatus={})",
                    other
                );
                Err(platform_err(format!(
                    "SecItemCopyMatching failed (OSStatus {})",
                    other
                )))
            }
        }
    }
}
