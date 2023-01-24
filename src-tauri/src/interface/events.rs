use anyhow::Result;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::bio_util::genomic_coordinates::GenomicRegion;

pub fn emit_event<S: Serialize + Clone>(app: &AppHandle, event: &str, payload: S) -> Result<()> {
    app.emit_all(event, &payload)?;
    log::debug!("{} event {}", event, serde_json::to_string(&payload)?);
    Ok(())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusedRegionUpdated {
    pub split_id: Uuid,
    pub genomic_region: Option<GenomicRegion>,
}
