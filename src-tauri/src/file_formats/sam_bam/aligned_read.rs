use std::cmp;
use std::collections::{BTreeMap, VecDeque};

use anyhow::{Context, Result};
use rust_htslib::bam::record::Record;
use serde::Serialize;

use crate::alignments::alignment::Alignment;
use crate::bio_util::genomic_coordinates::{GenomicInterval, GenomicRegion};
use crate::bio_util::sequence::SequenceView;
use crate::file_formats::sam_bam::diff::{iter_sequence_diffs, SequenceDiff};
use crate::file_formats::sam_bam::tid::TidMap;
use crate::impl_alignment;

/// Get the genomic region of a read's mate from a rust htslib bam record.
fn get_mate_region(record: &Record, tid_map: &TidMap) -> Result<Option<GenomicRegion>> {
    let raw_mate_pos = record.mpos();
    let raw_mate_tid = record.mtid();
    if raw_mate_pos < 0 || raw_mate_tid < 0 {
        // SAM spec suggests unmapped reads have 1-indexed pos=0, so I believe they should have
        // pos=-1 when converted to 0 indexed.
        return Ok(None);
    }

    let mate_start = record.mpos() as u64;
    let mate_tid = record.mtid();
    tid_map
        .get_seq_name(mate_tid)
        .map(|seq_name| GenomicRegion::new(seq_name, mate_start, mate_start + 1))
        .transpose()
}

/// A single aligned read from a SAM/BAM file.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignedRead {
    pub id: String,
    pub qname: String,
    pub region: GenomicRegion,

    /// Start position of paired read (None if read is unpaired)
    pub mate_pos: Option<GenomicRegion>,

    pub cigar_string: String,

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
        let qname: String = String::from_utf8_lossy(record.qname()).into();
        let seq_name = tid_map.get_seq_name(record.tid()).with_context(|| {
            format!("Attempted to construct AlignedRead from unmapped read (Read {})", qname)
        })?;
        let cigar = record.cigar();
        let start = u64::try_from(record.pos())
            .with_context(|| format!("Read {} has invalid position ({})", qname, record.pos()))?;
        let end = u64::try_from(cigar.end_pos()).with_context(|| {
            format!("Read {} has invalid end position ({})", qname, cigar.end_pos())
        })?;
        let mut genomic_region = GenomicRegion::new(seq_name, start, end)?;
        let diffs = iter_sequence_diffs(record, refseq).collect::<Result<Vec<SequenceDiff>>>()?;
        for diff in &diffs {
            // Accounting for the fact that softclips don't increment the read position per the SAM
            // spec.
            if let SequenceDiff::SoftClip { interval, .. } = diff {
                genomic_region.interval.end += interval.len();
            }
        }
        let is_reverse = record.is_reverse();
        let mate_pos = get_mate_region(record, tid_map)?;
        let mut id = qname.clone();
        if record.is_first_in_template() {
            id.push_str("/1")
        } else {
            id.push_str("/2")
        }
        Ok(AlignedRead {
            id,
            qname,
            region: genomic_region,
            diffs,
            is_reverse,
            mate_pos,
            cigar_string: cigar.to_string(),
        })
    }
}

impl Alignment for AlignedRead {
    fn id(&self) -> &str {
        &self.id
    }
    fn start(&self) -> u64 {
        self.region.start()
    }

    fn end(&self) -> u64 {
        self.region.end()
    }
}

/// A paired set of reads in which both reads align to the same chromosome/contig
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedReads {
    pub id: String,
    pub read1: AlignedRead,
    /// read2 is None when the other read in the pair is outside of the current window
    pub read2: Option<AlignedRead>,
    pub interval: GenomicInterval,
}

impl PairedReads {
    pub fn new(read1: AlignedRead, read2: Option<AlignedRead>) -> Result<Self> {
        let interval: GenomicInterval = match &read2 {
            Some(inner_read2) => {
                let start = cmp::min(read1.region.start(), inner_read2.region.start());
                let end = cmp::max(read1.region.end(), inner_read2.region.end());
                (start, end).try_into()?
            }
            None => {
                // mate_pos should always be defined because otherwise we would have used
                // UnpairedRead instead
                let mate_pos = read1.mate_pos.as_ref().unwrap();
                let start = cmp::min(read1.region.start(), mate_pos.start());
                let end = cmp::max(read1.region.end(), mate_pos.end());
                (start, end).try_into()?
            }
        };
        Ok(Self { id: read1.qname.clone(), read1, read2, interval })
    }
}

/// A read which has no aligned mate.
///
/// These occur when paired-end sequencing was not used or if the mate has been filtered or is
/// unmapped.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnpairedRead {
    pub id: String,
    pub read: AlignedRead,
    pub interval: GenomicInterval,
}

impl UnpairedRead {
    pub fn new(read: AlignedRead) -> Self {
        let interval = read.region.clone().into();
        Self { id: read.qname.clone(), read, interval }
    }
}

/// A read which has an aligned mate but it is on a different chromosome/contig.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordantRead {
    pub id: String,
    pub read: AlignedRead,
    pub interval: GenomicInterval,
}

impl DiscordantRead {
    pub fn new(read: AlignedRead) -> Self {
        let interval = read.region.clone().into();
        Self { id: read.qname.clone(), read, interval }
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
    fn id(&self) -> &str {
        use AlignedPair::*;
        match self {
            PairedReadsKind(PairedReads { id, .. })
            | UnpairedReadKind(UnpairedRead { id, .. })
            | DiscordantReadKind(DiscordantRead { id, .. }) => id,
        }
    }

    fn start(&self) -> u64 {
        use AlignedPair::*;
        match self {
            PairedReadsKind(PairedReads { interval, .. })
            | UnpairedReadKind(UnpairedRead { interval, .. })
            | DiscordantReadKind(DiscordantRead { interval, .. }) => interval.start,
        }
    }

    fn end(&self) -> u64 {
        use AlignedPair::*;
        match self {
            PairedReadsKind(PairedReads { interval, .. })
            | UnpairedReadKind(UnpairedRead { interval, .. })
            | DiscordantReadKind(DiscordantRead { interval, .. }) => interval.end,
        }
    }
}

impl_alignment![DiscordantRead, PairedReads, UnpairedRead];

/// Match aligned reads to their mate pairs
///
/// Output order is determined by the read name of the first read in the pair.
pub fn pair_reads(reads: Vec<AlignedRead>) -> Result<Vec<AlignedPair>> {
    let mut reads_by_name: BTreeMap<String, VecDeque<AlignedRead>> = BTreeMap::new();
    let mut existing_reads;
    for read in reads.into_iter() {
        existing_reads =
            reads_by_name.entry(read.qname.clone()).or_insert(VecDeque::with_capacity(2));
        existing_reads.push_back(read);
    }
    let mut pairs = Vec::new();
    for (_, reads) in reads_by_name.iter_mut() {
        let read1 = reads.pop_front().unwrap();
        match &read1.mate_pos {
            Some(mate_pos) => {
                if read1.region.seq_name == mate_pos.seq_name {
                    let read2 = reads.pop_front();
                    let pair = PairedReads::new(read1, read2)?;
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
    }
    Ok(pairs)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use itertools::Itertools;
    use pretty_assertions::assert_eq;

    use crate::bio_util::genomic_coordinates::{GenomicInterval, GenomicRegion};
    use crate::bio_util::sequence::SequenceView;
    use crate::file_formats::sam_bam::tid::TidMap;
    use crate::test_util::htslib_records::RecordBuilder;

    use super::*;

    pub fn gen_aligned_read_pair() -> (AlignedRead, AlignedRead) {
        let paired_read1 = AlignedRead {
            id: "paired_read/1".to_owned(),
            qname: "paired_read".to_owned(),
            cigar_string: "100M".to_owned(),
            region: GenomicRegion::new("X", 0, 100).unwrap(),
            mate_pos: Some(GenomicRegion::new("X", 200, 201).unwrap()),
            diffs: Vec::new(),
            is_reverse: false,
        };
        let paired_read2 = AlignedRead {
            id: "paired_read/2".to_owned(),
            qname: "paired_read".to_owned(),
            cigar_string: "100M".to_owned(),
            region: GenomicRegion::new("X", 200, 301).unwrap(),
            mate_pos: Some(GenomicRegion::new("X", 0, 1).unwrap()),
            diffs: Vec::new(),
            is_reverse: true,
        };
        (paired_read1, paired_read2)
    }

    pub fn gen_unpaired_read() -> AlignedRead {
        AlignedRead {
            id: "unpaired_read/1".to_owned(),
            qname: "unpaired_read".to_owned(),
            region: GenomicRegion::new("X", 0, 100).unwrap(),
            mate_pos: None,
            cigar_string: "100M".to_owned(),
            diffs: Vec::new(),
            is_reverse: false,
        }
    }

    pub fn gen_missing_pair_read() -> AlignedRead {
        AlignedRead {
            id: "missing_pair_read/1".to_owned(),
            qname: "missing_pair_read".to_owned(),
            region: GenomicRegion::new("X", 0, 100).unwrap(),
            mate_pos: Some(GenomicRegion::new("X", 6000, 6001).unwrap()),
            cigar_string: "100M".to_owned(),
            diffs: Vec::new(),
            is_reverse: false,
        }
    }

    pub fn gen_discordant_read() -> AlignedRead {
        AlignedRead {
            id: "discordant_read/1".to_owned(),
            qname: "discordant_read".to_owned(),
            region: GenomicRegion::new("X", 0, 100).unwrap(),
            mate_pos: Some(GenomicRegion::new("1", 6000, 6001).unwrap()),
            cigar_string: "100M".to_owned(),
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
        assert_eq!(aligned_read.qname, "test".to_owned());
        assert_eq!(aligned_read.region, GenomicRegion::new("X", 1003, 1007).unwrap());
        assert_eq!(aligned_read.mate_pos.unwrap(), GenomicRegion::new("X", 2000, 2001).unwrap());
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
        let paired_reads = PairedReads::new(read1, Some(read2)).unwrap();
        assert_eq!(paired_reads.interval, GenomicInterval::new(0, 301).unwrap());
    }

    #[test]
    pub fn test_init_paired_reads_with_missing_pair() {
        let read = gen_missing_pair_read();
        let paired_reads = PairedReads::new(read, None).unwrap();
        assert_eq!(paired_reads.interval, GenomicInterval::new(0, 6001).unwrap());
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
        let result = pair_reads(all_reads).unwrap();
        let expected_result = vec![
            AlignedPair::DiscordantReadKind(DiscordantRead::new(discordant_read_clone)),
            AlignedPair::PairedReadsKind(PairedReads::new(missing_pair_read_clone, None).unwrap()),
            AlignedPair::PairedReadsKind(
                PairedReads::new(paired_read1_clone, Some(paired_read2_clone)).unwrap(),
            ),
            AlignedPair::UnpairedReadKind(UnpairedRead::new(unpaired_read_clone)),
        ];
        assert_eq!(result, expected_result);
    }
}
