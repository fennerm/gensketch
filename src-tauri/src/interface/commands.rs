/// Tauri commands to be called from the frontend
use std::path::PathBuf;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::refseq::get_default_reference;
use crate::errors::CommandResult;
use crate::file_formats::enums::AlignmentStackKind;
use crate::interface::alignments_manager::AlignmentsManager;
use crate::interface::backend::Backend;
use crate::interface::events::{
    emit_event, AlignmentsUpdatedPayload, ClearAlignmentsPayload, Event,
    FocusedRegionUpdatedPayload, FocusedSequenceUpdatedPayload,
};
use crate::interface::split::{BoundState, Split, SplitId, SplitList};
use crate::interface::track::{TrackId, TrackList};

#[tauri::command(async)]
pub fn add_alignment_track(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    bam_path: PathBuf,
) -> CommandResult<()> {
    log::info!("Adding alignment track for {}", bam_path.to_string_lossy().to_string());
    let default_focused_region = state.reference_sequence.read().default_focused_region.clone();
    let mut tracks = state.tracks.write();
    let num_existing_tracks = tracks.inner.len();
    let new_track = tracks.add_alignment_track(bam_path.clone())?;
    let mut alignments_manager = state.alignments.write();
    if num_existing_tracks == 0 {
        log::info!("Adding split with focused region: {}", &default_focused_region);
        let seq_length =
            state.reference_sequence.read().get_seq_length(&default_focused_region.seq_name)?;
        let mut splits = state.splits.write();
        let new_split = splits.add_split(default_focused_region.clone(), seq_length)?;
        alignments_manager.add_first_track(
            &new_track.id(),
            bam_path,
            &new_split.id,
            default_focused_region,
        )?;
        emit_event(&app, Event::SplitAdded, &new_split)?;
    } else {
        alignments_manager.add_track(&new_track.id(), bam_path)?;
    }
    emit_event(&app, Event::TrackAdded, &new_track)?;
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
    let splits = state.splits.read();
    let split = splits.get_split(split_id)?;
    let focused_region = split.focused_region();
    let json = serde_json::to_value(&*focused_region)?;
    Ok(json)
}

#[tauri::command(async)]
pub fn get_focused_sequence(
    state: tauri::State<Backend>,
    split_id: SplitId,
) -> CommandResult<Option<String>> {
    let splits = state.splits.read();
    let split = splits.get_split(split_id)?;
    let focused_region = split.focused_region();
    match split.check_bounds(&focused_region) {
        BoundState::OutsideRenderRange => Ok(None),
        _ => {
            Ok(Some(state.reference_sequence.write().read_sequence(&focused_region)?.to_string()?))
        }
    }
}

#[tauri::command(async)]
pub fn get_reference_sequence(state: tauri::State<Backend>) -> CommandResult<serde_json::Value> {
    let json = serde_json::to_value(&*state.reference_sequence.read())?;
    Ok(json)
}

#[tauri::command(async)]
pub fn get_alignments(
    state: tauri::State<Backend>,
    track_id: TrackId,
    split_id: SplitId,
) -> CommandResult<serde_json::Value> {
    let alignments_manager = state.alignments.read();
    let alignments = alignments_manager.get_alignments(track_id, split_id)?;
    let json = serde_json::to_value(&*alignments.read())?;
    Ok(json)
}

#[tauri::command(async)]
pub fn initialize(app: tauri::AppHandle, state: tauri::State<Backend>) -> CommandResult<()> {
    log::info!("Initializing backend");
    let mut refseq = state.reference_sequence.write();
    *refseq = get_default_reference()?;
    let mut splits = state.splits.write();
    *splits = SplitList::new();
    let mut tracks = state.tracks.write();
    *tracks = TrackList::new();
    let mut alignments = state.alignments.write();
    *alignments = AlignmentsManager::new();
    drop(splits);
    drop(tracks);
    emit_event(&app, Event::RefSeqFileUpdated, &*refseq)?;
    drop(refseq);
    emit_event(&app, Event::SplitGridCleared, {})?;
    let user_config = state.user_config.read();
    emit_event(&app, Event::UserConfigUpdated, &*user_config)?;
    log::info!("Backend initialization complete");
    Ok(())
}

#[tauri::command(async)]
pub fn add_split(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    focused_region: Option<GenomicRegion>,
) -> CommandResult<()> {
    let split_region = match focused_region {
        Some(region) => region,
        None => state.get_default_new_split_region()?,
    };
    log::info!("Adding split with focused genomic region: {}", &split_region);
    let seq_length = state.reference_sequence.read().get_seq_length(&split_region.seq_name)?;
    let mut splits = state.splits.write();
    let new_split = splits.add_split(split_region.clone(), seq_length)?;
    let mut alignments_manager = state.alignments.write();
    alignments_manager.add_split(&new_split.id, split_region)?;
    drop(alignments_manager);
    emit_event(&app, Event::SplitAdded, &new_split)?;
    Ok(())
}

#[tauri::command(async)]
pub fn update_focused_region(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    split_id: SplitId,
    genomic_region: GenomicRegion,
) -> CommandResult<()> {
    log::info!("Updating focused region for split {} to {}", &split_id, &genomic_region);
    let mut splits = state.splits.write();
    let split = splits.get_split_mut(split_id)?;
    let bound_state = split.check_bounds(&genomic_region);
    drop(split);
    drop(splits);
    state.update_split_region(split_id, genomic_region.clone())?;
    emit_event(
        &app,
        Event::FocusedRegionUpdated,
        FocusedRegionUpdatedPayload { split_id, genomic_region: genomic_region.clone() },
    )?;

    let mut alignments_manager = state.alignments.write();
    let sequence_view = match bound_state {
        BoundState::OutsideRenderRange => None,
        _ => Some(state.reference_sequence.write().read_sequence(&genomic_region)?),
    };
    let sequence = sequence_view.as_ref().map(|sv| sv.to_string()).transpose()?;
    emit_event(
        &app,
        Event::FocusedSequenceUpdated,
        FocusedSequenceUpdatedPayload { split_id, sequence },
    )?;
    match bound_state {
        BoundState::OutsideBuffered => {
            emit_event(&app, Event::ClearAlignments, ClearAlignmentsPayload { split_id })?;
            let updated_alignments = alignments_manager.update_alignments(
                &split_id,
                &genomic_region,
                &sequence_view.unwrap(),
            )?;
            updated_alignments
                .iter()
                .map(|(track_id, alignments)| {
                    let payload = AlignmentsUpdatedPayload {
                        split_id,
                        track_id: *track_id,
                        focused_region: genomic_region.clone(),
                        alignments: &alignments.read(),
                    };
                    emit_event(&app, Event::AlignmentsUpdated, payload)
                })
                .collect::<anyhow::Result<_>>()?;
        }
        BoundState::OutsideRefreshBound => {
            let updated_alignments = alignments_manager.update_alignments(
                &split_id,
                &genomic_region,
                &sequence_view.unwrap(),
            )?;
            updated_alignments
                .iter()
                .map(|(track_id, alignments)| {
                    let payload = AlignmentsUpdatedPayload {
                        split_id,
                        track_id: *track_id,
                        focused_region: genomic_region.clone(),
                        alignments: &alignments.read(),
                    };
                    emit_event(&app, Event::AlignmentsUpdateQueued, payload)
                })
                .collect::<anyhow::Result<_>>()?;
        }
        BoundState::OutsideRenderRange => {
            let updated_alignments =
                alignments_manager.clear_alignments(&split_id, &genomic_region)?;
            updated_alignments
                .iter()
                .map(|(track_id, alignments)| {
                    let payload = AlignmentsUpdatedPayload {
                        split_id,
                        track_id: *track_id,
                        focused_region: genomic_region.clone(),
                        alignments: &alignments.read(),
                    };
                    emit_event(&app, Event::AlignmentsUpdated, payload)
                })
                .collect::<anyhow::Result<_>>()?;
        }
        BoundState::WithinRefreshBound => (),
    };
    Ok(())
}
