use std::ops::Index;

use anyhow::Result;

/// Holds a subsequence which can be indexed using coordinates from the larger sequence.
///
/// E.g say we have a small subsequence from the a fasta and we want to index it using
/// genomic coordinates from the reference.
#[derive(Clone, Debug)]
pub struct SequenceView {
    sequence: Vec<u8>,
    // The start coordinate of the subsequence within the parent sequence
    offset: u64,
}

impl SequenceView {
    pub fn new(sequence: Vec<u8>, offset: u64) -> Self {
        SequenceView { sequence, offset }
    }

    pub fn contains(&self, pos: u64) -> bool {
        pos >= self.offset && pos - self.offset < self.sequence.len() as u64
    }

    pub fn to_string(&self) -> Result<String> {
        Ok(String::from_utf8(self.sequence.to_owned())?)
    }

    pub fn subseq(&self, start: u64, end: u64) -> Result<Self> {
        if end - start > self.sequence.len() as u64 {
            return Err(anyhow::anyhow!("Requested subsequence is longer than the sequence"));
        }
        if start < self.offset || end > self.offset + self.sequence.len() as u64 {
            return Err(anyhow::anyhow!("Requested subsequence is outside of the sequence"));
        }
        let sequence_copy = self.sequence.clone();
        let seq = sequence_copy[(start - self.offset) as usize..(end - self.offset) as usize]
            .to_vec()
            .clone();
        Ok(Self::new(seq, start))
    }
}

impl Index<u64> for SequenceView {
    type Output = u8;

    fn index(&self, idx: u64) -> &Self::Output {
        &self.sequence[(idx - self.offset) as usize]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sequence_view_indexing() {
        let view = SequenceView::new("AGCT".as_bytes().to_vec(), 1000);
        assert_eq!(view[1000], "A".as_bytes()[0]);
        assert_eq!(view[1003], "T".as_bytes()[0]);
    }

    #[test]
    fn test_sequence_view_contains() {
        let view = SequenceView::new("AGCT".as_bytes().to_vec(), 1000);
        assert!(view.contains(1000));
        assert!(view.contains(1003));
        assert!(!view.contains(1004));
        assert!(!view.contains(999));
    }

    #[test]
    fn test_sequence_view_to_string() {
        let view = SequenceView::new("AGCT".as_bytes().to_vec(), 1000);
        let result = view.to_string().unwrap();
        assert_eq!(result, "AGCT".to_owned());
    }

    #[test]
    fn test_subseq() {
        let view = SequenceView::new("AGCT".as_bytes().to_vec(), 1000);
        let subseq = view.subseq(1001, 1003).unwrap();
        assert_eq!(subseq.to_string().unwrap(), "GC".to_owned());
    }

    #[test]
    fn test_subseq_with_no_offset() {
        let view = SequenceView::new("AGCT".as_bytes().to_vec(), 0);
        let subseq = view.subseq(1, 3).unwrap();
        assert_eq!(subseq.to_string().unwrap(), "GC".to_owned());
    }

    #[test]
    fn test_error_returned_if_subseq_is_longer_than_sequence() {
        let view = SequenceView::new("AGCT".as_bytes().to_vec(), 0);
        let result = view.subseq(1, 5);
        assert!(result.is_err());
    }

    #[test]
    fn test_error_returned_if_subseq_is_before_start_of_sequence() {
        let view = SequenceView::new("AGCT".as_bytes().to_vec(), 100);
        let result = view.subseq(1, 2);
        assert!(result.is_err());
    }
    #[test]
    fn test_error_returned_if_subseq_is_after_end_of_sequence() {
        let view = SequenceView::new("AGCT".as_bytes().to_vec(), 100);
        let result = view.subseq(1001, 1002);
        assert!(result.is_err());
    }
}
