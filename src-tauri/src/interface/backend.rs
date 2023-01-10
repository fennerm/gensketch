use anyhow::Result;
use parking_lot::Mutex;

use crate::bio_util::refseq::{get_default_reference, ReferenceSequence};
use crate::file_formats::fasta::reader::FastaReader;
use crate::interface::split::SplitList;
use crate::interface::track::TrackList;

#[derive(Debug)]
pub struct Backend {
    pub splits: Mutex<SplitList>,
    pub tracks: Mutex<TrackList>,
    pub ref_seq_reader: Mutex<Option<FastaReader>>,
    pub reference_sequence: Mutex<Option<ReferenceSequence>>,
}

impl Backend {
    pub fn new() -> Result<Self> {
        let reference_sequence = get_default_reference()?;
        let ref_seq_reader = match &reference_sequence {
            Some(refseq) => Some(FastaReader::new(&refseq.path)?),
            None => None,
        };
        Ok(Self {
            splits: Mutex::new(SplitList::new()),
            tracks: Mutex::new(TrackList::new()),
            ref_seq_reader: Mutex::new(ref_seq_reader),
            reference_sequence: Mutex::new(reference_sequence),
        })
    }
}
