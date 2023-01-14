use typescript_definitions::TypeScriptify;

use crate::bio_util::genomic_coordinates::{GenomicInterval, GenomicRegion};
use crate::file_formats::sam_bam::aligned_read::{AlignedPair, AlignedRead};
use crate::file_formats::sam_bam::diff::SequenceDiff;
use crate::interface::split::{Split, SplitList};
use crate::interface::track::{Track, TrackList};

pub fn export_typescript_definitions() {}
