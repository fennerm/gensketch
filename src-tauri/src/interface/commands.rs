/// Tauri commands to be called from the frontend
use std::path::PathBuf;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::errors::CommandResult;
use crate::interface::backend::Backend;
use crate::interface::events::{EventEmitter, FocusedSequenceUpdatedPayload};
use crate::interface::split::SplitId;
use crate::interface::split_grid::SplitGrid;
use crate::interface::track::TrackId;

#[tauri::command(async)]
pub fn add_alignment_track(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    file_path: PathBuf,
) -> CommandResult<()> {
    let event_emitter = EventEmitter::new(&app);
    state.split_grid.read().add_track(&event_emitter, file_path)?;
    Ok(())
}
#[tauri::command(async)]
pub fn get_user_config(state: tauri::State<Backend>) -> CommandResult<serde_json::Value> {
    let user_config = serde_json::to_value(&*state.user_config.read())?;
    log::debug!("Sending initial user config: {}", &user_config);
    Ok(user_config)
}

#[tauri::command(async)]
pub fn get_focused_region(
    state: tauri::State<Backend>,
    split_id: SplitId,
) -> CommandResult<serde_json::Value> {
    let focused_region =
        state.split_grid.read().get_split(&split_id)?.read().focused_region.clone();
    let json = serde_json::to_value(&focused_region)?;
    Ok(json)
}

#[tauri::command(async)]
pub fn get_focused_sequence(
    state: tauri::State<Backend>,
    split_id: SplitId,
) -> CommandResult<serde_json::Value> {
    let split_grid = state.split_grid.read();
    let split = split_grid.get_split(&split_id)?;
    let payload = FocusedSequenceUpdatedPayload {
        split_id: &split_id,
        focused_region: &split.read().focused_region,
        buffered_region: &split.read().buffered_region,
        focused_sequence: &split.read().focused_sequence_as_string()?,
        buffered_sequence: &split.read().buffered_sequence_as_string()?,
    };
    let json = serde_json::to_value(payload)?;
    Ok(json)
}

#[tauri::command(async)]
pub fn get_reference_sequence(state: tauri::State<Backend>) -> CommandResult<serde_json::Value> {
    let json = serde_json::to_value(&*state.split_grid.read().reference.read())?;
    Ok(json)
}

#[tauri::command(async)]
pub fn get_alignments(
    state: tauri::State<Backend>,
    track_id: TrackId,
    split_id: SplitId,
) -> CommandResult<serde_json::Value> {
    let alignments = state.split_grid.read().get_stack_reader(&split_id, &track_id)?.read().stack();
    let json = serde_json::to_value(&*alignments.read())?;
    Ok(json)
}

#[tauri::command(async)]
pub fn get_splits(state: tauri::State<Backend>) -> CommandResult<serde_json::Value> {
    let json = serde_json::to_value(&state.split_grid.read().splits)?;
    Ok(json)
}

#[tauri::command(async)]
pub fn initialize(state: tauri::State<Backend>) -> CommandResult<()> {
    state.initialize()?;
    Ok(())
}

#[tauri::command(async)]
pub fn add_split(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    focused_region: Option<GenomicRegion>,
) -> CommandResult<()> {
    let event_emitter = EventEmitter::new(&app);
    let split_grid = state.split_grid.read();
    split_grid.add_split(&event_emitter, focused_region)?;
    Ok(())
}

#[tauri::command(async)]
pub fn update_focused_region(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    split_id: SplitId,
    genomic_region: GenomicRegion,
) -> CommandResult<()> {
    let event_emitter = EventEmitter::new(&app);
    Ok(state.split_grid.read().update_focused_region(&event_emitter, &split_id, genomic_region)?)
}
