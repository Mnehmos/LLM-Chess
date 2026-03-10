mod tts;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Store app handle for TTS sidecar management
            let handle = app.handle().clone();
            tts::init(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tts::start_tts_server,
            tts::stop_tts_server,
            tts::get_tts_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
