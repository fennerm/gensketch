use std::path::PathBuf;

use uuid::Uuid;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::refseq::{get_default_reference, ReferenceSequence};
use crate::errors::{CommandError, CommandResult};
use crate::file_formats::sam_bam::aligned_read::AlignedPair;
use crate::file_formats::sam_bam::stack::AlignmentStack;
use crate::interface::backend::Backend;
use crate::interface::events::emit_event;
use crate::interface::track::Track;

#[tauri::command]
pub fn add_alignment_track(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    bam_path: PathBuf,
) -> CommandResult<serde_json::value::Value> {
    let mut tracks = state.tracks.lock();
    let num_existing_tracks = tracks.tracks.len();
    if num_existing_tracks == 0 {
        let mut splits = state.splits.lock();
        let new_split = splits.add_split(None)?;
        emit_event(&app, "split-added", &new_split)?;
    }
    let new_track = tracks.add_alignment_track(bam_path)?;
    emit_event(&app, "track-added", &new_track)?;
    let result_json = serde_json::value::to_value(&new_track)?;
    Ok(result_json)
}

#[tauri::command]
pub fn add_split(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    focused_region: GenomicRegion,
) -> CommandResult<serde_json::value::Value> {
    let mut splits = state.splits.lock();
    let new_split = splits.add_split(Some(focused_region))?;
    let result_json = serde_json::value::to_value(&new_split)?;
    emit_event(&app, "split-added", &new_split)?;
    Ok(result_json)
}

#[tauri::command]
pub fn default_reference() -> CommandResult<Option<ReferenceSequence>> {
    return Ok(get_default_reference()?);
}

#[tauri::command]
pub fn get_alignments(
    state: tauri::State<Backend>,
    genomic_region: GenomicRegion,
    track_id: Uuid,
) -> CommandResult<AlignmentStack<AlignedPair>> {
    let mut ref_seq_reader = state.ref_seq_reader.lock();
    let mut tracks = state.tracks.lock();
    let track = tracks.get_track(track_id)?;
    if let Track::Alignment(alignment_track) = track {
        match &mut *ref_seq_reader {
            Some(reader) => {
                let refseq = reader.read(&genomic_region)?;
                Ok(alignment_track.read_alignments(&genomic_region, &refseq)?)
            }
            None => Err(CommandError::ValidationError("No reference sequence loaded".to_owned())),
        }
    } else {
        Err(CommandError::ValidationError(format!(
            "Cannot call get_alignments on track {} (invalid track type)",
            track.name()
        )))
    }
}

#[tauri::command]
pub fn get_reference_sequence(
    state: tauri::State<Backend>,
    genomic_region: GenomicRegion,
) -> CommandResult<String> {
    let mut ref_seq_reader = state.ref_seq_reader.lock();
    match &mut *ref_seq_reader {
        Some(reader) => Ok(reader.read(&genomic_region)?.to_string()?),
        None => Err(CommandError::ValidationError("No reference sequence loaded".to_owned())),
    }
}

#[tauri::command]
pub fn update_focused_region(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    split_id: Uuid,
    genomic_region: Option<GenomicRegion>,
) -> CommandResult<serde_json::value::Value> {
    let mut splits = state.splits.lock();
    let mut split = splits.get_split(split_id)?;
    emit_event(&app, "focused-region-updated", &genomic_region)?;
    split.focused_region = genomic_region;
    let result_json = serde_json::value::to_value(&split)?;
    Ok(result_json)
}
