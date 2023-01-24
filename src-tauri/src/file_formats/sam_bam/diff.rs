use rust_htslib::bam::record::{Cigar, Record, Seq};
use serde::Serialize;

use crate::bio_util::genomic_coordinates::GenomicInterval;
use crate::bio_util::sequence::SequenceView;
use crate::util::same_enum_variant;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SequenceDiff {
    // Cigar=M or X. M in cigar string can mean either a match or a mismatch.
    Mismatch { interval: GenomicInterval, sequence: String },

    // Cigar=I
    Ins { interval: GenomicInterval, sequence: String },

    // Cigar=D
    Del { interval: GenomicInterval },

    // Cigar=S
    SoftClip { interval: GenomicInterval, sequence: String },
}

// This code is mostly stolen from rust-htslib's iterator of the same name with a few updates for
// our usecase.
// 1. i64s are cast to u64. This should be safe because we don't expect negative positions for
// aligned reads.
// 2. The current cigar operation is returned for each base so that we can distinguish between
// insertions vs. softclipping.
pub struct IterAlignedPairsCigar {
    genome_pos: i64,
    read_pos: i64,
    cigar: Vec<Cigar>,
    remaining_match_bp: u32,
    remaining_ins_bp: u32,
    remaining_del_bp: u32,
    cigar_index: usize,
}

impl IterAlignedPairsCigar {
    pub fn new(genome_pos: i64, cigar: Vec<Cigar>) -> Self {
        IterAlignedPairsCigar {
            genome_pos,
            read_pos: 0,
            cigar,
            remaining_match_bp: 0,
            remaining_ins_bp: 0,
            remaining_del_bp: 0,
            cigar_index: 0,
        }
    }
}

impl Iterator for IterAlignedPairsCigar {
    type Item = (Cigar, Option<usize>, Option<u64>);

    fn next(&mut self) -> Option<Self::Item> {
        if self.remaining_match_bp > 0 {
            self.remaining_match_bp -= 1;
            self.genome_pos += 1;
            self.read_pos += 1;
            return Some((
                self.cigar[self.cigar_index - 1],
                Some(self.read_pos as usize - 1),
                Some(self.genome_pos as u64 - 1),
            ));
        }
        if self.remaining_ins_bp > 0 {
            self.remaining_ins_bp -= 1;
            self.read_pos += 1;
            return Some((
                self.cigar[self.cigar_index - 1],
                Some(self.read_pos as usize - 1),
                None,
            ));
        }
        if self.remaining_del_bp > 0 {
            self.remaining_del_bp -= 1;
            self.genome_pos += 1;
            return Some((
                self.cigar[self.cigar_index - 1],
                None,
                Some(self.genome_pos as u64 - 1),
            ));
        }

        while self.cigar_index < self.cigar.len() {
            let entry = self.cigar[self.cigar_index];
            match entry {
                Cigar::Match(len) | Cigar::Equal(len) | Cigar::Diff(len) => {
                    self.genome_pos += 1;
                    self.read_pos += 1;
                    self.remaining_match_bp = len - 1;
                    self.cigar_index += 1;
                    return Some((
                        entry,
                        Some(self.read_pos as usize - 1),
                        Some(self.genome_pos as u64 - 1),
                    ));
                }
                Cigar::Ins(len) | Cigar::SoftClip(len) => {
                    self.read_pos += 1;
                    self.remaining_ins_bp = len - 1;
                    self.cigar_index += 1;
                    return Some((entry, Some(self.read_pos as usize - 1), None));
                }
                Cigar::Del(len) | Cigar::RefSkip(len) => {
                    self.genome_pos += 1;
                    self.remaining_del_bp = len - 1;
                    self.cigar_index += 1;
                    return Some((entry, None, Some(self.genome_pos as u64 - 1)));
                }
                Cigar::HardClip(_) => {
                    // no advance
                }
                // padding is only used for multiple sequence alignment
                Cigar::Pad(_) => panic!("Padding (Cigar::Pad) is not supported."),
            }
            self.cigar_index += 1;
        }
        None
    }
}

fn iter_aligned_pairs_cigar(record: &Record) -> IterAlignedPairsCigar {
    IterAlignedPairsCigar::new(record.pos(), record.cigar().take().0)
}

pub struct DiffAlignments<'a> {
    refseq: &'a SequenceView,
    current_diff_ref_start: u64,
    record_sequence: Seq<'a>,
    aligned_pair_index: usize,
    aligned_pairs: Vec<(Cigar, Option<usize>, Option<u64>)>,
}

impl<'a> DiffAlignments<'a> {
    pub fn new(record: &'a Record, refseq: &'a SequenceView) -> Self {
        DiffAlignments {
            refseq,
            current_diff_ref_start: 0,
            record_sequence: record.seq(),
            aligned_pair_index: 0,
            aligned_pairs: iter_aligned_pairs_cigar(record).collect(),
        }
    }

    fn collapse_diff(&mut self) -> SequenceDiff {
        let initial_aligned_pair = self.aligned_pairs[self.aligned_pair_index];
        let mut aligned_pair = initial_aligned_pair;
        let mut sequence = Vec::new();
        let mut current_ref_pos = self.current_diff_ref_start;
        loop {
            if !same_enum_variant(&aligned_pair.0, &initial_aligned_pair.0) {
                break;
            }
            match aligned_pair {
                (Cigar::Ins(_) | Cigar::SoftClip(_), Some(read_pos), None) => {
                    sequence.push(self.record_sequence[read_pos]);
                }
                (Cigar::Del(_), None, Some(ref_pos)) => {
                    current_ref_pos = ref_pos;
                }
                _ => break,
            }

            if self.aligned_pair_index + 1 >= self.aligned_pairs.len() {
                break;
            }
            self.aligned_pair_index += 1;
            aligned_pair = self.aligned_pairs[self.aligned_pair_index];
        }
        let interval = GenomicInterval {
            start: self.current_diff_ref_start as u64,
            end: current_ref_pos + 1 as u64,
        };
        let sequence = String::from_utf8_lossy(&sequence).into();
        match initial_aligned_pair {
            (Cigar::Ins(_), _, _) => SequenceDiff::Ins { interval, sequence },
            (Cigar::SoftClip(_), _, _) => SequenceDiff::SoftClip { interval, sequence },
            (Cigar::Del(_), _, _) => SequenceDiff::Del { interval },
            _ => {
                panic!("extend_diff_group called with invalid input");
            }
        }
    }

    fn handle_possible_mismatch(&mut self, read_pos: usize, ref_pos: u64) -> Option<SequenceDiff> {
        let read_base = self.record_sequence[read_pos];
        let ref_base = self.refseq[ref_pos];
        if read_base != ref_base {
            let interval = GenomicInterval { start: ref_pos, end: ref_pos + 1 };
            return Some(SequenceDiff::Mismatch {
                interval,
                sequence: String::from_utf8_lossy(&[read_base]).into(),
            });
        }
        None
    }
}

impl<'a> Iterator for DiffAlignments<'a> {
    type Item = SequenceDiff;

    fn next(&mut self) -> Option<SequenceDiff> {
        while self.aligned_pair_index < self.aligned_pairs.len() {
            let aligned_pair = self.aligned_pairs[self.aligned_pair_index];
            if let (_, _, Some(ref_pos)) = aligned_pair {
                if !self.refseq.contains(ref_pos) {
                    // If the position is outside of the viewed region then we skip computing diff
                    self.aligned_pair_index += 1;
                    continue;
                }
                self.current_diff_ref_start = ref_pos;
            }
            let maybe_diff = match aligned_pair {
                (Cigar::Ins(_) | Cigar::SoftClip(_) | Cigar::Del(_), _, _) => {
                    Some(self.collapse_diff())
                }
                (Cigar::Match(_) | Cigar::Diff(_), Some(read_pos), Some(ref_pos)) => {
                    self.handle_possible_mismatch(read_pos, ref_pos)
                }
                _ => None,
            };
            self.aligned_pair_index += 1;
            if let Some(diff) = maybe_diff {
                return Some(diff);
            }
        }
        None
    }
}

pub fn iter_sequence_diffs<'a>(record: &'a Record, refseq: &'a SequenceView) -> DiffAlignments<'a> {
    DiffAlignments::new(record, refseq)
}
