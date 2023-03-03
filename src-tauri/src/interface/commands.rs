/// Tauri commands to be called from the frontend
use std::path::PathBuf;

use anyhow::Result;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::refseq::get_default_reference;
use crate::errors::CommandResult;
use crate::interface::alignments_manager::AlignmentsManager;
use crate::interface::backend::Backend;
use crate::interface::events::{
    emit_event, AlignmentsUpdatedPayload, ClearAlignmentsPayload, Event,
    FocusedRegionUpdatedPayload, FocusedSequenceUpdatedPayload,
};
use crate::interface::split::{BoundState, SplitId, SplitList};
use crate::interface::track::TrackList;

fn add_split_helper(
    state: &tauri::State<Backend>,
    app: &tauri::AppHandle,
    focused_region: GenomicRegion,
) -> Result<SplitId> {
    let mut splits = state.splits.write();
    let new_split = splits.add_split(focused_region.clone())?;
    let mut alignments_manager = state.alignments.write();
    alignments_manager.add_split(&new_split.id, focused_region)?;
    emit_event(app, Event::SplitAdded, &new_split)?;
    Ok(new_split.id)
}

#[tauri::command(async)]
pub fn add_alignment_track(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    bam_path: PathBuf,
) -> CommandResult<()> {
    let default_focused_region = state.reference_sequence.read().default_focused_region.clone();
    let mut tracks = state.tracks.write();
    let num_existing_tracks = tracks.inner.len();
    let new_track = tracks.add_alignment_track(bam_path.clone())?;
    let mut alignments_manager = state.alignments.write();
    let new_split_id = add_split_helper(&state, &app, default_focused_region.clone())?;
    if num_existing_tracks == 0 {
        alignments_manager.add_first_track(
            &new_track.id(),
            bam_path,
            &new_split_id,
            default_focused_region,
        )?;
    } else {
        alignments_manager.add_track(&new_track.id(), bam_path)?;
    }
    emit_event(&app, Event::TrackAdded, &new_track)?;
    Ok(())
}

#[tauri::command(async)]
pub fn initialize(app: tauri::AppHandle, state: tauri::State<Backend>) -> CommandResult<()> {
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
    add_split_helper(&state, &app, split_region)?;
    Ok(())
}

#[tauri::command(async)]
pub fn update_focused_region(
    app: tauri::AppHandle,
    state: tauri::State<Backend>,
    split_id: SplitId,
    genomic_region: GenomicRegion,
) -> CommandResult<()> {
    let mut splits = state.splits.write();
    let split = splits.get_split(split_id)?;
    let bound_state = split.check_bounds(&genomic_region);
    state.update_split_region(split_id, genomic_region.clone())?;
    emit_event(
        &app,
        Event::FocusedRegionUpdated,
        FocusedRegionUpdatedPayload { split_id, genomic_region: genomic_region.clone() },
    )?;

    let mut alignments_manager = state.alignments.write();
    match bound_state {
        BoundState::OutsideBuffered => {
            emit_event(&app, Event::ClearAlignments, ClearAlignmentsPayload { split_id })?;
            let sequence_view = state.reference_sequence.write().read_sequence(&genomic_region)?;
            emit_event(
                &app,
                Event::FocusedSequenceUpdated,
                FocusedSequenceUpdatedPayload {
                    split_id,
                    sequence: Some(sequence_view.to_string()?),
                },
            )?;
            let updated_alignments =
                alignments_manager.update_alignments(&split_id, &genomic_region, &sequence_view)?;
            updated_alignments
                .iter()
                .map(|(track_id, alignments)| {
                    let payload = AlignmentsUpdatedPayload {
                        split_id,
                        track_id: *track_id,
                        alignments: &alignments.read(),
                    };
                    emit_event(&app, Event::AlignmentsUpdated, payload)
                })
                .collect::<anyhow::Result<_>>()?;
        }
        BoundState::OutsideRefreshBound => {
            let sequence_view = state.reference_sequence.write().read_sequence(&genomic_region)?;
            emit_event(
                &app,
                Event::FocusedSequenceUpdated,
                FocusedSequenceUpdatedPayload {
                    split_id,
                    sequence: Some(sequence_view.to_string()?),
                },
            )?;
            let mut alignments_manager = state.alignments.write();
            let updated_alignments =
                alignments_manager.update_alignments(&split_id, &genomic_region, &sequence_view)?;
            updated_alignments
                .iter()
                .map(|(track_id, alignments)| {
                    let payload = AlignmentsUpdatedPayload {
                        split_id,
                        track_id: *track_id,
                        alignments: &alignments.read(),
                    };
                    emit_event(&app, Event::AlignmentsUpdateQueued, payload)
                })
                .collect::<anyhow::Result<_>>()?;
        }
        BoundState::OutsideRenderRange => {
            emit_event(
                &app,
                Event::FocusedSequenceUpdated,
                FocusedSequenceUpdatedPayload { split_id, sequence: None },
            )?;
            let updated_alignments =
                alignments_manager.clear_alignments(&split_id, &genomic_region)?;
            updated_alignments
                .iter()
                .map(|(track_id, alignments)| {
                    let payload = AlignmentsUpdatedPayload {
                        split_id,
                        track_id: *track_id,
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
