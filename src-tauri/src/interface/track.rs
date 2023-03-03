use std::ffi::OsStr;
use std::path::PathBuf;

use anyhow::{Context, Result};
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

    pub fn name(&self) -> String {
        match self {
            Self::Alignment(AlignmentTrack { name, .. }) => name.clone(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignmentTrack {
    pub id: TrackId,
    pub bam_path: PathBuf,
    pub name: String,
}

impl AlignmentTrack {
    pub fn new<P: Into<PathBuf>>(bam_path: P, name: &str) -> Result<Self> {
        let pathbuf: PathBuf = bam_path.into();
        Ok(Self { id: TrackId::new(), name: name.to_owned(), bam_path: pathbuf })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackList {
    pub inner: Vec<Track>,
}

impl TrackList {
    pub fn new() -> Self {
        Self { inner: Vec::new() }
    }

    pub fn add_alignment_track<P: Into<PathBuf>>(&mut self, path: P) -> Result<&Track> {
        let pathbuf: PathBuf = path.into();
        let name = &pathbuf.file_name().unwrap_or(OsStr::new("unknown")).to_string_lossy();
        let track = AlignmentTrack::new(&pathbuf, name.as_ref())?;
        self.inner.push(Track::Alignment(track));
        Ok(self.inner.last().unwrap())
    }

    pub fn get_track(&self, track_id: TrackId) -> Result<&Track> {
        Ok(self
            .inner
            .iter()
            .find(|track| *track.id() == *track_id)
            .context(format!("Track {} doesn't exist", track_id.to_string()))?)
    }

    pub fn track_ids(&self) -> Vec<TrackId> {
        self.inner.iter().map(|track| track.id()).collect()
    }
}
