use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::{HashMap, VecDeque}, fs, path::{Path, PathBuf}};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

static WRITES: Mutex<()> = Mutex::const_new(());

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    entry_id: String,
    track: Value,
    remote_key: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalPlaylist {
    version: u32,
    revision: u64,
    account_id: String,
    playlist_id: String,
    customized: bool,
    /// Spotify's version of the playlist when it was last reconciled. While it
    /// still matches, opening the playlist needs no trip to Spotify.
    #[serde(default)]
    snapshot_id: Option<String>,
    entries: Vec<Entry>,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Edit {
    Add { track: Value },
    Move { #[serde(rename = "entryId")] entry_id: String, #[serde(rename = "beforeId")] before_id: Option<String> },
    Remove { #[serde(rename = "entryId")] entry_id: String },
}

fn path(app: &AppHandle, account: &str, playlist: &str) -> Result<PathBuf, String> {
    if account.is_empty() || playlist.is_empty() { return Err("Missing account or playlist".into()); }
    let name = hex::encode(Sha256::digest(format!("{account}\0{playlist}")));
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("library-v1").join(format!("{name}.json")))
}

fn read(app: &AppHandle, account: &str, playlist: &str) -> Result<LocalPlaylist, String> {
    let location = path(app, account, playlist)?;
    match fs::read(location) {
        Ok(bytes) => {
            let saved: LocalPlaylist = serde_json::from_slice(&bytes).map_err(|_| "Saved playlist could not be read. Its data has been preserved.")?;
            if saved.version != 1 || saved.account_id != account || saved.playlist_id != playlist {
                return Err("Unsupported saved playlist".into());
            }
            Ok(saved)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(LocalPlaylist {
            version: 1, revision: 0, account_id: account.into(), playlist_id: playlist.into(), customized: false, snapshot_id: None, entries: vec![],
        }),
        Err(e) => Err(e.to_string()),
    }
}

fn write_atomic(destination: &Path, bytes: &[u8]) -> Result<(), String> {
    let directory = destination.parent().ok_or("Invalid library directory")?;
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut file, bytes).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(destination).map_err(|e| e.to_string())?;
    Ok(())
}

fn save(app: &AppHandle, state: &mut LocalPlaylist) -> Result<(), String> {
    let destination = path(app, &state.account_id, &state.playlist_id)?;
    state.revision += 1;
    let bytes = serde_json::to_vec(state).map_err(|e| e.to_string())?;
    write_atomic(&destination, &bytes)?;
    // The count index only speeds up the playlist cards; losing it is harmless.
    let _ = update_counts(app, state);
    // A summary, not the playlist: sending thousands of songs to every window
    // on each save jammed the webview. A window that needs the songs reads them.
    let _ = app.emit("local-playlist-changed", json!({
        "accountId": state.account_id,
        "playlistId": state.playlist_id,
        "revision": state.revision,
        "localCount": local_only(state),
    }));
    Ok(())
}

/// Songs a playlist holds only in MiniFy, on top of what Spotify counts.
fn local_only(state: &LocalPlaylist) -> usize {
    state.entries.iter().filter(|entry| entry.remote_key.is_none()).count()
}

/// A small per-account index of those counts, so the playlist cards need not
/// read every saved playlist.
fn counts_path(app: &AppHandle, account: &str) -> Result<PathBuf, String> {
    let name = hex::encode(Sha256::digest(account.as_bytes()));
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("library-v1").join(format!("counts-{name}.json")))
}

/// Rebuilds the index from the saved playlists, for libraries older than it.
fn scan_counts(app: &AppHandle, account: &str) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    let Ok(directory) = app.path().app_data_dir().map(|dir| dir.join("library-v1")) else { return counts };
    let Ok(files) = fs::read_dir(directory) else { return counts };
    for file in files.flatten() {
        let name = file.file_name();
        let name = name.to_string_lossy();
        if !name.ends_with(".json") || name.starts_with("counts-") { continue; }
        let Ok(bytes) = fs::read(file.path()) else { continue };
        let Ok(saved) = serde_json::from_slice::<LocalPlaylist>(&bytes) else { continue };
        let count = local_only(&saved);
        if saved.account_id == account && count > 0 { counts.insert(saved.playlist_id, count); }
    }
    counts
}

fn read_counts(app: &AppHandle, account: &str) -> HashMap<String, usize> {
    counts_path(app, account)
        .ok()
        .and_then(|location| fs::read(location).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_else(|| scan_counts(app, account))
}

fn update_counts(app: &AppHandle, state: &LocalPlaylist) -> Result<(), String> {
    let mut counts = read_counts(app, &state.account_id);
    let count = local_only(state);
    if count > 0 { counts.insert(state.playlist_id.clone(), count); } else { counts.remove(&state.playlist_id); }
    let bytes = serde_json::to_vec(&counts).map_err(|e| e.to_string())?;
    write_atomic(&counts_path(app, &state.account_id)?, &bytes)
}

fn validate_track(track: &Value, provider: &str) -> Result<(), String> {
    if track["provider"] != provider || !track["id"].is_string() || !track["name"].is_string()
        || !track["durationMs"].is_number() || !track["artists"].is_array() || !track["album"]["images"].is_array() {
        return Err("Invalid playlist track".into());
    }
    let prefix = if provider == "youtube" { "youtube:video:" } else { "spotify:track:" };
    if !track["uri"].as_str().is_some_and(|s| s.starts_with(prefix)) { return Err("Invalid track URI".into()); }
    Ok(())
}

fn new_entry(track: Value, remote_key: Option<String>) -> Entry {
    Entry { entry_id: format!("{:032x}", rand::random::<u128>()), track, remote_key }
}

fn reconcile(state: &mut LocalPlaylist, tracks: Vec<Value>) -> Result<(), String> {
    let mut old: HashMap<String, VecDeque<Entry>> = HashMap::new();
    for entry in &state.entries {
        if let Some(key) = &entry.remote_key { old.entry(key.clone()).or_default().push_back(entry.clone()); }
    }
    let mut remote = Vec::with_capacity(tracks.len());
    for track in tracks {
        // Local files and songs Spotify pulled have no playable id. They cannot
        // play here anyway, and one of them used to fail the whole playlist.
        if validate_track(&track, "spotify").is_err() { continue; }
        let key = track["playlistKey"].as_str().unwrap_or(track["uri"].as_str().unwrap()).to_owned();
        let mut entry = old.get_mut(&key).and_then(VecDeque::pop_front).unwrap_or_else(|| new_entry(track.clone(), Some(key)));
        entry.track = track;
        remote.push(entry);
    }
    if state.customized {
        let mut remaining: HashMap<String, Entry> = remote.iter().cloned().map(|e| (e.entry_id.clone(), e)).collect();
        let mut merged = Vec::new();
        for entry in &state.entries {
            if entry.remote_key.is_none() { merged.push(entry.clone()); }
            else if let Some(updated) = remaining.remove(&entry.entry_id) { merged.push(updated); }
        }
        for entry in remote { if remaining.remove(&entry.entry_id).is_some() { merged.push(entry); } }
        state.entries = merged;
    } else {
        state.entries = remote;
    }
    Ok(())
}

fn edit(state: &mut LocalPlaylist, action: Edit) -> Result<(), String> {
    match action {
        Edit::Add { track } => {
            validate_track(&track, "youtube")?;
            state.entries.push(new_entry(track, None));
        }
        Edit::Move { entry_id, before_id } => {
            if before_id.as_ref() == Some(&entry_id) { return Ok(()); }
            if before_id.as_ref().is_some_and(|id| !state.entries.iter().any(|e| &e.entry_id == id)) { return Err("Playlist changed. Please try again.".into()); }
            let index = state.entries.iter().position(|e| e.entry_id == entry_id).ok_or("Playlist entry no longer exists")?;
            let entry = state.entries.remove(index);
            let destination = before_id.and_then(|id| state.entries.iter().position(|e| e.entry_id == id)).unwrap_or(state.entries.len());
            state.entries.insert(destination, entry);
        }
        Edit::Remove { entry_id } => {
            let entry = state.entries.iter().find(|e| e.entry_id == entry_id).ok_or("Playlist entry no longer exists")?;
            if entry.remote_key.is_some() { return Err("Only local YouTube entries can be removed here".into()); }
            state.entries.retain(|e| e.entry_id != entry_id);
        }
    }
    state.customized = true;
    Ok(())
}

/// How many YouTube songs each playlist of the account holds in MiniFy.
#[tauri::command]
pub async fn local_playlist_counts(app: AppHandle, account_id: String) -> Result<HashMap<String, usize>, String> {
    if account_id.is_empty() { return Err("Missing account".into()); }
    let _lock = WRITES.lock().await;
    Ok(read_counts(&app, &account_id))
}

#[tauri::command]
pub async fn read_local_playlist(app: AppHandle, account_id: String, playlist_id: String) -> Result<LocalPlaylist, String> {
    let _lock = WRITES.lock().await;
    read(&app, &account_id, &playlist_id)
}

#[tauri::command]
pub async fn reconcile_local_playlist(app: AppHandle, account_id: String, playlist_id: String, snapshot_id: Option<String>, tracks: Vec<Value>) -> Result<LocalPlaylist, String> {
    let _lock = WRITES.lock().await;
    let mut state = read(&app, &account_id, &playlist_id)?;
    reconcile(&mut state, tracks)?;
    state.snapshot_id = snapshot_id;
    save(&app, &mut state)?;
    Ok(state)
}

#[tauri::command]
pub async fn edit_local_playlist(app: AppHandle, account_id: String, playlist_id: String, revision: u64, action: Edit) -> Result<LocalPlaylist, String> {
    let _lock = WRITES.lock().await;
    let mut state = read(&app, &account_id, &playlist_id)?;
    if state.revision != revision { return Err("Playlist changed in another window. Please try again.".into()); }
    edit(&mut state, action)?;
    save(&app, &mut state)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn track(id: &str, source: &str) -> Value {
        json!({"id":id,"name":id,"provider":source,"uri":format!("{}:{}:{id}",source,if source == "spotify" {"track"} else {"video"}),"durationMs":1000,"artists":[],"album":{"images":[]}})
    }
    fn empty() -> LocalPlaylist { LocalPlaylist { version:1, revision:0, account_id:"user".into(), playlist_id:"list".into(), customized:false, snapshot_id:None, entries:vec![] } }
    #[test]
    fn unplayable_tracks_are_skipped_not_fatal() {
        let mut state = empty();
        let local_file = json!({"id":null,"name":"x","provider":"spotify","uri":"spotify:local:a:b:c:1","durationMs":1,"artists":[],"album":{"images":[]}});
        reconcile(&mut state, vec![track("a","spotify"), local_file, track("b","spotify")]).unwrap();
        assert_eq!(state.entries.iter().map(|e| e.track["id"].as_str().unwrap()).collect::<Vec<_>>(), vec!["a","b"]);
    }
    #[test]
    fn reconcile_keeps_local_order_and_duplicates() {
        let mut state = empty();
        reconcile(&mut state, vec![track("a","spotify"), track("a","spotify"), track("b","spotify")]).unwrap();
        let first = state.entries[0].entry_id.clone();
        let second = state.entries[1].entry_id.clone();
        assert_ne!(first, second);
        edit(&mut state, Edit::Add { track:track("video","youtube") }).unwrap();
        edit(&mut state, Edit::Move { entry_id:second.clone(), before_id:Some(first.clone()) }).unwrap();
        reconcile(&mut state, vec![track("a","spotify"),track("a","spotify"),track("c","spotify")]).unwrap();
        assert_eq!(state.entries.iter().map(|e| e.track["id"].as_str().unwrap()).collect::<Vec<_>>(), vec!["a","a","video","c"]);
        assert_eq!(state.entries[0].entry_id, second);
        assert_eq!(state.entries[1].entry_id, first);
    }
    #[test]
    fn only_youtube_entries_count_as_local() {
        let mut state = empty();
        reconcile(&mut state, vec![track("a","spotify"), track("b","spotify")]).unwrap();
        assert_eq!(local_only(&state), 0);
        edit(&mut state, Edit::Add { track:track("dQw4w9WgXcQ","youtube") }).unwrap();
        assert_eq!(local_only(&state), 1);
    }
    #[test]
    fn spotify_cannot_be_added_or_deleted_locally() {
        let mut state = empty();
        assert!(edit(&mut state, Edit::Add { track:track("a","spotify") }).is_err());
        reconcile(&mut state,vec![track("a","spotify")]).unwrap();
        let id = state.entries[0].entry_id.clone();
        assert!(edit(&mut state, Edit::Remove { entry_id:id }).is_err());
    }
}
