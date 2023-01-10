use anyhow::Result;
use serde::Serialize;
use tauri::AppHandle;
use tauri::Manager;

pub fn emit_event<S: Serialize + Clone>(app: &AppHandle, event: &str, payload: S) -> Result<()> {
    app.emit_all(event, &payload)?;
    log::debug!("{} event {}", event, serde_json::to_string(&payload)?);
    Ok(())
}
