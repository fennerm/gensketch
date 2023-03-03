use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use dashmap::DashMap;
use parking_lot::RwLock;
use rayon::prelude::*;

use crate::alignments::stack_reader::StackReader;
use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;
use crate::errors::InternalError;
use crate::file_formats::enums::AlignmentStackKind;
use crate::interface::split::SplitId;
use crate::interface::track::TrackId;

type AlignmentsByView = DashMap<(TrackId, SplitId), StackReader>;

/// Stores a StackReader object for each Track/Split pair in the split grid.
#[derive(Debug)]
pub struct AlignmentsManager {
    stack_readers: AlignmentsByView,
}

impl AlignmentsManager {
    pub fn new() -> Self {
        Self { stack_readers: DashMap::new() }
    }

    fn tracks(&self) -> impl Iterator<Item = (TrackId, PathBuf)> + '_ {
        self.stack_readers.iter().map(|item| (item.key().0, item.value().path().clone()))
    }

    fn splits(&self) -> impl Iterator<Item = (SplitId, GenomicRegion)> + '_ {
        self.stack_readers
            .iter()
            .map(|item| (item.key().1, item.value().stack().read().buffered_region().clone()))
    }

    pub fn add_first_track<P: Into<PathBuf>>(
        &mut self,
        track_id: &TrackId,
        path: P,
        split_id: &SplitId,
        buffered_region: GenomicRegion,
    ) -> Result<()> {
        let stack_reader = StackReader::new(path, buffered_region.clone())?;
        self.stack_readers.insert((*track_id, *split_id), stack_reader);
        Ok(())
    }

    pub fn add_track<P: Into<PathBuf>>(&mut self, track_id: &TrackId, path: P) -> Result<()> {
        let pathbuf: PathBuf = path.into();
        for (split_id, buffered_region) in self.splits() {
            let stack_reader = StackReader::new(pathbuf.clone(), buffered_region.clone())?;
            let stack_id = stack_reader.stack().read().id();
            self.stack_readers.insert((*track_id, split_id), stack_reader);
            log::debug!(
                "Initialized alignment stack {} for track={}, split={}",
                stack_id,
                track_id,
                split_id
            );
        }
        Ok(())
    }

    pub fn add_split(&mut self, split_id: &SplitId, buffered_region: GenomicRegion) -> Result<()> {
        if self.stack_readers.len() == 0 {
            return Err(InternalError::NoTracksInitialized {})?;
        }
        for (track_id, path) in self.tracks() {
            let stack_reader = StackReader::new(path, buffered_region.clone())?;
            let stack_id = stack_reader.stack().read().id();
            self.stack_readers.insert((track_id, *split_id), stack_reader);
            log::debug!(
                "Initialized alignment stack {} for track={}, split={}",
                stack_id,
                track_id,
                split_id
            );
        }

        Ok(())
    }

    pub fn clear_alignments(
        &mut self,
        split_id: &SplitId,
        focused_region: &GenomicRegion,
    ) -> Result<Vec<(TrackId, Arc<RwLock<AlignmentStackKind>>)>> {
        self.stack_readers
            .par_iter_mut()
            .filter(|x| x.key().1 == *split_id)
            .map(|mut item| {
                let track_id = item.key().0;
                let stack_reader = item.value_mut();
                stack_reader.clear_stack(focused_region)?;
                Ok((track_id.clone(), stack_reader.stack()))
            })
            .collect()
    }

    pub fn update_alignments(
        &mut self,
        split_id: &SplitId,
        focused_region: &GenomicRegion,
        refseq: &SequenceView,
    ) -> Result<Vec<(TrackId, Arc<RwLock<AlignmentStackKind>>)>> {
        self.stack_readers
            .par_iter_mut()
            .filter(|x| x.key().1 == *split_id)
            .map(|mut item| {
                let track_id = item.key().0;
                let stack_reader = item.value_mut();
                stack_reader.read_stacked(focused_region, refseq)?;
                Ok((track_id.clone(), stack_reader.stack()))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;

    #[test]
    pub fn test_add_split() {
        assert!(false);
    }
}
