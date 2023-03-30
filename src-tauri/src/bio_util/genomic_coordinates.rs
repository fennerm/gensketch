use std::convert::From;
use std::fmt;

use anyhow::{bail, Error, Result};
use serde::{Deserialize, Serialize};
use serde_with::{serde_as, DisplayFromStr};

/// A set of genomic coordinates.
///
/// Coordinates are always stored 0-indexed. Start/end is stored as u64 to account for large
/// genomes which overflow u32.
#[serde_as]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenomicRegion {
    /// Chromosome or contig name
    pub seq_name: String,
    pub interval: GenomicInterval,
}

impl GenomicRegion {
    pub fn new(seq_name: &str, start: u64, end: u64) -> Result<Self> {
        if end < start {
            bail!("Invalid genomic coordinates: {}-{}", start, end);
        }
        Ok(Self { seq_name: seq_name.to_owned(), interval: (start, end).try_into()? })
    }

    pub fn start(&self) -> u64 {
        self.interval.start
    }

    pub fn end(&self) -> u64 {
        self.interval.end
    }

    pub fn len(&self) -> u64 {
        self.interval.len()
    }

    pub fn interval(&self) -> &GenomicInterval {
        &self.interval
    }

    pub fn expand(&self, by: u64) -> Result<Self> {
        let expanded_interval = self.interval.expand(by)?;
        Self::new(&self.seq_name, expanded_interval.start, expanded_interval.end)
    }

    pub fn contract(&self, by: u64) -> Result<Self> {
        let contracted_interval = self.interval.contract(by)?;
        Self::new(&self.seq_name, contracted_interval.start, contracted_interval.end)
    }

    pub fn contains(&self, region: GenomicRegion) -> bool {
        region.seq_name == self.seq_name && self.interval().contains(region.interval())
    }
}

impl fmt::Display for GenomicRegion {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}:{}-{}", self.seq_name, self.interval.start, self.interval.end)
    }
}

// Simple interval with a start/end coordinate.
#[serde_as]
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenomicInterval {
    #[serde_as(as = "DisplayFromStr")]
    pub start: u64,
    #[serde_as(as = "DisplayFromStr")]
    pub end: u64,
}

impl GenomicInterval {
    pub fn new(start: u64, end: u64) -> Result<Self> {
        if end < start {
            bail!("Invalid genomic coordinates: {}-{}", start, end);
        }
        Ok(Self { start, end })
    }

    pub fn len(&self) -> u64 {
        self.end - self.start
    }

    pub fn expand(&self, by: u64) -> Result<Self> {
        Self::new(self.start.saturating_sub(by), self.end + by)
    }

    pub fn contract(&self, by: u64) -> Result<Self> {
        Self::new(self.start + by, self.end - by)
    }

    pub fn contains(&self, other: &GenomicInterval) -> bool {
        self.start <= other.start && self.end >= other.end
    }

    pub fn overlaps(&self, other: &GenomicInterval) -> bool {
        self.start <= other.end && self.end <= self.end
    }
}

impl TryFrom<(u64, u64)> for GenomicInterval {
    type Error = Error;

    fn try_from(item: (u64, u64)) -> Result<Self> {
        Self::new(item.0, item.1)
    }
}

impl From<GenomicRegion> for GenomicInterval {
    fn from(item: GenomicRegion) -> Self {
        item.interval.clone()
    }
}

impl fmt::Display for GenomicInterval {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}-{}", self.start, self.end)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_invalid_genomic_region_returns_error() {
        assert!(GenomicRegion::new("X", 100, 0).is_err())
    }

    #[test]
    fn test_invalid_genomic_interval_returns_error() {
        assert!(GenomicInterval::new(100, 0).is_err())
    }

    #[test]
    fn test_genomic_region_string_formatting() {
        let region = GenomicRegion::new("chrX", 1, 10000).unwrap();
        assert_eq!(region.to_string(), "chrX:1-10000");
    }

    #[test]
    fn test_genomic_interval_string_formatting() {
        let interval = GenomicInterval::new(1, 10000).unwrap();
        assert_eq!(interval.to_string(), "1-10000");
    }

    #[test]
    fn test_convert_genomic_region_to_interval() {
        let region = GenomicRegion::new("chrX", 1, 10000).unwrap();
        let expected_interval = GenomicInterval::new(1, 10000).unwrap();
        assert_eq!(*region.interval(), expected_interval);
    }
}
