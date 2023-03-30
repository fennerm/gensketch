//! Structs for representing generic alignments which represent any object with a genomic start/end.
//!
//! E.g records from BED/BAM/SAM/VCF files.

use std::marker::PhantomData;

use anyhow::{bail, Result};
use serde::Serialize;

/// Alignment trait to be implemented by concrete record types.
pub trait Alignment {
    /// Unique id for the alignment.
    /// If a record is read multiple times from a file it should always have the same id.
    fn id(&self) -> &str;

    /// Genomic start position
    fn start(&self) -> u64;

    /// Genomic end position
    fn end(&self) -> u64;
}

/// Marker struct which indicates an AlignmentSearchList is sorted by start position
pub struct SortStart {}

/// Marker struct which indicates an AlignmentSearchList is sorted by end position
pub struct SortEnd {}

/// Trait which defines whether alignments are sorted by start or end in an AlignmentSearchList
pub trait SortState {}
impl SortState for SortStart {}
impl SortState for SortEnd {}

/// Ordered list of alignments which can be searched by start/end coordinate.
///
/// The struct has two states (SortStart/SortEnd) which indicate which attribute the vector is
/// currently sorted by. Certain methods are only available for one of the two sort states.
// A treap might be more elegant here but I couldn't find any well maintained implementations in
// rust. Instead we just use a vector and do binary search.
#[derive(Debug, Serialize)]
pub struct AlignmentSearchList<T: Alignment, S: SortState> {
    inner: Vec<T>,
    sort_kind: PhantomData<S>,
}

impl<T: Alignment, S: SortState> AlignmentSearchList<T, S> {
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    pub fn len(&self) -> usize {
        self.inner.len()
    }
}

impl<T: Alignment> AlignmentSearchList<T, SortStart> {
    pub fn with_capacity(capacity: usize) -> Self {
        Self { inner: Vec::with_capacity(capacity), sort_kind: PhantomData }
    }

    pub fn sort_by_end(mut self) -> AlignmentSearchList<T, SortEnd> {
        self.inner.sort_by_key(|al| (al.end(), al.id().to_owned()));
        AlignmentSearchList { inner: self.inner, sort_kind: PhantomData }
    }

    /// Append an element to the end of the list. This is only valid if the list is still sorted
    /// after appending.
    pub fn push(&mut self, value: T) -> Result<()> {
        if let Some(last) = self.inner.last() {
            if value.start() < last.start()
                || (value.start() == last.start() && value.id() < last.id())
            {
                bail!("Pushing value {} would lead to unsorted data", value.id())
            }
        }

        self.inner.push(value);
        Ok(())
    }

    /// Find the first alignment with start coordinate greater than or equal to min_start and return
    /// the index.
    pub fn search_after(&self, min_start: u64) -> Option<usize> {
        if let Some(last) = self.inner.last() {
            if last.start() < min_start {
                return None;
            }
        } else if self.inner.len() == 0 {
            return None;
        }

        let mut low = 0;
        let mut high = self.inner.len() - 1;
        let mut mid;
        while low < high {
            mid = (low + high) / 2;
            if self.inner[mid].start() < min_start {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        Some(low)
    }

    /// Binary search for the next alignment and pop it.
    ///
    /// # Arguments
    ///
    /// * `min_start` - The alignment with the closest start position after this position will be popped.
    pub fn pop_after(&mut self, min_start: u64) -> Option<T> {
        self.search_after(min_start).map(|i| self.inner.remove(i))
    }
}

impl<T: Alignment> AlignmentSearchList<T, SortEnd> {
    #[allow(dead_code)]
    pub fn sort_by_start(mut self) -> AlignmentSearchList<T, SortStart> {
        self.inner.sort_by_key(|al| (al.start(), al.id().to_owned()));
        AlignmentSearchList { inner: self.inner, sort_kind: PhantomData }
    }

    /// Find the first alignment with end coordinate less than or equal to max_end and return
    /// the index.
    pub fn search_before(&self, max_end: u64) -> Option<usize> {
        if let Some(first) = self.inner.first() {
            if first.end() > max_end {
                return None;
            }
        } else if self.inner.len() == 0 {
            return None;
        }

        let mut low = 0;
        let mut high = self.inner.len() - 1;
        let mut mid;
        while low < high {
            mid = ((low + high) / 2) + 1;
            if self.inner[mid].end() > max_end {
                high = mid - 1;
            } else {
                low = mid;
            }
        }
        Some(low)
    }

    /// Binary search for the next alignment and pop it.
    ///
    /// # Arguments
    ///
    /// * `max_end` - The alignment with the closest end position before this position will be
    ///     popped.
    pub fn pop_before(&mut self, max_end: u64) -> Option<T> {
        self.search_before(max_end).map(|i| self.inner.remove(i))
    }

    /// Append an element to the end of the list. This is only valid if the list is still sorted
    /// after appending.
    #[allow(dead_code)]
    pub fn push(&mut self, value: T) -> Result<()> {
        if let Some(last) = self.inner.last() {
            if value.end() < last.end() || (value.end() == last.end() && value.id() < last.id()) {
                bail!("Pushing value {} would lead to unsorted data", value.id());
            }
        }

        self.inner.push(value);
        Ok(())
    }
}

impl<T: Alignment> From<Vec<T>> for AlignmentSearchList<T, SortStart> {
    fn from(mut item: Vec<T>) -> Self {
        item.sort_by_key(|al| (al.start(), al.id().to_owned()));
        Self { inner: item, sort_kind: PhantomData }
    }
}

impl<T: Alignment> From<Vec<T>> for AlignmentSearchList<T, SortEnd> {
    fn from(mut item: Vec<T>) -> Self {
        item.sort_by_key(|al| (al.end(), al.id().to_owned()));
        Self { inner: item, sort_kind: PhantomData }
    }
}

impl<T: Alignment, S: SortState> IntoIterator for AlignmentSearchList<T, S> {
    type Item = T;
    type IntoIter = std::vec::IntoIter<Self::Item>;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.into_iter()
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;
    use crate::bio_util::genomic_coordinates::GenomicInterval;
    use crate::impl_alignment;

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct FakeAlignment {
        id: String,
        interval: GenomicInterval,
    }

    impl_alignment!(FakeAlignment);

    #[test]
    pub fn test_from_vec_sorts_input() {
        let alignments = vec![
            FakeAlignment { id: "4".to_owned(), interval: (11, 22).try_into().unwrap() },
            FakeAlignment { id: "1".to_owned(), interval: (1, 11).try_into().unwrap() },
            FakeAlignment { id: "0".to_owned(), interval: (1, 10).try_into().unwrap() },
            FakeAlignment { id: "2".to_owned(), interval: (2, 12).try_into().unwrap() },
            FakeAlignment { id: "3".to_owned(), interval: (10, 20).try_into().unwrap() },
        ];
        // id is used to break ties
        let expected_result = vec![
            FakeAlignment { id: "0".to_owned(), interval: (1, 10).try_into().unwrap() },
            FakeAlignment { id: "1".to_owned(), interval: (1, 11).try_into().unwrap() },
            FakeAlignment { id: "2".to_owned(), interval: (2, 12).try_into().unwrap() },
            FakeAlignment { id: "3".to_owned(), interval: (10, 20).try_into().unwrap() },
            FakeAlignment { id: "4".to_owned(), interval: (11, 22).try_into().unwrap() },
        ];
        let search_list: AlignmentSearchList<_, SortStart> = alignments.into();
        assert_eq!(search_list.inner, expected_result);
    }

    #[test]
    pub fn test_search_after_with_empty_input() {
        let search_list: AlignmentSearchList<FakeAlignment, _> = Vec::new().into();
        let result = search_list.search_after(0);
        assert_eq!(result, None);
    }

    #[test]
    pub fn test_search_after_with_no_hit() {
        let alignments = vec![
            FakeAlignment { id: "0".to_owned(), interval: (0, 10).try_into().unwrap() },
            FakeAlignment { id: "1".to_owned(), interval: (1, 11).try_into().unwrap() },
        ];
        let search_list: AlignmentSearchList<FakeAlignment, _> = alignments.into();
        let result = search_list.search_after(2);
        assert_eq!(result, None);
    }

    #[test]
    pub fn test_search_after_with_hits() {
        let alignments = vec![
            FakeAlignment { id: "0".to_owned(), interval: (0, 10).try_into().unwrap() },
            FakeAlignment { id: "1".to_owned(), interval: (1, 11).try_into().unwrap() },
            FakeAlignment { id: "2".to_owned(), interval: (1, 12).try_into().unwrap() },
            FakeAlignment { id: "3".to_owned(), interval: (10, 20).try_into().unwrap() },
            FakeAlignment { id: "4".to_owned(), interval: (11, 22).try_into().unwrap() },
        ];
        let search_list: AlignmentSearchList<FakeAlignment, _> = alignments.into();
        assert_eq!(search_list.search_after(0).unwrap(), 0);
        assert_eq!(search_list.search_after(1).unwrap(), 1);
        assert_eq!(search_list.search_after(2).unwrap(), 3);
        assert_eq!(search_list.search_after(11).unwrap(), 4);
    }

    #[test]
    pub fn test_search_before_with_empty_input() {
        let search_list: AlignmentSearchList<FakeAlignment, _> = Vec::new().into();
        let result = search_list.search_before(100);
        assert_eq!(result, None);
    }

    #[test]
    pub fn test_search_before_with_no_hit() {
        let alignments = vec![
            FakeAlignment { id: "0".to_owned(), interval: (0, 10).try_into().unwrap() },
            FakeAlignment { id: "1".to_owned(), interval: (1, 11).try_into().unwrap() },
        ];
        let search_list: AlignmentSearchList<FakeAlignment, _> = alignments.into();
        let result = search_list.search_before(8);
        assert_eq!(result, None);
    }

    #[test]
    pub fn test_search_before_with_hits() {
        let alignments = vec![
            FakeAlignment { id: "0".to_owned(), interval: (0, 10).try_into().unwrap() },
            FakeAlignment { id: "1".to_owned(), interval: (1, 11).try_into().unwrap() },
            FakeAlignment { id: "2".to_owned(), interval: (1, 12).try_into().unwrap() },
            FakeAlignment { id: "3".to_owned(), interval: (10, 20).try_into().unwrap() },
            FakeAlignment { id: "4".to_owned(), interval: (11, 22).try_into().unwrap() },
        ];
        let search_list: AlignmentSearchList<FakeAlignment, _> = alignments.into();
        assert_eq!(search_list.search_before(10).unwrap(), 0);
        assert_eq!(search_list.search_before(11).unwrap(), 1);
        assert_eq!(search_list.search_before(12).unwrap(), 2);
        assert_eq!(search_list.search_before(20).unwrap(), 3);
    }
}
