use anyhow::Result;
use rust_htslib::bam::record::{Cigar, Record, Seq};
use serde::Serialize;

use crate::bio_util::genomic_coordinates::GenomicInterval;
use crate::bio_util::sequence::SequenceView;
use crate::util::same_enum_variant;

/// A sequence difference between an aligned read and the reference.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SequenceDiff {
    /// A single base substitution.
    // Cigar=M or X. M in cigar string can mean either a match or a mismatch.
    Mismatch {
        interval: GenomicInterval,
        sequence: String,
    },

    /// An insertion of one or more bases which are not present in the reference.
    // Cigar=I
    Ins {
        interval: GenomicInterval,
        sequence: String,
    },

    /// A deletion of one or more bases which are present in the reference.
    // Cigar=D
    Del {
        interval: GenomicInterval,
    },

    /// Bases which have been softclipped (generally at the end of the read).
    // Cigar=S
    SoftClip {
        interval: GenomicInterval,
        sequence: String,
    },

    // Reference bases which are skipped (e.g introns in RNAseq).
    RefSkip {
        interval: GenomicInterval,
    },
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
                Cigar::Ins(len) => {
                    self.read_pos += 1;
                    self.remaining_ins_bp = len - 1;
                    self.cigar_index += 1;
                    return Some((entry, Some(self.read_pos as usize - 1), None));
                }
                Cigar::SoftClip(len) => {
                    // Technically per the SAM spec a softclipped base shouldn't increment the
                    // genome position. But for our purposes its useful to increment so that
                    // we know where to render softclips on reads.
                    self.genome_pos += 1;
                    self.read_pos += 1;
                    self.remaining_ins_bp = len - 1;
                    self.cigar_index += 1;
                    return Some((
                        entry,
                        Some(self.read_pos as usize - 1),
                        Some(self.genome_pos as u64 - 1),
                    ));
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

/// Iterate across sequence differences in an aligned read from a SAM/BAM file.
pub struct DiffAlignments<'a> {
    /// Reference sequence overlapping the read.
    refseq: &'a SequenceView,

    /// The genomic reference position where the diff which is currently being parsed began.
    current_diff_ref_start: u64,

    /// The read sequence
    record_sequence: Seq<'a>,

    /// The current position which is being iterated over from the aligned read
    aligned_pair_index: usize,

    /// A vector of tuples of the form (current Cigar operation, current read position, current reference
    /// position).
    aligned_pairs: Vec<(Cigar, Option<usize>, Option<u64>)>,
}

impl<'a> DiffAlignments<'a> {
    pub fn new(record: &'a Record, refseq: &'a SequenceView) -> Self {
        DiffAlignments {
            refseq,
            current_diff_ref_start: record.pos() as u64,
            record_sequence: record.seq(),
            aligned_pair_index: 0,
            aligned_pairs: iter_aligned_pairs_cigar(record).collect(),
        }
    }

    /// Collapse sequence differences which span multiple bases into a single SequenceDiff object.
    ///
    /// E.g required for Ins/Del diffs which commonly span multiple bases.
    fn collapse_diff(&mut self) -> Result<SequenceDiff> {
        let initial_aligned_pair = self.aligned_pairs[self.aligned_pair_index];
        let mut aligned_pair = initial_aligned_pair;
        let mut sequence = Vec::new();
        let mut current_ref_pos = self.current_diff_ref_start;
        loop {
            match aligned_pair {
                (Cigar::Ins(_), Some(read_pos), None) => {
                    sequence.push(self.record_sequence[read_pos]);
                }
                (Cigar::Del(_) | Cigar::RefSkip(_), _, Some(ref_pos)) => {
                    current_ref_pos = ref_pos;
                }
                (Cigar::SoftClip(_), Some(read_pos), Some(ref_pos)) => {
                    sequence.push(self.record_sequence[read_pos]);
                    current_ref_pos = ref_pos;
                }
                _ => break,
            }

            if self.aligned_pair_index + 1 >= self.aligned_pairs.len() {
                break;
            }
            aligned_pair = self.aligned_pairs[self.aligned_pair_index + 1];

            if !same_enum_variant(&aligned_pair.0, &initial_aligned_pair.0) {
                break;
            }

            self.aligned_pair_index += 1;
        }
        let sequence = String::from_utf8_lossy(&sequence).into();
        let diff = match initial_aligned_pair {
            (Cigar::Ins(_), _, _) => SequenceDiff::Ins {
                interval: (self.current_diff_ref_start, current_ref_pos).try_into()?,
                sequence,
            },
            (Cigar::SoftClip(_), _, _) => SequenceDiff::SoftClip {
                interval: (self.current_diff_ref_start, current_ref_pos + 1).try_into()?,
                sequence,
            },
            (Cigar::Del(_), _, _) => SequenceDiff::Del {
                interval: (self.current_diff_ref_start, current_ref_pos + 1).try_into()?,
            },
            (Cigar::RefSkip(_), _, _) => SequenceDiff::RefSkip {
                interval: (self.current_diff_ref_start, current_ref_pos + 1).try_into()?,
            },
            _ => {
                panic!("extend_diff_group called with invalid input");
            }
        };
        Ok(diff)
    }

    /// Determine if a base with an M or X CIGAR operation has a mismatch.
    ///
    /// The CIGAR spec is a bit awkward regarding mismatches because M can mean either a match or a
    /// mismatch. We handle this by directly comparing the read sequence to the reference sequence
    /// at these positions. An alternative would be to parse the MD tag but since reads from
    /// certain sequencers/aligners do not populate this tag its safer to just use the CIGAR.
    fn handle_possible_mismatch(
        &mut self,
        read_pos: usize,
        ref_pos: u64,
    ) -> Result<Option<SequenceDiff>> {
        let read_base = self.record_sequence[read_pos];
        let ref_base = self.refseq[ref_pos];
        if read_base != ref_base {
            let interval = (ref_pos, ref_pos + 1).try_into()?;
            return Ok(Some(SequenceDiff::Mismatch {
                interval,
                sequence: String::from_utf8_lossy(&[read_base]).into(),
            }));
        }
        Ok(None)
    }
}

impl<'a> Iterator for DiffAlignments<'a> {
    type Item = Result<SequenceDiff>;

    fn next(&mut self) -> Option<Self::Item> {
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
                (Cigar::Ins(_) | Cigar::SoftClip(_) | Cigar::Del(_) | Cigar::RefSkip(_), _, _) => {
                    Some(self.collapse_diff())
                }
                (Cigar::Match(_) | Cigar::Diff(_), Some(read_pos), Some(ref_pos)) => {
                    self.handle_possible_mismatch(read_pos, ref_pos).transpose()
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

/// Iterate across SequenceDiffs in a rust-htslib BAM/SAM Record.
pub fn iter_sequence_diffs<'a>(record: &'a Record, refseq: &'a SequenceView) -> DiffAlignments<'a> {
    DiffAlignments::new(record, refseq)
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;
    use rust_htslib::bam::record::CigarString;

    use super::*;
    use crate::test_util::htslib_records::RecordBuilder;

    pub fn run_diff(cigar: &str, read_seq: &[u8], qual: &[u8]) -> Result<Vec<SequenceDiff>> {
        let seqview = SequenceView::new("TTTAGCTAAA".as_bytes().to_vec(), 1000);
        let record = RecordBuilder::new(
            b"read",
            read_seq,
            Some(&CigarString::try_from(cigar).unwrap()),
            qual,
        )
        .record;
        iter_sequence_diffs(&record, &seqview).collect()
    }

    #[test]
    pub fn test_diff_with_no_diffs_and_m_cigar() {
        let diffs = run_diff("4M", b"AGCT", b"BBBB").unwrap();
        assert_eq!(diffs, Vec::new());
    }

    #[test]
    pub fn test_diff_with_no_diffs_and_eq_cigar() {
        let diffs = run_diff("4=", b"AGCT", b"BBBB").unwrap();
        assert_eq!(diffs, Vec::new());
    }

    #[test]
    pub fn test_diff_with_snv_and_m_cigar() {
        let diffs = run_diff("4M", b"TGCT", b"BBBB").unwrap();
        assert_eq!(
            diffs,
            vec!(SequenceDiff::Mismatch {
                interval: (1003, 1004).try_into().unwrap(),
                sequence: "T".to_owned()
            })
        );
    }

    #[test]
    pub fn test_diff_with_snv_and_x_cigar() {
        let diffs = run_diff("1X3=", b"TGCT", b"BBBB").unwrap();
        assert_eq!(
            diffs,
            vec!(SequenceDiff::Mismatch {
                interval: (1003, 1004).try_into().unwrap(),
                sequence: "T".to_owned()
            })
        );
    }

    #[test]
    pub fn test_diff_with_deletion() {
        let diffs = run_diff("3M1D", b"AGC", b"BBB").unwrap();
        assert_eq!(diffs, vec!(SequenceDiff::Del { interval: (1006, 1007).try_into().unwrap() }));
    }

    #[test]
    pub fn test_diff_with_insertion() {
        let diffs = run_diff("2M1I2M", b"AGTCT", b"BBBBB").unwrap();
        assert_eq!(
            diffs,
            vec!(SequenceDiff::Ins {
                interval: (1004, 1004).try_into().unwrap(),
                sequence: "T".to_owned()
            })
        );
    }

    #[test]
    pub fn test_diff_with_softclip_at_start() {
        let diffs = run_diff("1S3M", b"TGCT", b"BBBB").unwrap();
        assert_eq!(
            diffs,
            vec!(SequenceDiff::SoftClip {
                interval: (1003, 1004).try_into().unwrap(),
                sequence: "T".to_owned()
            })
        );
    }

    #[test]
    pub fn test_diff_with_softclip_at_end() {
        let diffs = run_diff("3M1S", b"AGCA", b"BBBB").unwrap();
        assert_eq!(
            diffs,
            vec!(SequenceDiff::SoftClip {
                interval: (1006, 1007).try_into().unwrap(),
                sequence: "A".to_owned()
            })
        );
    }

    #[test]
    pub fn test_hardclips_dont_produce_diffs() {
        let diffs = run_diff("3M1H", b"AGC", b"BBB").unwrap();
        assert_eq!(diffs, Vec::new());
    }

    #[test]
    pub fn test_diff_with_refskip() {
        let diffs = run_diff("2M1N1M", b"AGT", b"BBB").unwrap();
        assert_eq!(
            diffs,
            vec!(SequenceDiff::RefSkip { interval: (1005, 1006).try_into().unwrap() })
        );
    }

    #[test]
    pub fn test_complex_diff() {
        let diffs = run_diff("2M3D1M4I1M", b"AGATTTTA", b"BBBBBBBB").unwrap();
        let expected_diffs = vec![
            SequenceDiff::Del { interval: (1005, 1008).try_into().unwrap() },
            SequenceDiff::Ins {
                interval: (1008, 1008).try_into().unwrap(),
                sequence: "TTTT".to_owned(),
            },
        ];
        assert_eq!(diffs, expected_diffs);
    }
}
