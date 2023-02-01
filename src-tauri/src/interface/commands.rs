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

#[tauri::command(async)]
pub fn add_alignment_track(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    bam_path: PathBuf,
) -> CommandResult<serde_json::value::Value> {
    let mut tracks = state.tracks.write();
    let num_existing_tracks = tracks.tracks.len();
    if num_existing_tracks == 0 {
        let mut splits = state.splits.write();
        let new_split = splits.add_split(None)?;
        emit_event(&app, "split-added", &new_split)?;
    }
    let new_track = tracks.add_alignment_track(bam_path)?;
    emit_event(&app, "track-added", &new_track)?;
    let result_json = serde_json::value::to_value(&new_track)?;
    Ok(result_json)
}

#[tauri::command(async)]
pub fn add_split(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    focused_region: Option<GenomicRegion>,
) -> CommandResult<serde_json::value::Value> {
    let mut splits = state.splits.write();
    let new_split = splits.add_split(focused_region)?;
    let result_json = serde_json::value::to_value(&new_split)?;
    emit_event(&app, "split-added", &new_split)?;
    Ok(result_json)
}

#[tauri::command(async)]
pub fn default_reference() -> CommandResult<Option<ReferenceSequence>> {
    return Ok(get_default_reference()?);
}

// TODO Return nothing when window too large
#[tauri::command(async)]
pub fn get_alignments(
    state: tauri::State<Backend>,
    genomic_region: Option<GenomicRegion>,
    track_id: Uuid,
) -> CommandResult<AlignmentStack<AlignedPair>> {
    let genomic_region = match genomic_region {
        Some(region) => region,
        None => return Ok(AlignmentStack::default()),
    };
    let mut ref_seq_reader = match &*state.reference_sequence.read() {
        Some(refseq) => refseq.get_reader()?,
        None => {
            return Err(CommandError::ValidationError("No reference sequence loaded".to_owned()))
        }
    };
    let tracks = state.tracks.read();
    let track = tracks.get_track(track_id)?;
    if let Track::Alignment(alignment_track) = track {
        let refseq = ref_seq_reader.read(&genomic_region)?;
        let alignments = alignment_track.read_alignments(&genomic_region, &refseq)?;
        log::debug!("Fetched {} alignments in {}", alignments.len(), &genomic_region);
        Ok(alignments)
    } else {
        Err(CommandError::ValidationError(format!(
            "Cannot call get_alignments on track {} (invalid track type)",
            track.name()
        )))
    }
}

#[tauri::command(async)]
pub fn get_reference_sequence(
    state: tauri::State<Backend>,
    genomic_region: GenomicRegion,
) -> CommandResult<String> {
    match &*state.reference_sequence.read() {
        Some(refseq) => {
            // For now just initialize a fresh reader on each command. In future we might want to
            // optimize this to use a pool of pre-initialized readers instead.
            Ok(refseq.get_reader()?.read(&genomic_region)?.to_string()?)
        }
        None => Err(CommandError::ValidationError("No reference sequence loaded".to_owned())),
    }
}

#[tauri::command(async)]
pub fn update_focused_region(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    split_id: Uuid,
    genomic_region: Option<GenomicRegion>,
) -> CommandResult<serde_json::value::Value> {
    let mut splits = state.splits.write();
    let mut split = splits.get_split(split_id)?;
    let event =
        FocusedRegionUpdated { split_id: split_id.clone(), genomic_region: genomic_region.clone() };
    emit_event(&app, "focused-region-updated", &event)?;
    split.focused_region = genomic_region;
    let result_json = serde_json::value::to_value(event)?;
    Ok(result_json)
}
