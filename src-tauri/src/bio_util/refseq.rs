use std::path::PathBuf;

use anyhow::Result;
use serde::Serialize;
use tauri::api::path::local_data_dir;

#[derive(Debug, Serialize)]
pub struct ReferenceSequence {
    pub name: String,
    pub path: PathBuf,
}

pub fn get_default_reference() -> Result<Option<ReferenceSequence>> {
    // TODO cache path from previous session
    // TODO Try redownload if missing?

    let refseq = match local_data_dir() {
        Some(mut path) => {
            path.push("gensketch");
            path.push("human_g1k_v37.fasta");
            Ok(Some(ReferenceSequence { name: "HG19".to_owned(), path }))
        }
        None => Ok(None),
    };
    refseq
}
