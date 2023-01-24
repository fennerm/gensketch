use std::cmp;
use std::collections::{HashMap, VecDeque};

use anyhow::{Context, Result};
use rust_htslib::bam::record::Record;
use serde::Serialize;

use crate::alignment::Alignment;
use crate::bio_util::genomic_coordinates::{GenomicInterval, GenomicRegion};
use crate::bio_util::sequence::SequenceView;
use crate::file_formats::sam_bam::diff::{iter_sequence_diffs, SequenceDiff};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignedRead {
    pub read_name: String,
    pub region: GenomicRegion,
    pub mate_pos: Option<GenomicRegion>,
    pub diffs: Vec<SequenceDiff>,
    pub is_reverse: bool,
}

impl AlignedRead {
    pub fn from_record(
        record: &Record,
        seq_name: &str,
        refseq: &SequenceView,
        mate_pos: Option<GenomicRegion>,
    ) -> Result<Self> {
        let read_name: String = String::from_utf8_lossy(record.qname()).into();
        let cigar = record.cigar();
        let start = u64::try_from(record.pos()).with_context(|| {
            format!("Read {} has invalid position ({})", read_name, record.pos())
        })?;
        let end = u64::try_from(cigar.end_pos()).with_context(|| {
            format!("Read {} has invalid end position ({})", read_name, cigar.end_pos())
        })?;
        let genomic_region = GenomicRegion { seq_name: seq_name.to_owned(), start, end };
        let diffs = iter_sequence_diffs(record, refseq).collect();
        let is_reverse = record.is_reverse();
        Ok(AlignedRead { read_name, region: genomic_region, diffs, is_reverse, mate_pos })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedReads {
    read1: AlignedRead,
    // read2 is None when the other read in the pair is outside of the current window
    read2: Option<AlignedRead>,
    interval: GenomicInterval,
}

impl PairedReads {
    pub fn new(read1: AlignedRead, read2: Option<AlignedRead>) -> Self {
        match read2 {
            Some(inner_read2) => {
                let start = cmp::min(read1.region.start, inner_read2.region.start);
                let end = cmp::max(read1.region.end, inner_read2.region.end);
                Self { read1, read2: Some(inner_read2), interval: (start, end).into() }
            }
            None => {
                let interval = (read1.region.start, read1.region.end).into();
                Self { read1, read2, interval }
            }
        }
    }
}

impl Alignment for PairedReads {
    fn interval(&self) -> &GenomicInterval {
        &self.interval
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnpairedRead {
    read: AlignedRead,
    interval: GenomicInterval,
}

impl UnpairedRead {
    pub fn new(read: AlignedRead) -> Self {
        let interval = read.region.clone().into();
        Self { read, interval }
    }
}

impl Alignment for UnpairedRead {
    fn interval(&self) -> &GenomicInterval {
        &self.interval
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordantRead {
    read: AlignedRead,
    interval: GenomicInterval,
}

impl DiscordantRead {
    pub fn new(read: AlignedRead) -> Self {
        let interval = read.region.clone().into();
        Self { read, interval }
    }
}

impl Alignment for DiscordantRead {
    fn interval(&self) -> &GenomicInterval {
        &self.interval
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum AlignedPair {
    PairedReadsKind(PairedReads),
    UnpairedReadKind(UnpairedRead),
    DiscordantReadKind(DiscordantRead),
}

impl Alignment for AlignedPair {
    fn interval(&self) -> &GenomicInterval {
        use AlignedPair::*;
        match self {
            PairedReadsKind(PairedReads { interval, .. })
            | UnpairedReadKind(UnpairedRead { interval, .. })
            | DiscordantReadKind(DiscordantRead { interval, .. }) => interval,
        }
    }
}

pub fn pair_reads(reads: Vec<AlignedRead>) -> Vec<AlignedPair> {
    let mut reads_by_name: HashMap<String, VecDeque<AlignedRead>> = HashMap::new();
    let mut existing_reads;
    for read in reads.into_iter() {
        existing_reads =
            reads_by_name.entry(read.read_name.clone()).or_insert(VecDeque::with_capacity(2));
        existing_reads.push_front(read);
    }
    let mut pairs = Vec::new();
    let mut i = 0;
    let mut num_reads = reads_by_name.len();
    for (_, reads) in reads_by_name.iter_mut() {
        let read1 = reads.pop_front().unwrap();
        match &read1.mate_pos {
            Some(mate_pos) => {
                if read1.region.seq_name == mate_pos.seq_name {
                    let read2 = reads.pop_front();
                    let pair = PairedReads::new(read1, read2);
                    pairs.push(AlignedPair::PairedReadsKind(pair));
                } else {
                    let pair = DiscordantRead::new(read1);
                    pairs.push(AlignedPair::DiscordantReadKind(pair));
                }
            }
            None => {
                let pair = UnpairedRead::new(read1);
                pairs.push(AlignedPair::UnpairedReadKind(pair));
            }
        }
        i += 1;
    }
    pairs
}
