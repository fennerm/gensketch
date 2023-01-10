use std::fmt;

use serde::{Deserialize, Serialize};

/// A set of genomic coordinates.
///
/// Coordinates are always stored 0-indexed. Start/end is stored as u64 to account for large
/// genomes which overflow u32.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenomicRegion {
    /// Chromosome or contig name
    pub seq_name: String,
    pub start: u64,
    pub end: u64,
}

impl GenomicRegion {
    pub fn new(seq_name: &str, start: u64, end: u64) -> Self {
        Self { seq_name: seq_name.to_owned(), start, end }
    }

    pub fn interval(&self) -> GenomicInterval {
        GenomicInterval { start: self.start, end: self.end }
    }
}

impl fmt::Display for GenomicRegion {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}:{}-{}", self.seq_name, self.start, self.end)
    }
}

// Simple interval with a start/end coordinate.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct GenomicInterval {
    pub start: u64,
    pub end: u64,
}

impl GenomicInterval {
    pub fn new(start: u64, end: u64) -> Self {
        Self { start, end }
    }
}

impl From<(u64, u64)> for GenomicInterval {
    fn from(item: (u64, u64)) -> Self {
        Self::new(item.0, item.1)
    }
}

impl From<GenomicRegion> for GenomicInterval {
    fn from(item: GenomicRegion) -> Self {
        item.interval()
    }
}

impl fmt::Display for GenomicInterval {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}-{}", self.start, self.end)
    }
}

#[cfg(test)]
mod tests {
    use super::{GenomicInterval, GenomicRegion};

    #[test]
    fn test_genomic_region_string_formatting() {
        let region = GenomicRegion::new("chrX", 1, 10000);
        assert_eq!(region.to_string(), "chrX:1-10000");
    }

    #[test]
    fn test_genomic_interval_string_formatting() {
        let interval = GenomicInterval::new(1, 10000);
        assert_eq!(interval.to_string(), "1-10000");
    }

    #[test]
    fn test_convert_genomic_region_to_interval() {
        let region = GenomicRegion::new("chrX", 1, 10000);
        let expected_interval = GenomicInterval::new(1, 10000);
        assert_eq!(region.to(GenomicInterval), expected_interval);
    }
}
