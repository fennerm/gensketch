use std::ffi::OsStr;
use std::path::PathBuf;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::impl_wrapped_uuid;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct TrackId(Uuid);
impl_wrapped_uuid!(TrackId);

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum Track {
    Alignment(AlignmentTrack),
}

impl Track {
    pub fn id(&self) -> TrackId {
        match *self {
            Self::Alignment(AlignmentTrack { id, .. }) => id,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            Self::Alignment(AlignmentTrack { name, .. }) => name,
        }
    }

    pub fn file_path(&self) -> &PathBuf {
        match self {
            Self::Alignment(AlignmentTrack { file_path, .. }) => file_path,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignmentTrack {
    pub id: TrackId,
    pub file_path: PathBuf,
    pub name: String,
}

impl AlignmentTrack {
    pub fn new<P: Into<PathBuf>>(file_path: P) -> Result<Self> {
        let file_path: PathBuf = file_path.into();
        let name =
            file_path.file_name().unwrap_or(OsStr::new("unknown")).to_string_lossy().to_string();
        Ok(Self { id: TrackId::new(), file_path, name })
    }
}
