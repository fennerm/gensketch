use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::path::PathBuf;

use crate::alignments::stack::{AlignmentStack, StackId};
use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::file_formats::sam_bam::aligned_read::AlignedPair;
use crate::file_formats::sam_bam::reader::BamReader;

pub enum FileKind {
    Bam,
    Fasta,
    Sam,
}

/// Parse the filetype from the file extension
pub fn get_file_kind<P: Into<PathBuf>>(path: P) -> Result<FileKind> {
    let pathbuf: PathBuf = path.into();
    let extension = pathbuf
        .extension()
        .with_context(|| format!("Unable to parse filename: {:?}", pathbuf.as_os_str()))?;
    match extension.to_str() {
        Some("bam") => Ok(FileKind::Bam),
        Some("sam") => Ok(FileKind::Bam),
        Some("fasta") | Some("fa") | Some("ffn") | Some("faa") | Some("frn") | Some("fna") => {
            Ok(FileKind::Fasta)
        }
        Some(_) | None => {
            Err(anyhow!("Unrecognized file type: {}", pathbuf.to_string_lossy().to_string()))
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum AlignmentStackKind {
    AlignedPairKind(AlignmentStack<AlignedPair>),
}
impl AlignmentStackKind {
    pub fn id(&self) -> StackId {
        match *self {
            Self::AlignedPairKind(AlignmentStack { id, .. }) => id,
        }
    }
    pub fn buffered_region(&self) -> &GenomicRegion {
        match &*self {
            Self::AlignedPairKind(AlignmentStack { buffered_region, .. }) => buffered_region,
        }
    }
}

#[derive(Debug)]
pub enum AlignmentReaderKind {
    BamKind(BamReader),
}

#[cfg(test)]
mod tests {
    use crate::util::same_enum_variant;

    use super::*;

    fn check_get_file_kind(path: &PathBuf, expected: FileKind) {
        let result = get_file_kind(path).unwrap();
        assert!(same_enum_variant(&result, &expected))
    }

    #[test]
    pub fn test_get_file_kind_with_supported_filetype() {
        let mut pathbuf = PathBuf::new();
        pathbuf.set_file_name("test.bam");
        check_get_file_kind(&pathbuf, FileKind::Bam);
        pathbuf.set_file_name("test.fa");
        check_get_file_kind(&pathbuf, FileKind::Fasta);
        pathbuf.set_file_name("test.fasta");
        check_get_file_kind(&pathbuf, FileKind::Fasta);
        pathbuf.set_file_name("test.sam");
        check_get_file_kind(&pathbuf, FileKind::Sam);
    }

    #[test]
    pub fn test_get_file_kind_with_unsupported_filetype() {
        let mut pathbuf = PathBuf::new();
        pathbuf.set_file_name("test.bam");
        let result = get_file_kind(pathbuf);
        assert!(result.is_err());
    }
}
