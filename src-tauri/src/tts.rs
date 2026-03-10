use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

static TTS_PROCESS: Mutex<Option<CommandChild>> = Mutex::new(None);
static TTS_PORT: Mutex<u16> = Mutex::new(9877);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsStatus {
    pub running: bool,
    pub port: u16,
    pub model: Option<String>,
    pub error: Option<String>,
}

pub fn init(_handle: AppHandle) {
    // Future: auto-start TTS if configured
}

#[tauri::command]
pub async fn start_tts_server(
    app: AppHandle,
    python_path: Option<String>,
    model: Option<String>,
    port: Option<u16>,
) -> Result<TtsStatus, String> {
    // Kill existing process if any
    stop_tts_server_inner()?;

    let py = python_path.unwrap_or_else(|| "python".to_string());
    let tts_port = port.unwrap_or(9877);
    let tts_model = model.unwrap_or_else(|| "0.6B".to_string());

    // Resolve sidecar script path relative to resource dir
    let script_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to resolve resource dir: {}", e))?
        .join("sidecars")
        .join("tts-server")
        .join("server.py");

    let script = if script_path.exists() {
        script_path.to_string_lossy().to_string()
    } else {
        // Development fallback: try relative to project root
        let fallback = std::path::Path::new("src-tauri/sidecars/tts-server/server.py");
        if fallback.exists() {
            fallback.to_string_lossy().to_string()
        } else {
            // Already inside src-tauri (Tauri dev CWD)
            "sidecars/tts-server/server.py".to_string()
        }
    };

    let shell = app.shell();
    let (mut rx, child) = shell
        .command(&py)
        .args([
            &script,
            "--port",
            &tts_port.to_string(),
            "--model",
            &tts_model,
        ])
        .spawn()
        .map_err(|e| format!("Failed to spawn TTS server: {}", e))?;

    // Store the child process
    *TTS_PORT.lock().unwrap() = tts_port;
    *TTS_PROCESS.lock().unwrap() = Some(child);

    // Spawn a task to consume stdout/stderr (prevents pipe buffer deadlock)
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    eprintln!("[TTS stdout] {}", text.trim());
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    eprintln!("[TTS stderr] {}", text.trim());
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[TTS] Process exited with code {:?}", payload.code);
                    *TTS_PROCESS.lock().unwrap() = None;
                    break;
                }
                _ => {}
            }
        }
    });

    // Wait briefly for server to start, then check health
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    let health_url = format!("http://localhost:{}/health", tts_port);
    match reqwest::get(&health_url).await {
        Ok(resp) if resp.status().is_success() => Ok(TtsStatus {
            running: true,
            port: tts_port,
            model: Some(tts_model),
            error: None,
        }),
        Ok(resp) => Ok(TtsStatus {
            running: true,
            port: tts_port,
            model: Some(tts_model),
            error: Some(format!("Health check returned {}", resp.status())),
        }),
        Err(_) => Ok(TtsStatus {
            running: true,
            port: tts_port,
            model: Some(tts_model),
            error: Some("Server started but health check failed (may still be loading model)".to_string()),
        }),
    }
}

fn stop_tts_server_inner() -> Result<(), String> {
    let mut guard = TTS_PROCESS.lock().unwrap();
    if let Some(child) = guard.take() {
        child.kill().map_err(|e| format!("Failed to kill TTS process: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn stop_tts_server() -> Result<TtsStatus, String> {
    stop_tts_server_inner()?;
    let port = *TTS_PORT.lock().unwrap();
    Ok(TtsStatus {
        running: false,
        port,
        model: None,
        error: None,
    })
}

#[tauri::command]
pub async fn get_tts_status() -> Result<TtsStatus, String> {
    let running = TTS_PROCESS.lock().unwrap().is_some();
    let port = *TTS_PORT.lock().unwrap();

    if !running {
        return Ok(TtsStatus {
            running: false,
            port,
            model: None,
            error: None,
        });
    }

    let health_url = format!("http://localhost:{}/health", port);
    match reqwest::get(&health_url).await {
        Ok(resp) if resp.status().is_success() => {
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            Ok(TtsStatus {
                running: true,
                port,
                model: body.get("model").and_then(|v| v.as_str()).map(String::from),
                error: None,
            })
        }
        _ => Ok(TtsStatus {
            running: true,
            port,
            model: None,
            error: Some("Server running but health check failed".to_string()),
        }),
    }
}
