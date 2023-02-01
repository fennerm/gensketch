use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::Serialize;
use uuid::Uuid;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;
use crate::file_formats::sam_bam::aligned_read::{pair_reads, AlignedPair};
use crate::file_formats::sam_bam::reader::BamReader;
use crate::file_formats::sam_bam::stack::AlignmentStack;
use crate::file_formats::sam_bam::tid::TidMap;

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum Track {
    Alignment(AlignmentTrack),
}

impl Track {
    pub fn id(&self) -> Uuid {
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
    pub id: Uuid,
    pub bam_path: PathBuf,
    pub name: String,
    #[serde(skip_serializing)]
    pub tid_map: TidMap,
}

impl AlignmentTrack {
    pub fn new<P: Into<PathBuf>>(bam_path: P, name: &str) -> Result<Self> {
        let pathbuf: PathBuf = bam_path.into();
        let tid_map = TidMap::new(&pathbuf)?;
        Ok(Self { id: Uuid::new_v4(), name: name.to_owned(), bam_path: pathbuf, tid_map })
    }

    pub fn get_bam_reader(&self) -> Result<BamReader> {
        BamReader::new(&self.bam_path)
    }

    pub fn read_alignments(
        &self,
        genomic_region: &GenomicRegion,
        refseq: &SequenceView,
    ) -> Result<AlignmentStack<AlignedPair>> {
        // For now just initialize a fresh reader on each command. In future we might want to
        // optimize this to use a pool of pre-initialized readers instead.
        let reads = self.get_bam_reader()?.read(genomic_region, refseq, &self.tid_map)?;
        let paired_reads = pair_reads(reads);
        let mut stack = AlignmentStack::new(paired_reads);
        stack.stack_by_start_pos()?;
        Ok(stack)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackList {
    pub tracks: Vec<Track>,
}

impl TrackList {
    pub fn new() -> Self {
        Self { tracks: Vec::new() }
    }

    pub fn add_alignment_track<P: Into<PathBuf>>(&mut self, path: P) -> Result<&Track> {
        // TODO: Properly define track name
        let track = AlignmentTrack::new(path, "track")?;
        self.tracks.push(Track::Alignment(track));
        Ok(self.tracks.last().unwrap())
    }

    pub fn get_track(&self, track_id: Uuid) -> Result<&Track> {
        Ok(self
            .tracks
            .iter()
            .find(|track| track.id() == track_id)
            .context(format!("Track {} doesn't exist", track_id.to_string()))?)
    }
}
