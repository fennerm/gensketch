use anyhow::Result;
use parking_lot::RwLock;

use crate::bio_util::refseq::{get_default_reference, ReferenceSequence};
use crate::interface::split::SplitList;
use crate::interface::track::TrackList;

#[derive(Debug)]
pub struct Backend {
    pub splits: RwLock<SplitList>,
    pub tracks: RwLock<TrackList>,
    pub reference_sequence: RwLock<Option<ReferenceSequence>>,
}

impl Backend {
    pub fn new() -> Result<Self> {
        let reference_sequence = get_default_reference()?;
        Ok(Self {
            splits: RwLock::new(SplitList::new()),
            tracks: RwLock::new(TrackList::new()),
            reference_sequence: RwLock::new(reference_sequence),
        })
    }
}
