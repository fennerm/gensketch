use anyhow::Result;

use crate::alignments::alignment::Alignment;
use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;

/// Trait for a generic reader struct which reads alignments from a file.
pub trait AlignmentReader {
    type Item: Alignment;

    fn read(&mut self, region: &GenomicRegion, refseq: &SequenceView) -> Result<Vec<Self::Item>>;
}
