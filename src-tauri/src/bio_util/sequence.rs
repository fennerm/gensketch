use std::ops::Index;

use anyhow::Result;

// E.g say we have a small subsequence from the a reference sequence and we want to index it using
// genomic coordinates from the reference.
#[derive(Clone, Debug)]
pub struct SequenceView {
    sequence: Vec<u8>,
    offset: u64,
}

impl SequenceView {
    pub fn new(sequence: Vec<u8>, offset: u64) -> Self {
        SequenceView { sequence, offset }
    }

    pub fn contains(&self, pos: u64) -> bool {
        pos > self.offset && pos - self.offset < self.sequence.len() as u64
    }

    pub fn to_string(&self) -> Result<String> {
        Ok(String::from_utf8(self.sequence.to_owned())?)
    }
}

impl Index<u64> for SequenceView {
    type Output = u8;

    fn index(&self, idx: u64) -> &Self::Output {
        &self.sequence[(idx - self.offset) as usize]
    }
}
