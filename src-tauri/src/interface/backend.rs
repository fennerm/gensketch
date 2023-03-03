use anyhow::Result;
use parking_lot::RwLock;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::refseq::{get_default_reference, ReferenceSequence};
use crate::interface::alignments_manager::AlignmentsManager;
use crate::interface::split::{SplitId, SplitList};
use crate::interface::track::TrackList;
use crate::interface::user_config::{read_user_config, UserConfig};

#[derive(Debug)]
pub struct Backend {
    pub splits: RwLock<SplitList>,
    pub tracks: RwLock<TrackList>,
    pub alignments: RwLock<AlignmentsManager>,
    pub reference_sequence: RwLock<ReferenceSequence>,
    pub user_config: RwLock<UserConfig>,
}

impl Backend {
    pub fn new() -> Result<Self> {
        let reference_sequence = get_default_reference()?;
        let user_config = read_user_config()?;
        Ok(Self {
            splits: RwLock::new(SplitList::new()),
            tracks: RwLock::new(TrackList::new()),
            alignments: RwLock::new(AlignmentsManager::new()),
            reference_sequence: RwLock::new(reference_sequence),
            user_config: RwLock::new(user_config),
        })
    }

    pub fn get_default_new_split_region(&self) -> Result<GenomicRegion> {
        let region = self
            .splits
            .read()
            .inner
            .last()
            .map(|split| split.focused_region().clone())
            .unwrap_or(self.reference_sequence.read().default_focused_region.clone());
        Ok(region)
    }

    pub fn update_split_region(
        &self,
        split_id: SplitId,
        focused_region: GenomicRegion,
    ) -> Result<()> {
        self.splits.write().get_split(split_id)?.set_focused_region(focused_region)?;
        Ok(())
    }
}
