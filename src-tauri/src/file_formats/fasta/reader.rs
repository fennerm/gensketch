use std::fs::File;
use std::path::PathBuf;

use anyhow::{Context, Result};
use bio::io::fasta::{self, Sequence};

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;

/// A reader for indexed .fasta files.
#[derive(Debug)]
pub struct FastaReader {
    pub reference_path: PathBuf,
    reader: fasta::IndexedReader<File>,
}

impl FastaReader {
    pub fn new<P: Into<PathBuf>>(reference_path: P) -> Result<FastaReader> {
        let pathbuf: PathBuf = reference_path.into();
        let reader = fasta::IndexedReader::from_file(&pathbuf)
            .with_context(|| format!("Failed to read reference file: {}", pathbuf.display()))?;
        Ok(FastaReader { reference_path: pathbuf, reader })
    }

    pub fn sequences(&self) -> Vec<Sequence> {
        self.reader.index.sequences()
    }

    /// Get sequence in fasta file for a given genomic region
    pub fn read(&mut self, region: &GenomicRegion) -> Result<SequenceView> {
        self.reader.fetch(&region.seq_name, region.start(), region.end()).with_context(|| {
            format!("Failed to fetch {} from {}", region, self.reference_path.display())
        })?;
        let mut sequence: Vec<u8> = vec![0; region.len() as usize];
        self.reader.read(&mut sequence)?;
        sequence.retain(|c| *c != b'\n');
        let view = SequenceView::new(sequence, region.start());
        Ok(view)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bio_util::genomic_coordinates::GenomicRegion;
    use crate::paths::get_test_data_path;

    #[test]
    fn test_reading() {
        let fasta_file = get_test_data_path("fake-genome.fa");
        let mut reader = FastaReader::new(fasta_file).unwrap();
        let region = GenomicRegion::new("mt", 0, 20).unwrap();
        let sequence_view = reader.read(&region).unwrap();
        assert_eq!(sequence_view.to_string().unwrap(), "GATCACAGGTCTATCACCCT".to_owned());
    }
}
