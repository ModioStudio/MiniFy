#[cfg(not(target_os = "linux"))]
mod platform {
    use keyring::Entry;

    const KEYRING_SERVICE: &str = "minify";

    fn entry(key: &str) -> Result<Entry, String> {
        Entry::new(KEYRING_SERVICE, key).map_err(|error| format!("Keyring error: {error}"))
    }

    pub fn set(key: &str, value: &str) -> Result<(), String> {
        entry(key)?
            .set_password(value)
            .map_err(|error| format!("Failed to save credential: {error}"))
    }

    pub fn get(key: &str) -> Result<String, String> {
        entry(key)?
            .get_password()
            .map_err(|error| format!("Failed to read credential: {error}"))
    }

    pub fn delete(key: &str) -> Result<(), String> {
        entry(key)?
            .delete_password()
            .map_err(|error| format!("Failed to delete credential: {error}"))
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use base64::{engine::general_purpose, Engine as _};
    use chacha20poly1305::{
        aead::{Aead, KeyInit, Payload},
        XChaCha20Poly1305, XNonce,
    };
    use rand::RngCore;
    use serde::{Deserialize, Serialize};
    use std::collections::HashMap;
    use std::fs::{self, OpenOptions};
    use std::io::{Read, Write};
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    use std::path::{Path, PathBuf};
    use std::sync::{Mutex, OnceLock};

    const STORE_VERSION: u8 = 1;
    const KEY_LENGTH: usize = 32;
    const NONCE_LENGTH: usize = 24;

    static STORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    #[derive(Default, Deserialize, Serialize)]
    struct CredentialStore {
        version: u8,
        entries: HashMap<String, EncryptedValue>,
    }

    #[derive(Deserialize, Serialize)]
    struct EncryptedValue {
        nonce: String,
        ciphertext: String,
    }

    fn store_lock() -> &'static Mutex<()> {
        STORE_LOCK.get_or_init(|| Mutex::new(()))
    }

    fn storage_dir() -> Result<PathBuf, String> {
        let path = dirs::data_local_dir()
            .ok_or_else(|| "Linux data directory is unavailable".to_string())?
            .join("com.modiostudio.minify");
        fs::create_dir_all(&path)
            .map_err(|error| format!("Failed to create credential directory: {error}"))?;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Failed to secure credential directory: {error}"))?;
        Ok(path)
    }

    fn key_path(directory: &Path) -> PathBuf {
        directory.join("credentials.key")
    }

    fn store_path(directory: &Path) -> PathBuf {
        directory.join("credentials.v1.json")
    }

    fn read_or_create_key(directory: &Path) -> Result<[u8; KEY_LENGTH], String> {
        let path = key_path(directory);
        if path.exists() {
            let mut file = OpenOptions::new()
                .read(true)
                .open(&path)
                .map_err(|error| format!("Failed to open credential key: {error}"))?;
            let mut key = [0_u8; KEY_LENGTH];
            file.read_exact(&mut key)
                .map_err(|error| format!("Failed to read credential key: {error}"))?;
            let mut trailing_byte = [0_u8; 1];
            if file
                .read(&mut trailing_byte)
                .map_err(|error| format!("Failed to validate credential key: {error}"))?
                != 0
            {
                return Err("Credential key has an invalid length".to_string());
            }
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
                .map_err(|error| format!("Failed to secure credential key: {error}"))?;
            return Ok(key);
        }

        let mut key = [0_u8; KEY_LENGTH];
        rand::rng().fill_bytes(&mut key);
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&path)
            .map_err(|error| format!("Failed to create credential key: {error}"))?;
        file.write_all(&key)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Failed to persist credential key: {error}"))?;
        Ok(key)
    }

    fn read_store(path: &Path) -> Result<CredentialStore, String> {
        if !path.exists() {
            return Ok(CredentialStore {
                version: STORE_VERSION,
                entries: HashMap::new(),
            });
        }

        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Failed to secure credential store: {error}"))?;
        let content =
            fs::read(path).map_err(|error| format!("Failed to read credential store: {error}"))?;
        let store: CredentialStore = serde_json::from_slice(&content)
            .map_err(|error| format!("Failed to parse credential store: {error}"))?;
        if store.version != STORE_VERSION {
            return Err(format!(
                "Unsupported credential store version: {}",
                store.version
            ));
        }
        Ok(store)
    }

    fn write_store(path: &Path, store: &CredentialStore) -> Result<(), String> {
        let temp_path = path.with_extension("json.tmp");
        let content = serde_json::to_vec(store)
            .map_err(|error| format!("Failed to serialize credential store: {error}"))?;
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&temp_path)
            .map_err(|error| format!("Failed to create credential store: {error}"))?;
        file.write_all(&content)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Failed to persist credential store: {error}"))?;
        fs::set_permissions(&temp_path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Failed to secure credential store: {error}"))?;
        fs::rename(&temp_path, path)
            .map_err(|error| format!("Failed to replace credential store: {error}"))
    }

    fn cipher(key: &[u8; KEY_LENGTH]) -> Result<XChaCha20Poly1305, String> {
        XChaCha20Poly1305::new_from_slice(key)
            .map_err(|_| "Failed to initialize credential encryption".to_string())
    }

    pub fn set(key: &str, value: &str) -> Result<(), String> {
        let _guard = store_lock()
            .lock()
            .map_err(|_| "Credential store lock is poisoned".to_string())?;
        let directory = storage_dir()?;
        let encryption_key = read_or_create_key(&directory)?;
        let mut nonce = [0_u8; NONCE_LENGTH];
        rand::rng().fill_bytes(&mut nonce);
        let ciphertext = cipher(&encryption_key)?
            .encrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: value.as_bytes(),
                    aad: key.as_bytes(),
                },
            )
            .map_err(|_| "Failed to encrypt credential".to_string())?;

        let path = store_path(&directory);
        let mut store = read_store(&path)?;
        store.entries.insert(
            key.to_string(),
            EncryptedValue {
                nonce: general_purpose::STANDARD.encode(nonce),
                ciphertext: general_purpose::STANDARD.encode(ciphertext),
            },
        );
        write_store(&path, &store)
    }

    pub fn get(key: &str) -> Result<String, String> {
        let _guard = store_lock()
            .lock()
            .map_err(|_| "Credential store lock is poisoned".to_string())?;
        let directory = storage_dir()?;
        let encryption_key = read_or_create_key(&directory)?;
        let path = store_path(&directory);
        let store = read_store(&path)?;
        let encrypted = store
            .entries
            .get(key)
            .ok_or_else(|| format!("Credential not found: {key}"))?;
        let nonce = general_purpose::STANDARD
            .decode(&encrypted.nonce)
            .map_err(|_| "Credential nonce is invalid".to_string())?;
        if nonce.len() != NONCE_LENGTH {
            return Err("Credential nonce has an invalid length".to_string());
        }
        let ciphertext = general_purpose::STANDARD
            .decode(&encrypted.ciphertext)
            .map_err(|_| "Credential ciphertext is invalid".to_string())?;
        let plaintext = cipher(&encryption_key)?
            .decrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: ciphertext.as_ref(),
                    aad: key.as_bytes(),
                },
            )
            .map_err(|_| "Failed to decrypt credential".to_string())?;
        String::from_utf8(plaintext).map_err(|_| "Credential is not valid UTF-8".to_string())
    }

    pub fn delete(key: &str) -> Result<(), String> {
        let _guard = store_lock()
            .lock()
            .map_err(|_| "Credential store lock is poisoned".to_string())?;
        let directory = storage_dir()?;
        let path = store_path(&directory);
        let mut store = read_store(&path)?;
        if store.entries.remove(key).is_some() {
            write_store(&path, &store)?;
        }
        Ok(())
    }
}

pub use platform::{delete, get, set};
