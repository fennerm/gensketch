use std::path::PathBuf;

use anyhow::Result;
use serde::Serialize;
use tauri::api::path::local_data_dir;

use crate::file_formats::fasta::reader::FastaReader;

/// Metadata for the currently loaded genomic reference sequence.
#[derive(Debug, Serialize)]
pub struct ReferenceSequence {
    pub name: String,
    pub path: PathBuf,
}

impl ReferenceSequence {
    pub fn new<P: Into<PathBuf>>(name: String, path: P) -> Self {
        Self { name, path: path.into() }
    }

    pub fn get_reader(&self) -> Result<FastaReader> {
        FastaReader::new(&self.path)
    }
}

/// Get the reference sequence which is loaded automatically on startup
pub fn get_default_reference() -> Result<Option<ReferenceSequence>> {
    // TODO cache path from previous session
    // TODO Try redownload if missing?

    // let refseq = local_data_dir().as_mut().map(|path| {
    //     path.push("gensketch");
    //     path.push("human_mtdna.fasta");
    //     ReferenceSequence::new("HG19".to_owned(), path.to_owned())
    // });
    let mut path = std::env::current_exe()?;
    for _ in 0..3 {
        path.pop();
    }
    path.push("test_data");
    path.push("fake-genome.fa");
    let refseq = ReferenceSequence::new("HG19".to_owned(), path.to_owned());
    Ok(Some(refseq))
}

#[cfg(test)]
mod tests {
    use super::get_default_reference;

    #[test]
    pub fn test_get_default_reference_sequence() {
        let result = get_default_reference().unwrap().unwrap();
        assert_eq!(result.name, "HG19");
        let path_end: Vec<_> = result.path.into_iter().rev().take(2).collect();
        assert_eq!(path_end, vec!("fake-genome.fa", "test_data"));
    }
}
