use std::fs::File;
use std::path::PathBuf;

use anyhow::{Context, Result};
use bio::io::fasta;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;

// TODO Pool of readers for multithreaded access
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

    pub fn read(&mut self, region: &GenomicRegion) -> Result<SequenceView> {
        self.reader.fetch(&region.seq_name, region.start, region.end).with_context(|| {
            format!("Failed to fetch {} from {}", region, self.reference_path.display())
        })?;
        let mut sequence: Vec<u8> = Vec::new();
        self.reader.read(&mut sequence)?;
        let view = SequenceView::new(sequence, region.start);
        Ok(view)
    }
}
