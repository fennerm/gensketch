use std::cmp;
use std::collections::{BTreeMap, VecDeque};

use anyhow::{Context, Result};
use rust_htslib::bam::record::Record;
use serde::Serialize;

use crate::bio_util::alignment::Alignment;
use crate::bio_util::genomic_coordinates::{GenomicInterval, GenomicRegion};
use crate::bio_util::sequence::SequenceView;
use crate::file_formats::sam_bam::diff::{iter_sequence_diffs, SequenceDiff};
use crate::file_formats::sam_bam::tid::TidMap;
use crate::impl_alignment;

fn get_mate_pos(record: &Record, tid_map: &TidMap) -> Option<GenomicRegion> {
    let raw_mate_pos = record.mpos();
    let raw_mate_tid = record.mtid();
    if raw_mate_pos < 0 || raw_mate_tid < 0 {
        // SAM spec suggests unmapped reads have 1-indexed pos=0, so I believe they should have
        // pos=-1 when converted to 0 indexed.
        return None;
    }

    let mate_start = record.mpos() as u64;
    let mate_tid = record.mtid();
    tid_map
        .get_seq_name(mate_tid)
        .map(|seq_name| GenomicRegion::new(seq_name, mate_start, mate_start + 1))
}

/// A single aligned read from a SAM/BAM file.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignedRead {
    pub read_name: String,
    pub region: GenomicRegion,

    /// Start position of paired read (None if read is unpaired)
    pub mate_pos: Option<GenomicRegion>,

    /// Differences in this read compared to the reference sequence (i.e SNVs/indels/clipping)
    pub diffs: Vec<SequenceDiff>,

    /// True if the alignment is in the reverse orientation
    pub is_reverse: bool,
}

impl AlignedRead {
    /// Initialize an AlignedRead from a rust-htslib Record object (+ extra required metadata)
    ///
    /// # Arguments
    ///
    /// * `refseq` - A reference sequence view which spans the entirety of the read.
    pub fn from_record(record: &Record, refseq: &SequenceView, tid_map: &TidMap) -> Result<Self> {
        let read_name: String = String::from_utf8_lossy(record.qname()).into();
        let seq_name = tid_map.get_seq_name(record.tid()).with_context(|| {
            format!("Attempted to construct AlignedRead from unmapped read (Read {})", read_name)
        })?;
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
        let mate_pos = get_mate_pos(record, tid_map);
        Ok(AlignedRead { read_name, region: genomic_region, diffs, is_reverse, mate_pos })
    }
}

/// A paired set of reads in which both reads align to the same chromosome/contig
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedReads {
    read1: AlignedRead,
    /// read2 is None when the other read in the pair is outside of the current window
    read2: Option<AlignedRead>,
    interval: GenomicInterval,
}

impl PairedReads {
    pub fn new(read1: AlignedRead, read2: Option<AlignedRead>) -> Self {
        let interval: GenomicInterval = match &read2 {
            Some(inner_read2) => {
                let start = cmp::min(read1.region.start, inner_read2.region.start);
                let end = cmp::max(read1.region.end, inner_read2.region.end);
                (start, end).into()
            }
            None => {
                // mate_pos should always be defined because otherwise we would have used
                // UnpairedRead instead
                let mate_pos = read1.mate_pos.as_ref().unwrap();
                let start = cmp::min(read1.region.start, mate_pos.start);
                let end = cmp::max(read1.region.end, mate_pos.end);
                (start, end).into()
            }
        };
        Self { read1, read2, interval }
    }
}

/// A read which has no aligned mate.
///
/// These occur when paired-end sequencing was not used or if the mate has been filtered or is
/// unmapped.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
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

/// A read which has an aligned mate but it is on a different chromosome/contig.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
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

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
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

impl_alignment![DiscordantRead, PairedReads, UnpairedRead];

/// Match aligned reads to their mate pairs
///
/// Output order is determined by the read name of the first read in the pair.
pub fn pair_reads(reads: Vec<AlignedRead>) -> Vec<AlignedPair> {
    let mut reads_by_name: BTreeMap<String, VecDeque<AlignedRead>> = BTreeMap::new();
    let mut existing_reads;
    for read in reads.into_iter() {
        existing_reads =
            reads_by_name.entry(read.read_name.clone()).or_insert(VecDeque::with_capacity(2));
        existing_reads.push_back(read);
    }
    let mut pairs = Vec::new();
    let mut i = 0;
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
        i = i + 1;
    }
    pairs
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use itertools::Itertools;
    use pretty_assertions::assert_eq;

    use crate::bio_util::genomic_coordinates::{GenomicInterval, GenomicRegion};
    use crate::bio_util::sequence::SequenceView;
    use crate::file_formats::sam_bam::tid::TidMap;
    use test_util_rs::htslib_records::RecordBuilder;

    use super::*;

    pub fn gen_aligned_read_pair() -> (AlignedRead, AlignedRead) {
        let paired_read1 = AlignedRead {
            read_name: "paired_read".to_owned(),
            region: GenomicRegion::new("X", 0, 100),
            mate_pos: Some(GenomicRegion::new("X", 200, 201)),
            diffs: Vec::new(),
            is_reverse: false,
        };
        let paired_read2 = AlignedRead {
            read_name: "paired_read".to_owned(),
            region: GenomicRegion::new("X", 200, 301),
            mate_pos: Some(GenomicRegion::new("X", 0, 1)),
            diffs: Vec::new(),
            is_reverse: true,
        };
        (paired_read1, paired_read2)
    }

    pub fn gen_unpaired_read() -> AlignedRead {
        AlignedRead {
            read_name: "unpaired_read".to_owned(),
            region: GenomicRegion::new("X", 0, 100),
            mate_pos: None,
            diffs: Vec::new(),
            is_reverse: false,
        }
    }

    pub fn gen_missing_pair_read() -> AlignedRead {
        AlignedRead {
            read_name: "missing_pair_read".to_owned(),
            region: GenomicRegion::new("X", 0, 100),
            mate_pos: Some(GenomicRegion::new("X", 6000, 6001)),
            diffs: Vec::new(),
            is_reverse: false,
        }
    }

    pub fn gen_discordant_read() -> AlignedRead {
        AlignedRead {
            read_name: "discordant_read".to_owned(),
            region: GenomicRegion::new("X", 0, 100),
            mate_pos: Some(GenomicRegion::new("1", 6000, 6001)),
            diffs: Vec::new(),
            is_reverse: false,
        }
    }

    #[test]
    pub fn test_init_aligned_read_from_record() {
        let seqview = SequenceView::new("TTTAGCTAAA".as_bytes().to_vec(), 1000);
        let record = RecordBuilder::default().mpos(2000).record;
        let tid_map: TidMap =
            [(0, "X".to_owned())].into_iter().collect::<BTreeMap<u32, String>>().into();
        let aligned_read = AlignedRead::from_record(&record, &seqview, &tid_map).unwrap();
        assert_eq!(aligned_read.read_name, "test".to_owned());
        assert_eq!(aligned_read.region, GenomicRegion::new("X", 1003, 1007));
        assert_eq!(aligned_read.mate_pos.unwrap(), GenomicRegion::new("X", 2000, 2001));
        assert!(aligned_read.diffs.is_empty());
        assert!(!aligned_read.is_reverse);
    }

    #[test]
    pub fn test_init_aligned_read_with_invalid_pos() {
        let seqview = SequenceView::new("TTTAGCTAAA".as_bytes().to_vec(), 1000);
        let record = RecordBuilder::default().pos(-1).record;
        let tid_map: TidMap =
            [(0, "X".to_owned())].into_iter().collect::<BTreeMap<u32, String>>().into();
        let result = AlignedRead::from_record(&record, &seqview, &tid_map);
        assert!(result.is_err())
    }

    #[test]
    pub fn test_init_aligned_read_with_invalid_tid() {
        let seqview = SequenceView::new("TTTAGCTAAA".as_bytes().to_vec(), 1000);
        let record = RecordBuilder::default().tid(-1).record;
        let tid_map: TidMap =
            [(0, "X".to_owned())].into_iter().collect::<BTreeMap<u32, String>>().into();
        let result = AlignedRead::from_record(&record, &seqview, &tid_map);
        assert!(result.is_err())
    }

    #[test]
    pub fn test_init_paired_reads_with_pair() {
        let (read1, read2) = gen_aligned_read_pair();
        let paired_reads = PairedReads::new(read1, Some(read2));
        assert_eq!(paired_reads.interval, GenomicInterval::new(0, 301));
    }

    #[test]
    pub fn test_init_paired_reads_with_missing_pair() {
        let read = gen_missing_pair_read();
        let paired_reads = PairedReads::new(read, None);
        assert_eq!(paired_reads.interval, GenomicInterval::new(0, 6001));
    }

    #[test]
    pub fn test_pair_reads() {
        let (paired_read1, paired_read2) = gen_aligned_read_pair();
        let missing_pair_read = gen_missing_pair_read();
        let discordant_read = gen_discordant_read();
        let unpaired_read = gen_unpaired_read();
        let all_reads =
            vec![paired_read1, paired_read2, missing_pair_read, discordant_read, unpaired_read];
        let (
            paired_read1_clone,
            paired_read2_clone,
            missing_pair_read_clone,
            discordant_read_clone,
            unpaired_read_clone,
        ) = all_reads.clone().into_iter().collect_tuple().unwrap();
        let result = pair_reads(all_reads);
        let expected_result = vec![
            AlignedPair::DiscordantReadKind(DiscordantRead::new(discordant_read_clone)),
            AlignedPair::PairedReadsKind(PairedReads::new(missing_pair_read_clone, None)),
            AlignedPair::PairedReadsKind(PairedReads::new(
                paired_read1_clone,
                Some(paired_read2_clone),
            )),
            AlignedPair::UnpairedReadKind(UnpairedRead::new(unpaired_read_clone)),
        ];
        assert_eq!(result, expected_result);
    }
}
