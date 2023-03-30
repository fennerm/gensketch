use std::path::PathBuf;

use anyhow::{bail, Result};
use parking_lot::Mutex;
use rust_htslib::bam;
use rust_htslib::bam::record::Record;
use rust_htslib::bam::Read;

use crate::alignments::alignment_reader::AlignmentReader;
use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;
use crate::file_formats::sam_bam::aligned_read::AlignedRead;
use crate::file_formats::sam_bam::tid::TidMap;

#[derive(Debug)]
pub struct BamReader {
    pub bam_path: PathBuf,
    tid_map: TidMap,
    reader: Mutex<bam::IndexedReader>,
}

impl BamReader {
    pub fn new<P: Into<PathBuf>>(bam_path: P) -> Result<BamReader> {
        let pathbuf: PathBuf = bam_path.into();
        let reader = Mutex::new(bam::IndexedReader::from_path(&pathbuf)?);
        let tid_map = TidMap::new(&pathbuf)?;
        Ok(BamReader { bam_path: pathbuf, reader, tid_map })
    }
}

impl AlignmentReader for BamReader {
    type Item = AlignedRead;

    fn read(&mut self, region: &GenomicRegion, refseq: &SequenceView) -> Result<Vec<Self::Item>> {
        if self.tid_map.get_tid(&region.seq_name).is_none() {
            bail!("Invalid contig/chromosome name: {}", region.seq_name);
        }
        let mut reader = self.reader.lock();
        reader.fetch((region.seq_name.as_str(), region.start(), region.end()))?;
        let mut record = Record::new();
        let mut alignments = Vec::new();
        loop {
            if let None = reader.read(&mut record) {
                break;
            }
            // TODO Error in single read shouldn't halt entire operation
            let alignment = AlignedRead::from_record(&record, refseq, &self.tid_map)?;
            alignments.push(alignment);
        }
        Ok(alignments)
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use crate::alignments::alignment_reader::AlignmentReader;
    use crate::bio_util::genomic_coordinates::GenomicRegion;
    use crate::file_formats::fasta::reader::FastaReader;
    use test_util_rs::data::get_test_data_path;

    use super::*;

    pub fn check_read_bam(
        bam_filename: &str,
        fasta_filename: &str,
        region: &GenomicRegion,
        expected_num_reads: usize,
    ) {
        let bam_path = get_test_data_path(bam_filename);
        let fasta_path = get_test_data_path(fasta_filename);
        let mut fasta_reader = FastaReader::new(fasta_path).unwrap();
        let sequence_view = fasta_reader.read(&region).unwrap();
        let mut bam_reader = BamReader::new(&bam_path).unwrap();
        let alignments = bam_reader.read(&region, &sequence_view).unwrap();
        assert_eq!(alignments.len(), expected_num_reads);
    }

    #[test]
    pub fn test_read_simple_bam() {
        let region = GenomicRegion::new("mt", 1000, 1500).unwrap();
        check_read_bam("fake-genome.reads.bam", "fake-genome.fa", &region, 575)
    }

    #[test]
    pub fn test_read_empty_bam() {
        let region = GenomicRegion::new("mt", 1000, 1500).unwrap();
        check_read_bam("fake-genome.empty.bam", "fake-genome.fa", &region, 0)
    }

    #[test]
    pub fn test_read_unmapped_bam() {
        let region = GenomicRegion::new("mt", 1000, 1500).unwrap();
        check_read_bam("fake-genome.unmapped.bam", "fake-genome.fa", &region, 0)
    }
}
