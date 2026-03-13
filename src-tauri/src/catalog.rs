use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const CATALOG_FILE_NAME: &str = "lichess-puzzles-1500-plus.json";

fn push_candidate(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if !paths.iter().any(|candidate| candidate == &path) {
        paths.push(path);
    }
}

fn candidate_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(cwd) = std::env::current_dir() {
        push_candidate(
            &mut paths,
            cwd.join("public").join("data").join(CATALOG_FILE_NAME),
        );
        push_candidate(
            &mut paths,
            cwd.join("..")
                .join("public")
                .join("data")
                .join(CATALOG_FILE_NAME),
        );
        push_candidate(
            &mut paths,
            cwd.join("dist").join("data").join(CATALOG_FILE_NAME),
        );
        push_candidate(
            &mut paths,
            cwd.join("..").join("dist").join("data").join(CATALOG_FILE_NAME),
        );
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        push_candidate(
            &mut paths,
            resource_dir.join("data").join(CATALOG_FILE_NAME),
        );
        push_candidate(
            &mut paths,
            resource_dir
                .join("public")
                .join("data")
                .join(CATALOG_FILE_NAME),
        );
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            push_candidate(
                &mut paths,
                exe_dir.join("data").join(CATALOG_FILE_NAME),
            );
            push_candidate(
                &mut paths,
                exe_dir
                    .join("resources")
                    .join("data")
                    .join(CATALOG_FILE_NAME),
            );
        }
    }

    paths
}

#[tauri::command]
pub fn load_puzzle_catalog(app: AppHandle) -> Result<String, String> {
    let candidates = candidate_paths(&app);

    for path in &candidates {
        if path.is_file() {
            return fs::read_to_string(path)
                .map_err(|error| format!("Failed to read {}: {}", path.display(), error));
        }
    }

    let attempted = candidates
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");

    Err(format!("Puzzle catalog not found. Tried: {}", attempted))
}
