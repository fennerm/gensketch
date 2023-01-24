use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::Serialize;
use uuid::Uuid;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;
use crate::file_formats::sam_bam::aligned_read::{pair_reads, AlignedPair};
use crate::file_formats::sam_bam::reader::BamReader;
use crate::file_formats::sam_bam::stack::AlignmentStack;

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
    #[serde(skip_serializing)]
    pub bam_reader: BamReader,
    pub bam_path: PathBuf,
    pub name: String,
}

impl AlignmentTrack {
    pub fn new<P: Into<PathBuf>>(bam_path: P, name: &str) -> Result<Self> {
        let pathbuf: PathBuf = bam_path.into();
        let bam_reader = BamReader::new(&pathbuf)?;
        Ok(Self { bam_reader, id: Uuid::new_v4(), name: name.to_owned(), bam_path: pathbuf })
    }

    pub fn read_alignments(
        &mut self,
        genomic_region: &GenomicRegion,
        refseq: &SequenceView,
    ) -> Result<AlignmentStack<AlignedPair>> {
        let reads = self.bam_reader.read(genomic_region, refseq)?;
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

    pub fn get_track(&mut self, track_id: Uuid) -> Result<&mut Track> {
        Ok(self
            .tracks
            .iter_mut()
            .find(|track| track.id() == track_id)
            .context(format!("Track {} doesn't exist", track_id.to_string()))?)
    }
}
