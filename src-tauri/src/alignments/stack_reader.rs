use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use parking_lot::RwLock;

use crate::alignments::alignment_reader::AlignmentReader;
use crate::alignments::stack::AlignmentStack;
use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;
use crate::file_formats::enums::{
    get_file_kind, AlignmentReaderKind, AlignmentStackKind, FileKind,
};
use crate::file_formats::sam_bam::aligned_read::pair_reads;
use crate::file_formats::sam_bam::reader::BamReader;

/// Reads alignments from a file and returns them stacked into rows for rendering.
#[derive(Debug)]
pub struct StackReader {
    /// Path of the file to be read.
    path: PathBuf,

    /// Stacked alignments from the last read operation.
    ///
    /// Mutated during each read operation.
    stack: Arc<RwLock<AlignmentStackKind>>,

    /// Inner struct which reads alignments from the file.
    reader: AlignmentReaderKind,
}

impl StackReader {
    pub fn new<P: Into<PathBuf>>(path: P, buffered_region: GenomicRegion) -> Result<Self> {
        let pathbuf = path.into();
        match get_file_kind(&pathbuf)? {
            FileKind::Bam | FileKind::Sam => {
                let stack =
                    AlignmentStackKind::AlignedPairKind(AlignmentStack::new(buffered_region));
                let reader = AlignmentReaderKind::BamKind(BamReader::new(&pathbuf)?);
                Ok(Self { path: pathbuf, stack: Arc::new(RwLock::new(stack)), reader })
            }
            _ => Err(anyhow!(
                "File extension is not a recognized alignment file format: {}",
                pathbuf.to_string_lossy().to_string()
            )),
        }
    }

    pub fn path(&self) -> &PathBuf {
        &self.path
    }

    pub fn stack(&self) -> Arc<RwLock<AlignmentStackKind>> {
        Arc::clone(&self.stack)
    }

    /// Remove all alignments from the stack.
    ///
    /// This is intended for cases where the user loads a region which is too large to render in the
    /// UI.
    pub fn clear_stack(&mut self, region: &GenomicRegion) -> Result<()> {
        match &mut *self.stack.write() {
            AlignmentStackKind::AlignedPairKind(stack) => stack.clear(region),
        };
        Ok(())
    }

    /// Read alignments from the file into the stack.
    pub fn read_stacked(&mut self, region: &GenomicRegion, seqview: &SequenceView) -> Result<()> {
        let alignments = match &mut self.reader {
            AlignmentReaderKind::BamKind(reader) => {
                let aligned_reads = reader.read(region, seqview)?;
                pair_reads(aligned_reads)?
            }
        };
        match &mut *self.stack.write() {
            AlignmentStackKind::AlignedPairKind(stack) => stack.update(alignments, region),
        }?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;
    use test_util_rs::data::get_test_data_path;

    use crate::file_formats::fasta::reader::FastaReader;

    use super::*;

    #[test]
    pub fn test_initialization_supports_filetypes() {
        let path = get_test_data_path("fake-genome.reads.bam");
        let region = GenomicRegion::new("X", 0, 1000).unwrap();
        let reader = StackReader::new(&path, region).unwrap();
        assert_eq!(reader.path(), &path);
    }

    fn read_example_stack() -> StackReader {
        let bam_path = get_test_data_path("fake-genome.reads.bam");
        let region = GenomicRegion::new("X", 0, 1000).unwrap();
        let mut reader = StackReader::new(&bam_path, region).unwrap();
        let fasta_path = get_test_data_path("fake-genome.fa");
        let mut fasta_reader = FastaReader::new(fasta_path).unwrap();
        let region = GenomicRegion::new("mt", 1000, 1500).unwrap();
        let sequence_view = fasta_reader.read(&region).unwrap();
        reader.read_stacked(&region, &sequence_view).unwrap();
        reader
    }

    #[test]
    pub fn test_read_stacked() {
        let reader = read_example_stack();
        let stack = reader.stack();
        let stack_lock = stack.read();
        if let AlignmentStackKind::AlignedPairKind(stack) = &*stack_lock {
            assert!(stack.rows.len() > 0)
        } else {
            panic!("Unexpected alignment stack kind")
        }
    }

    #[test]
    pub fn test_clear_stack() {
        let mut reader = read_example_stack();
        let region = GenomicRegion::new("mt", 10000, 25000).unwrap();
        reader.clear_stack(&region).unwrap();
        let stack = reader.stack();
        let stack_lock = stack.read();
        if let AlignmentStackKind::AlignedPairKind(stack) = &*stack_lock {
            assert_eq!(stack.rows.len(), 0)
        } else {
            panic!("Unexpected alignment stack kind")
        }
    }
}
