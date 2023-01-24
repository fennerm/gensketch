use std::path::PathBuf;

use uuid::Uuid;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::refseq::{get_default_reference, ReferenceSequence};
use crate::errors::{CommandError, CommandResult};
use crate::file_formats::sam_bam::aligned_read::AlignedPair;
use crate::file_formats::sam_bam::stack::AlignmentStack;
use crate::interface::backend::Backend;
use crate::interface::events::{emit_event, FocusedRegionUpdated};
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
    focused_region: Option<GenomicRegion>,
) -> CommandResult<serde_json::value::Value> {
    let mut splits = state.splits.lock();
    let new_split = splits.add_split(focused_region)?;
    let result_json = serde_json::value::to_value(&new_split)?;
    emit_event(&app, "split-added", &new_split)?;
    Ok(result_json)
}

#[tauri::command]
pub fn default_reference() -> CommandResult<Option<ReferenceSequence>> {
    return Ok(get_default_reference()?);
}

// TODO Return nothing when window too large
#[tauri::command]
pub fn get_alignments(
    state: tauri::State<Backend>,
    genomic_region: Option<GenomicRegion>,
    track_id: Uuid,
) -> CommandResult<AlignmentStack<AlignedPair>> {
    let genomic_region = match genomic_region {
        Some(region) => region,
        None => return Ok(AlignmentStack::default()),
    };
    let mut ref_seq_reader = state.ref_seq_reader.lock();
    let mut tracks = state.tracks.lock();
    let track = tracks.get_track(track_id)?;
    if let Track::Alignment(alignment_track) = track {
        match &mut *ref_seq_reader {
            Some(reader) => {
                let refseq = reader.read(&genomic_region)?;
                let alignments = alignment_track.read_alignments(&genomic_region, &refseq)?;
                log::debug!("Fetched {} alignments in {}", alignments.len(), &genomic_region);
                Ok(alignments)
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
    let event =
        FocusedRegionUpdated { split_id: split_id.clone(), genomic_region: genomic_region.clone() };
    emit_event(&app, "focused-region-updated", &event)?;
    split.focused_region = genomic_region;
    let result_json = serde_json::value::to_value(event)?;
    Ok(result_json)
}
