fn main() {
    use spotify_mini_player_lib::{settings, spotify_auth};
    let s = settings::clear_settings();
    let k = tauri::async_runtime::block_on(spotify_auth::clear_credentials());
    println!("clear_settings: {}", s);
    println!("clear_credentials: {}", k.is_ok());
}


