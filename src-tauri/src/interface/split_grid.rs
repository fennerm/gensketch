use std::path::PathBuf;

use anyhow::{Context, Result};
use dashmap::mapref::one::Ref;
use dashmap::DashMap;
use parking_lot::RwLock;
use rayon::prelude::*;
use std::time::{Duration, Instant};

use crate::alignments::stack_reader::StackReader;
use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::refseq::{get_default_reference, ReferenceSequence};
use crate::interface::events::{
    AlignmentsUpdatedPayload, EmitEvent, Event, FocusedRegionUpdatedPayload,
    FocusedSequenceUpdatedPayload, RegionBufferingPayload,
};
use crate::interface::split::{BoundState, Split, SplitId};
use crate::interface::track::{AlignmentTrack, Track, TrackId};
use crate::util::Direction;

#[derive(Debug)]
pub struct SplitGrid {
    pub splits: DashMap<SplitId, RwLock<Split>>,
    pub tracks: DashMap<TrackId, RwLock<Track>>,
    pub reference: RwLock<ReferenceSequence>,
    pub focused_split: RwLock<SplitId>,
    alignments: DashMap<(TrackId, SplitId), RwLock<StackReader>>,
    max_render_window: RwLock<u64>,
}

impl SplitGrid {
    pub fn new(max_render_window: u64) -> Result<Self> {
        let reference = RwLock::new(get_default_reference()?);
        let default_focused_region = reference.read().default_focused_region.clone();
        let splits = DashMap::new();
        let tracks = DashMap::new();
        let seq_length = default_focused_region.end();
        let split = Split::new(
            reference.read().path.clone(),
            default_focused_region,
            max_render_window,
            seq_length,
        )?;
        let focused_split = RwLock::new(split.id.clone());
        splits.insert(split.id, RwLock::new(split));
        let alignments = DashMap::new();
        let max_render_window = RwLock::new(max_render_window);
        Ok(Self { splits, tracks, reference, alignments, max_render_window, focused_split })
    }

    pub fn set_max_render_window(&self, max_render_window: u64) -> Result<()> {
        *self.max_render_window.write() = max_render_window;
        for entry in self.splits.iter() {
            entry.value().write().set_max_render_window(max_render_window)?;
        }
        Ok(())
    }

    pub fn get_stack_reader(
        &self,
        split_id: &SplitId,
        track_id: &TrackId,
    ) -> Result<Ref<(TrackId, SplitId), RwLock<StackReader>>> {
        let stack_reader =
            self.alignments.get(&(track_id.clone(), split_id.clone())).with_context(|| {
                format!("Failed to find a stack reader for track={}, split={}", track_id, split_id)
            })?;
        Ok(stack_reader)
    }

    pub fn get_split(&self, split_id: &SplitId) -> Result<Ref<SplitId, RwLock<Split>>> {
        let focused_region_manager = self
            .splits
            .get(split_id)
            .with_context(|| format!("Failed to find split with id={}", split_id))?;
        Ok(focused_region_manager)
    }

    fn update_alignments(&self, split_id: &SplitId, track_id: &TrackId) -> Result<()> {
        let stack_reader = self.get_stack_reader(split_id, track_id)?;
        let split = self.get_split(split_id)?;
        let buffered_region = split.read().buffered_region.clone();

        // Cloning here so that the focused_region_manager isn't write-locked while alignments are
        // being read. Users need to be able to update the focused region even if we are currently
        // reading from a bam file.
        let buffered_sequence = split.read().buffered_sequence.clone();
        match buffered_sequence {
            Some(seq) => stack_reader.write().read_stacked(&buffered_region, &seq)?,
            None => stack_reader.write().clear_stack(&buffered_region)?,
        }
        Ok(())
    }

    fn add_stack_reader(
        &self,
        file_path: &PathBuf,
        split_id: &SplitId,
        track_id: &TrackId,
    ) -> Result<()> {
        let stack_reader = StackReader::new(file_path)?;
        self.alignments.insert((track_id.clone(), split_id.clone()), RwLock::new(stack_reader));
        Ok(())
    }

    fn get_split_ids(&self) -> Vec<SplitId> {
        self.splits.iter().map(|entry| entry.key().clone()).collect()
    }

    fn init_track_alignments(&self, track_id: &TrackId) -> Result<()> {
        let track = self
            .tracks
            .get_mut(&track_id)
            .context(format!("Failed to find track for id={}", &track_id))?;
        let file_path = track.read().file_path().clone();
        drop(track);

        let split_ids = self.get_split_ids();
        for split_id in split_ids.iter() {
            self.add_stack_reader(&file_path, &split_id, track_id)?;
        }
        split_ids
            .par_iter()
            .map(|split_id| {
                self.update_alignments(split_id, track_id)?;
                Ok(())
            })
            .collect::<Result<_>>()?;
        Ok(())
    }

    fn update_split_alignments(&self, split_id: &SplitId) -> Result<()> {
        let split = self.get_split(split_id)?;
        self.tracks
            .par_iter()
            .map(|entry| {
                let stack_reader = self.get_stack_reader(&split.read().id, entry.key())?;
                match &split.read().buffered_sequence {
                    Some(buffered_sequence) => stack_reader
                        .write()
                        .read_stacked(&split.read().buffered_region, buffered_sequence),
                    None => stack_reader.write().clear_stack(&split.read().buffered_region),
                }
            })
            .collect()
    }

    pub fn add_track<E: EmitEvent, P: Into<PathBuf>>(
        &self,
        event_emitter: &E,
        file_path: P,
    ) -> Result<TrackId> {
        let file_path: PathBuf = file_path.into();
        log::info!("Adding alignment track for {}", file_path.to_string_lossy().to_string());
        let track = Track::Alignment(AlignmentTrack::new(file_path)?);
        let track_id = track.id();
        self.tracks.insert(track.id(), RwLock::new(track));
        self.init_track_alignments(&track_id)?;
        let track = self.tracks.get(&track_id).unwrap();
        event_emitter.emit(Event::TrackAdded, &*track.read())?;
        Ok(track_id)
    }

    fn get_default_focused_region(&self) -> Result<GenomicRegion> {
        let focused_region;
        if self.splits.len() > 0 {
            focused_region = self
                .get_split(&self.focused_split.read())
                .context(format!("Failed to find split id={}", &self.focused_split.read()))?
                .read()
                .focused_region
                .clone();
        } else {
            focused_region = self.reference.read().default_focused_region.clone()
        }
        Ok(focused_region)
    }

    pub fn add_split<E: EmitEvent>(
        &self,
        event_emitter: &E,
        focused_region: Option<GenomicRegion>,
    ) -> Result<SplitId> {
        let focused_region = match focused_region {
            Some(region) => region,
            None => self.get_default_focused_region()?,
        };
        let seq_length = self.reference.read().get_seq_length(&focused_region.seq_name)?;
        let split = Split::new(
            self.reference.read().path.clone(),
            focused_region,
            *self.max_render_window.read(),
            seq_length,
        )?;
        *self.focused_split.write() = split.id.clone();
        let split_id = split.id.clone();
        self.splits.insert(split.id, RwLock::new(split));
        let tracks_info: Vec<(TrackId, PathBuf)> = self
            .tracks
            .iter()
            .map(|track| (track.read().id(), track.read().file_path().clone()))
            .collect();
        for (track_id, file_path) in tracks_info.iter() {
            self.add_stack_reader(file_path, &split_id, track_id)?;
        }
        tracks_info
            .par_iter()
            .map(|(track_id, _)| {
                self.update_alignments(&split_id, track_id)?;
                Ok(())
            })
            .collect::<Result<_>>()?;
        let split = self.splits.get(&split_id).unwrap();
        event_emitter.emit(Event::SplitAdded, &*split.read())?;
        event_emitter.emit(Event::FocusedSplitUpdated, &split_id)?;
        Ok(split_id)
    }

    pub fn pan_focused_split<E: EmitEvent>(
        &self,
        event_emitter: &E,
        direction: &Direction,
    ) -> Result<()> {
        let focused_split_id = self.focused_split.read().clone();
        let mut updated_region = self.get_split(&focused_split_id)?.read().focused_region.clone();
        let mut panned_bp = updated_region.len() / 10 as u64;
        match direction {
            Direction::Left => {
                if updated_region.start().saturating_sub(panned_bp) == 0 {
                    panned_bp = updated_region.start();
                }
                log::debug!("Panning focused split={} left by {}bp", focused_split_id, panned_bp);
                updated_region.interval.start -= panned_bp;
                updated_region.interval.end -= panned_bp;
            }
            Direction::Right => {
                let seq_length = self.reference.read().get_seq_length(&updated_region.seq_name)?;
                if updated_region.end() + panned_bp > seq_length {
                    panned_bp = seq_length - updated_region.end();
                }
                log::debug!("Panning focused split={} right by {}bp", focused_split_id, panned_bp);
                updated_region.interval.start += panned_bp;
                updated_region.interval.end += panned_bp;
            }
        };
        self.update_focused_region(event_emitter, &focused_split_id, updated_region)?;
        Ok(())
    }

    pub fn update_focused_region<E: EmitEvent>(
        &self,
        event_emitter: &E,
        split_id: &SplitId,
        genomic_region: GenomicRegion,
    ) -> Result<()> {
        log::info!("Updating focused region for split {} to {}", &split_id, &genomic_region);
        let split = self.get_split(split_id)?;
        if split.read().focused_region == genomic_region {
            return Ok(());
        }
        let prev_region_len = split.read().focused_region.len();
        let seq_length = self.reference.read().get_seq_length(&genomic_region.seq_name)?;
        let bound_state = split.read().check_bounds(&genomic_region);

        // We notify the frontend of the update before actually making the change on the backend
        // Need to make sure that the split is write locked until the frontend and backend are back
        // in sync.
        let mut split_write_lock = split.write();
        let focused_region_update_payload =
            FocusedRegionUpdatedPayload { split_id: &split_id, genomic_region: &genomic_region };
        event_emitter.emit(Event::FocusedRegionUpdated, &focused_region_update_payload)?;

        // If the frontend already has the necessary alignments cached we can just inform it that a
        // zoom or pan is necessay.
        match &bound_state {
            BoundState::WithinRefreshBound | BoundState::OutsideRefreshBound => {
                if genomic_region.len() == prev_region_len {
                    event_emitter.emit(Event::RegionPanned, &focused_region_update_payload)?;
                } else {
                    event_emitter.emit(Event::RegionZoomed, &focused_region_update_payload)?;
                }
            }
            BoundState::OutsideBuffered => {
                event_emitter.emit(Event::RegionBuffering, RegionBufferingPayload { split_id })?;
            }
            _ => (),
        }

        split_write_lock.set_focused_region(genomic_region.clone(), seq_length)?;
        drop(split_write_lock);

        let buffered_sequence = split.read().buffered_sequence_as_string()?;
        let focused_sequence = split.read().focused_sequence_as_string()?;

        let focused_sequence_update_payload = FocusedSequenceUpdatedPayload {
            split_id,
            focused_region: &genomic_region,
            buffered_region: &split.read().buffered_region,
            buffered_sequence: &buffered_sequence,
            focused_sequence: &focused_sequence,
        };
        match &bound_state {
            BoundState::OutsideBuffered | BoundState::OutsideRenderRange => {
                event_emitter
                    .emit(Event::FocusedSequenceUpdated, focused_sequence_update_payload)?;
            }
            BoundState::OutsideRefreshBound => {
                event_emitter
                    .emit(Event::FocusedSequenceUpdateQueued, focused_sequence_update_payload)?;
            }
            BoundState::WithinRefreshBound => (),
        };

        // TODO Emit event if error is encountered for a particular track
        let start = Instant::now();
        self.update_split_alignments(&split_id)?;
        let duration = start.elapsed();

        log::debug!("Time elapsed in update_split_alignments() is: {:?}", duration);

        for entry in self.tracks.iter() {
            let track_id = entry.key().clone();
            let stack_reader = self.get_stack_reader(&split_id, &track_id)?;
            let alignments = stack_reader.read().stack();
            let payload = AlignmentsUpdatedPayload {
                split_id: &split_id,
                track_id: &track_id,
                focused_region: &genomic_region,
                alignments: &alignments.read(),
            };
            // Depending on whether the new region falls within our already buffered region we may need to
            // load new alignments from the filesystem and notify the frontend.
            match &bound_state {
                BoundState::OutsideBuffered | BoundState::OutsideRenderRange => {
                    event_emitter.emit(Event::AlignmentsUpdated, payload)?;
                }
                BoundState::OutsideRefreshBound => {
                    event_emitter.emit(Event::AlignmentsUpdateQueued, payload)?;
                }
                BoundState::WithinRefreshBound => (),
            };
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::paths::get_test_data_path;

    use crate::interface::events::StubEventEmitter;

    use super::*;

    fn check_max_render_window(grid: &SplitGrid, expected_max_render_window: u64) {
        for entry in grid.splits.iter() {
            let split = entry.value();
            assert_eq!(split.read().max_render_window, expected_max_render_window);
        }
    }

    struct GridTestState {
        pub event_emitter: StubEventEmitter,
        pub max_render_window: u64,
        pub bam_path: PathBuf,
        pub grid: SplitGrid,
        pub split_id: SplitId,
        pub track_id: TrackId,
        pub buffered_region: GenomicRegion,
        pub focused_sequence: String,
        pub buffered_sequence: String,
    }

    fn init_basic_split_grid() -> GridTestState {
        let max_render_window = 10000;
        let grid = SplitGrid::new(max_render_window).unwrap();
        let event_emitter = StubEventEmitter::new();
        let bam_path = get_test_data_path("fake-genome.tiny.bam");
        let track_id = grid.add_track(&event_emitter, bam_path.clone()).unwrap();
        let split_id = grid.get_split_ids()[0];
        let split = grid.get_split(&split_id).unwrap();
        let buffered_region = split.read().buffered_region.clone();
        let focused_sequence =
            split.read().focused_sequence().unwrap().unwrap().to_string().unwrap();
        let buffered_sequence =
            split.read().buffered_sequence.clone().unwrap().to_string().unwrap();
        drop(split);
        GridTestState {
            event_emitter,
            max_render_window,
            bam_path,
            split_id: grid.get_split_ids()[0],
            grid,
            track_id,
            buffered_region,
            focused_sequence,
            buffered_sequence,
        }
    }

    #[test]
    fn test_initialization() {
        let test_state = init_basic_split_grid();
        assert_eq!(test_state.grid.splits.len(), 1);
        assert_eq!(test_state.grid.tracks.len(), 1);
        assert_eq!(test_state.grid.reference.read().name, "HG19");
        check_max_render_window(&test_state.grid, test_state.max_render_window)
    }

    #[test]
    fn test_set_max_render_window() {
        let test_state = init_basic_split_grid();
        let new_render_window = 10000;
        test_state.grid.set_max_render_window(new_render_window).unwrap();
        let focused_region = GenomicRegion::new("euk_genes", 0, 1000).unwrap();
        // Ensuring that updating max_render_window affects both existing splits and any added in
        // future
        test_state.grid.add_split(&test_state.event_emitter, Some(focused_region)).unwrap();
        check_max_render_window(&test_state.grid, new_render_window);
    }

    #[test]
    fn test_add_split() {
        let test_state = init_basic_split_grid();
        let focused_region = GenomicRegion::new("euk_genes", 0, 1000).unwrap();
        let split_id = test_state
            .grid
            .add_split(&test_state.event_emitter, Some(focused_region.clone()))
            .unwrap();
        assert_eq!(test_state.grid.splits.len(), 2);
        let payload = test_state.event_emitter.pop_until(&Event::SplitAdded);
        assert_eq!(
            payload.get("focusedRegion").unwrap(),
            &serde_json::to_value(&focused_region).unwrap()
        );
        assert_eq!(payload.get("id").unwrap().as_str().unwrap(), split_id.to_string());
    }

    #[test]
    fn test_get_split() {
        let test_state = init_basic_split_grid();
        let split = test_state.grid.get_split(&test_state.split_id).unwrap();
        assert_eq!(split.read().id, test_state.split_id);
    }

    #[test]
    fn test_get_stack_reader() {
        let test_state = init_basic_split_grid();
        let stack_reader =
            test_state.grid.get_stack_reader(&test_state.split_id, &test_state.track_id).unwrap();
        assert_eq!(stack_reader.read().path, test_state.bam_path);
    }

    #[test]
    fn test_add_track() {
        let test_state = init_basic_split_grid();
        assert_eq!(test_state.grid.tracks.len(), 1);
        test_state.grid.add_track(&test_state.event_emitter, test_state.bam_path.clone()).unwrap();
        assert_eq!(test_state.grid.tracks.len(), 2);
        let payload = test_state.event_emitter.pop_event(&Event::TrackAdded);
        assert_eq!(
            payload.get("filePath").unwrap().as_str().unwrap(),
            test_state.bam_path.to_str().unwrap()
        );
        assert_eq!(payload.get("id").unwrap().as_str().unwrap(), test_state.track_id.to_string());
    }

    #[test]
    fn test_update_focused_region_within_already_buffered_region() {
        let test_state = init_basic_split_grid();
        let new_focused_region = GenomicRegion::new("euk_genes", 0, 1000).unwrap();
        test_state
            .grid
            .update_focused_region(
                &test_state.event_emitter,
                &test_state.split_id,
                new_focused_region.clone(),
            )
            .unwrap();
        let split = test_state.grid.get_split(&test_state.split_id).unwrap();
        assert_eq!(split.read().focused_region, new_focused_region);
        test_state.event_emitter.pop_event(&Event::TrackAdded);

        let payload = test_state.event_emitter.pop_event(&Event::FocusedRegionUpdated);
        assert_eq!(
            payload.get("genomicRegion").unwrap(),
            &serde_json::to_value(&new_focused_region).unwrap(),
        );
        assert_eq!(
            payload.get("splitId").unwrap().as_str().unwrap(),
            test_state.split_id.to_string()
        );

        test_state.event_emitter.pop_event(&Event::RegionZoomed);

        let payload = test_state.event_emitter.pop_event(&Event::FocusedSequenceUpdated);
        assert_ne!(
            test_state.buffered_sequence,
            payload.get("bufferedSequence").unwrap().as_str().unwrap()
        );
        let new_buffered_region = payload.get("bufferedRegion").unwrap().to_string();
        assert_ne!(new_buffered_region, test_state.buffered_region.to_string());
        let new_focused_sequence = payload.get("focusedSequence").unwrap().as_str().unwrap();
        assert_ne!(test_state.focused_sequence, new_focused_sequence);
        assert_eq!(new_focused_region.len(), new_focused_sequence.len() as u64);
        assert_eq!(
            payload.get("focusedRegion").unwrap(),
            &serde_json::to_value(&new_focused_region).unwrap()
        );
        assert_eq!(
            payload.get("splitId").unwrap().as_str().unwrap(),
            test_state.split_id.to_string()
        );
    }

    #[test]
    fn test_update_focused_region_outside_of_buffered_region() {
        let test_state = init_basic_split_grid();
        test_state
            .grid
            .update_focused_region(
                &test_state.event_emitter,
                &test_state.split_id,
                GenomicRegion::new("euk_genes", 0, 100).unwrap(),
            )
            .unwrap();
        let new_focused_region = GenomicRegion::new("euk_genes", 500, 600).unwrap();
        test_state
            .grid
            .update_focused_region(
                &test_state.event_emitter,
                &test_state.split_id,
                new_focused_region.clone(),
            )
            .unwrap();

        test_state.event_emitter.pop_until(&Event::RegionBuffering);
        let payload = test_state.event_emitter.pop_until(&Event::AlignmentsUpdated);
        assert_eq!(
            payload.get("focusedRegion").unwrap(),
            &serde_json::to_value(&new_focused_region).unwrap()
        );
        assert_ne!(
            payload.get("alignments").unwrap().get("rows").unwrap().as_array().unwrap().len(),
            0
        );
        assert_eq!(
            payload.get("splitId").unwrap().as_str().unwrap(),
            test_state.split_id.to_string()
        );
        assert_eq!(
            payload.get("trackId").unwrap().as_str().unwrap(),
            test_state.track_id.to_string()
        );
    }

    #[test]
    fn test_update_focused_region_doesnt_affect_other_splits() {
        let test_state = init_basic_split_grid();
        let split_id = test_state.grid.add_split(&test_state.event_emitter, None).unwrap();
        let new_focused_region = GenomicRegion::new("euk_genes", 0, 1000).unwrap();
        test_state
            .grid
            .update_focused_region(&test_state.event_emitter, &split_id, new_focused_region.clone())
            .unwrap();
        let og_split = test_state.grid.get_split(&test_state.split_id).unwrap();
        assert_ne!(og_split.read().focused_region, new_focused_region);
    }

    #[test]
    fn test_zoom_focused_region() {
        let test_state = init_basic_split_grid();
        let new_focused_region = GenomicRegion::new("euk_genes", 800, 2200).unwrap();
        test_state
            .grid
            .update_focused_region(
                &test_state.event_emitter,
                &test_state.split_id,
                new_focused_region.clone(),
            )
            .unwrap();
        let payload = test_state.event_emitter.pop_until(&Event::RegionZoomed);
        assert_eq!(
            payload.get("genomicRegion").unwrap(),
            &serde_json::to_value(&new_focused_region).unwrap()
        );
    }
    #[test]
    fn test_pan_focused_region() {
        let test_state = init_basic_split_grid();
        let start_region = GenomicRegion::new("euk_genes", 0, 100).unwrap();
        test_state
            .grid
            .update_focused_region(&test_state.event_emitter, &test_state.split_id, start_region)
            .unwrap();
        let new_focused_region = GenomicRegion::new("euk_genes", 50, 150).unwrap();
        test_state
            .grid
            .update_focused_region(
                &test_state.event_emitter,
                &test_state.split_id,
                new_focused_region.clone(),
            )
            .unwrap();
        let payload = test_state.event_emitter.pop_until(&Event::RegionPanned);
        assert_eq!(
            payload.get("genomicRegion").unwrap(),
            &serde_json::to_value(&new_focused_region).unwrap()
        );
    }
}
