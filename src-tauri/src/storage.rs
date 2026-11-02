use serde_json::Value;
use std::{fs, io::Write, path::Path, sync::Mutex};

pub static WRITE_LOCK: Mutex<()> = Mutex::new(());

// Same-directory replacement keeps the previous complete file on interruption.
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension("pending");
    let result = (|| {
        let mut file = fs::File::create(&temporary).map_err(|e| e.to_string())?;
        file.write_all(data).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        replace(&temporary, path)
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result
}

#[cfg(windows)]
fn replace(from: &Path, to: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{core::PCWSTR, Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH}};
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe { MoveFileExW(PCWSTR(from.as_ptr()), PCWSTR(to.as_ptr()), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) }.map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn replace(from: &Path, to: &Path) -> Result<(), String> {
    fs::rename(from, to).map_err(|e| e.to_string())
}

pub fn remove_secrets(value: &mut Value) {
    match value {
        Value::Object(map) => {
            map.remove("aiApiKey");
            map.remove("ai_api_key");
            for child in map.values_mut() { remove_secrets(child); }
        }
        Value::Array(list) => for child in list { remove_secrets(child); },
        _ => {}
    }
}

pub fn read_json(path: &Path) -> Option<Value> {
    [path.to_path_buf(), path.with_extension("json.bak")].iter()
        .find_map(|p| serde_json::from_slice(&fs::read(p).ok()?).ok())
}

pub fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    let mut previous = read_json(path).unwrap_or_else(|| value.clone());
    remove_secrets(&mut previous);
    let bytes = serde_json::to_vec_pretty(&previous).map_err(|e| e.to_string())?;
    atomic_write(&path.with_extension("json.bak"), &bytes)?;
    let mut clean = value.clone();
    remove_secrets(&mut clean);
    atomic_write(path, &serde_json::to_vec_pretty(&clean).map_err(|e| e.to_string())?)
}

#[cfg(windows)]
pub fn protect(data: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use windows::{core::PCWSTR, Win32::{Foundation::{HLOCAL, LocalFree}, Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN}}};
    let input = CRYPT_INTEGER_BLOB { cbData: data.len().try_into().map_err(|_| "secret too large")?, pbData: data.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        if encrypt {
            CryptProtectData(&input, PCWSTR::null(), None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        } else {
            CryptUnprotectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        }.map_err(|_| "Windows could not access the protected API key".to_string())?;
        let copy = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(copy)
    }
}

#[cfg(not(windows))]
pub fn protect(_data: &[u8], _encrypt: bool) -> Result<Vec<u8>, String> {
    Err("API key storage requires Windows data protection".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_replace_and_backup_recover_corrupt_json() {
        let folder = std::env::temp_dir().join(format!("jagwey-storage-test-{}", std::process::id()));
        fs::create_dir_all(&folder).unwrap();
        let path = folder.join("settings.json");
        write_json(&path, &serde_json::json!({"theme":"minimal", "aiApiKey":"test-only"})).unwrap();
        write_json(&path, &serde_json::json!({"theme":"anime"})).unwrap();
        assert_eq!(read_json(&path).unwrap()["theme"], "anime");
        fs::write(&path, b"{broken").unwrap();
        let restored = read_json(&path).unwrap();
        assert_eq!(restored["theme"], "minimal");
        assert!(restored.get("aiApiKey").is_none());
        fs::remove_dir_all(folder).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn windows_protection_round_trip_and_rejects_corruption() {
        let original = b"jagwey-dpapi-test-only";
        let encrypted = protect(original, true).unwrap();
        assert_ne!(encrypted, original);
        assert_eq!(protect(&encrypted, false).unwrap(), original);
        assert!(protect(b"invalid encrypted data", false).is_err());
    }
}
