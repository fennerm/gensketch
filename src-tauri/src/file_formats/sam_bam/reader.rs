use std::path::PathBuf;

use anyhow::Result;
use rust_htslib::bam;
use rust_htslib::bam::record::Record;
use rust_htslib::bam::Read;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;
use crate::errors::InternalError;
use crate::file_formats::sam_bam::aligned_read::AlignedRead;
use crate::file_formats::sam_bam::tid::TidMap;

#[derive(Debug)]
pub struct BamReader {
    pub bam_path: PathBuf,
    reader: bam::IndexedReader,
}

impl BamReader {
    pub fn new<P: Into<PathBuf>>(bam_path: P) -> Result<BamReader> {
        let pathbuf: PathBuf = bam_path.into();
        let reader = bam::IndexedReader::from_path(&pathbuf)?;
        Ok(BamReader { bam_path: pathbuf, reader })
    }

    pub fn read(
        &mut self,
        region: &GenomicRegion,
        refseq: &SequenceView,
        tid_map: &TidMap,
    ) -> Result<Vec<AlignedRead>> {
        if tid_map.get_tid(&region.seq_name).is_none() {
            return Err(InternalError::InvalidSeqName { seq_name: region.seq_name.clone() })
                .map_err(anyhow::Error::msg);
        }
        self.reader.fetch((region.seq_name.as_str(), region.start, region.end))?;
        let mut record = Record::new();
        let mut alignments = Vec::new();
        loop {
            if let None = self.reader.read(&mut record) {
                break;
            }
            // TODO Error in single read shouldn't halt entire operation
            let alignment = AlignedRead::from_record(&record, refseq, tid_map)?;
            alignments.push(alignment);
        }
        Ok(alignments)
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use crate::bio_util::genomic_coordinates::GenomicRegion;
    use crate::file_formats::fasta::reader::FastaReader;
    use crate::file_formats::sam_bam::tid::TidMap;
    use test_util_rs::data::get_test_data_path;

    use super::BamReader;

    pub fn check_read_bam(
        bam_filename: &str,
        fasta_filename: &str,
        region: &GenomicRegion,
        expected_num_reads: usize,
    ) {
        let bam_path = get_test_data_path(bam_filename);
        let fasta_path = get_test_data_path(fasta_filename);
        let tid_map = TidMap::new(&bam_path).unwrap();
        let mut fasta_reader = FastaReader::new(fasta_path).unwrap();
        let sequence_view = fasta_reader.read(&region).unwrap();
        let mut bam_reader = BamReader::new(&bam_path).unwrap();
        let alignments = bam_reader.read(&region, &sequence_view, &tid_map).unwrap();
        assert_eq!(alignments.len(), expected_num_reads);
    }

    #[test]
    pub fn test_read_simple_bam() {
        let region = GenomicRegion::new("mt", 1000, 1500);
        check_read_bam("fake-genome.reads.bam", "fake-genome.fa", &region, 265)
    }

    #[test]
    pub fn test_read_empty_bam() {
        let region = GenomicRegion::new("mt", 1000, 1500);
        check_read_bam("fake-genome.empty.bam", "fake-genome.fa", &region, 0)
    }

    #[test]
    pub fn test_read_unmapped_bam() {
        let region = GenomicRegion::new("mt", 1000, 1500);
        check_read_bam("fake-genome.unmapped.bam", "fake-genome.fa", &region, 0)
    }
}
