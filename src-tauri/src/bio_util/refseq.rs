use std::path::PathBuf;

use anyhow::Result;
use serde::Serialize;
use tauri::api::path::local_data_dir;

/// Metadata for the currently loaded genomic reference sequence.
#[derive(Debug, Serialize)]
pub struct ReferenceSequence {
    pub name: String,
    pub path: PathBuf,
}

/// Get the reference sequence which is loaded automatically on startup
pub fn get_default_reference() -> Result<Option<ReferenceSequence>> {
    // TODO cache path from previous session
    // TODO Try redownload if missing?

    let refseq = match local_data_dir() {
        Some(mut path) => {
            path.push("gensketch");
            path.push("human_mtdna.fasta");
            Ok(Some(ReferenceSequence { name: "HG19".to_owned(), path }))
        }
        None => Ok(None),
    };
    refseq
}

#[cfg(test)]
mod tests {
    use super::get_default_reference;

    #[test]
    pub fn test_get_default_reference_sequence() {
        let result = get_default_reference().unwrap().unwrap();
        assert_eq!(result.name, "HG19");
        assert_eq!((result.path.pop(), result.path.pop()), ("human_mtdna.fasta", "gensketch"))
    }
}
