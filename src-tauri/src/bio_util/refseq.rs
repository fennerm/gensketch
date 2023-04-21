use std::collections::BTreeMap;
use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::Serialize;
use serde_with::{serde_as, DisplayFromStr};
// use tauri::api::path::local_data_dir;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;
use crate::file_formats::fasta::reader::FastaReader;

/// Generate a map from sequence name to sequence length from an indexed fasta file.
fn map_sequence_lengths<P: Into<PathBuf>>(path: P) -> Result<BTreeMap<String, u64>> {
    let reader = FastaReader::new(path)?;
    let sizes = reader.sequences().iter().map(|seq| (seq.name.clone(), seq.len)).collect();
    Ok(sizes)
}

/// Metadata for the currently loaded genomic reference sequence.
#[serde_as]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceSequence {
    pub name: String,
    pub path: PathBuf,
    #[serde_as(as = "BTreeMap<_, DisplayFromStr>")]
    pub seq_lengths: BTreeMap<String, u64>,
    pub default_focused_region: GenomicRegion,
}

impl ReferenceSequence {
    pub fn new<P: Into<PathBuf>>(name: String, path: P) -> Result<Self> {
        let pathbuf = path.into();
        let seq_lengths = map_sequence_lengths(&pathbuf)?;
        let (default_seq_name, default_seq_len) =
            seq_lengths.first_key_value().context("Reference sequence file is empty")?;
        let default_focused_region = GenomicRegion::new(default_seq_name, 0, *default_seq_len)?;
        Ok(Self { name, path: pathbuf, seq_lengths, default_focused_region })
    }

    pub fn get_reader(&self) -> Result<FastaReader> {
        FastaReader::new(&self.path)
    }

    pub fn get_seq_length(&self, seq_name: &str) -> Result<u64> {
        self.seq_lengths.get(seq_name).map(|len| *len).with_context(|| {
            format!(
                "Sequence named {} is not present on reference sequence {}",
                seq_name, self.name
            )
        })
    }

    pub fn read_sequence(&self, region: &GenomicRegion) -> Result<SequenceView> {
        let sequence = self.get_reader()?.read(region)?;
        Ok(sequence)
    }
}

fn dir_contains(dir: &PathBuf, filename: &str) -> bool {
    let mut path = dir.clone();
    path.push(filename);
    path.exists()
}

/// Get the reference sequence which is loaded automatically on startup
pub fn get_default_reference() -> Result<ReferenceSequence> {
    // TODO cache path from previous session
    // TODO Try redownload if missing?
    // TODO Need to make 100 % sure we can load a reference here. May need multiple fallbacks.

    // let refseq = local_data_dir().as_mut().map(|path| {
    //     path.push("gensketch");
    //     path.push("human_mtdna.fasta");
    //     ReferenceSequence::new("HG19".to_owned(), path.to_owned())
    // });
    let mut path = std::env::current_exe()?;
    while !dir_contains(&path, "test_data") {
        path.pop();
    }
    path.push("test_data");
    path.push("fake-genome.fa");
    let refseq = ReferenceSequence::new("HG19".to_owned(), path.to_owned())?;
    Ok(refseq)
}

#[cfg(test)]
mod tests {
    use crate::paths::get_test_data_path;

    use super::*;

    #[test]
    pub fn test_get_default_reference_sequence() {
        let result = get_default_reference().unwrap();
        assert_eq!(result.name, "HG19");
        let path_end: Vec<_> = result.path.into_iter().rev().take(2).collect();
        assert_eq!(path_end, vec!("fake-genome.fa", "test_data"));
    }

    #[test]
    pub fn test_map_sequence_lengths() {
        let path = get_test_data_path("fake-genome.fa");
        let expected =
            [("euk_genes".to_owned(), 7185), ("mt".to_owned(), 16569)].into_iter().collect();
        let result = map_sequence_lengths(path).unwrap();
        assert_eq!(result, expected);
    }
}
