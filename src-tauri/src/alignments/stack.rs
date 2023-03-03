/// Stacking alignments into rows for rendering in the GUI.
use std::collections::VecDeque;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::alignments::alignment::{Alignment, AlignmentSearchList, SortEnd, SortStart};
use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::impl_wrapped_uuid;

const PADDING: u64 = 1;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct StackId(Uuid);
impl_wrapped_uuid!(StackId);

/// Alignments packed into rows for rendering in the GUI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignmentStack<T> {
    pub id: StackId,
    pub rows: Vec<VecDeque<T>>,
    pub buffered_region: GenomicRegion,
}

impl<T: Alignment> AlignmentStack<T> {
    pub fn new(buffered_region: GenomicRegion) -> Self {
        Self { rows: Vec::new(), id: StackId::new(), buffered_region }
    }

    fn count_alignments(&self) -> usize {
        self.rows.iter().map(|row| row.len()).sum()
    }

    /// Filter out any alignments which do not overlap self.buffered_region
    fn trim(&mut self) {
        let num_alignments = self.count_alignments();
        for row in self.rows.iter_mut() {
            row.retain(|alignment| {
                self.buffered_region.start() <= alignment.end()
                    && self.buffered_region.end() >= alignment.start()
            })
        }
        self.rows.retain(|row| row.len() > 0);
        log::debug!(
            "Trimmed {} alignments from stack {}",
            num_alignments - self.count_alignments(),
            self.id
        );
    }

    /// Find any alignments in self.rows which have the same id as one of the input alignments and
    /// replace them.
    ///
    /// This is necessary in scenarios where we load a new genomic region which partially overlaps
    /// the previous region. The original region may have some reads with missing mates which
    /// are present in the new region.
    fn replace_duplicates(
        &mut self,
        alignments: AlignmentSearchList<T, SortStart>,
    ) -> Result<AlignmentSearchList<T, SortStart>> {
        let mut updated_alignments = AlignmentSearchList::with_capacity(alignments.len());
        let mut stack_items: Vec<&mut T> = self.rows.iter_mut().flatten().collect();
        let num_existing_items = stack_items.len();
        stack_items.sort_by_key(|al| (al.start(), al.id().to_owned()));
        let mut stack_idx = 0;
        let mut num_replaced = 0;
        for alignment in alignments.into_iter() {
            let start = alignment.start();
            while stack_idx < num_existing_items && stack_items[stack_idx].start() < start {
                stack_idx += 1;
            }
            if stack_idx != num_existing_items && alignment.id() == stack_items[stack_idx].id() {
                *stack_items[stack_idx] = alignment;
                num_replaced += 1;
            } else {
                updated_alignments.push(alignment)?;
            }
        }
        log::debug!(
            "Replaced {} alignments with duplicate IDs from stack {}",
            num_replaced,
            self.id
        );
        Ok(updated_alignments)
    }

    /// Update the stack with a list of alignments from a new genomic region.
    pub fn update<A: Into<AlignmentSearchList<T, SortStart>>>(
        &mut self,
        alignments: A,
        updated_region: &GenomicRegion,
    ) -> Result<()> {
        self.buffered_region = updated_region.to_owned();
        self.trim();
        let novel_alignments = self.replace_duplicates(alignments.into())?;
        self.extend_stack(novel_alignments)?;
        Ok(())
    }

    /// Remove all alignments from the stack.
    ///
    /// This is intended for cases where the user loads a region which is too large to render in the
    /// UI.
    pub fn clear(&mut self, updated_region: &GenomicRegion) {
        self.buffered_region = updated_region.to_owned();
        self.rows.clear();
    }

    /// Right-extend rows with new alignments.
    fn extend_stack_right(&mut self, new_alignments: &mut AlignmentSearchList<T, SortStart>) {
        let mut row_idx = 0;
        let mut num_added = 0;
        while row_idx < self.rows.len() {
            let mut min_start = 0;
            if row_idx < self.rows.len() && self.rows[row_idx].len() > 0 {
                // Pad reads slightly so that adjacent reads don't appear merged in the UI
                let row_length = self.rows[row_idx].len();
                min_start = self.rows[row_idx][row_length - 1].end() + PADDING;
            }
            loop {
                match new_alignments.pop_after(min_start) {
                    Some(next_alignment) => {
                        min_start = next_alignment.end() + PADDING;
                        self.rows[row_idx].push_back(next_alignment);
                        num_added += 1;
                    }
                    None => break,
                }
            }
            row_idx += 1;
        }
        log::debug!("Extended right of stack {} with {} alignments", self.id, num_added,);
    }

    /// Left-extend rows with new alignments and add new rows to fit the remaining alignments.
    fn extend_stack_left(&mut self, new_alignments: &mut AlignmentSearchList<T, SortEnd>) {
        let mut row_idx = 0;
        let mut num_added = 0;
        while !new_alignments.is_empty() {
            let mut max_end: u64;
            if self.rows.len() <= row_idx {
                self.rows.push(VecDeque::new());
                max_end = u64::MAX;
            } else {
                // Pad reads slightly so that adjacent reads don't appear merged in the UI
                max_end = self.rows[row_idx][0].start().saturating_sub(PADDING);
            }
            while let Some(next_alignment) = new_alignments.pop_before(max_end) {
                max_end = next_alignment.start().saturating_sub(PADDING);
                self.rows[row_idx].push_front(next_alignment);
                num_added += 1;
            }
            row_idx += 1;
        }
        log::debug!("Extended left of stack {} with {} alignments", self.id, num_added,);
    }

    /// Extend rows to the left and right and add new rows to fit the remaining alignments.
    pub fn extend_stack(
        &mut self,
        new_alignments: AlignmentSearchList<T, SortStart>,
    ) -> Result<()> {
        let mut new_alignments = new_alignments;
        self.extend_stack_right(&mut new_alignments);
        let mut end_sorted = new_alignments.sort_by_end();
        self.extend_stack_left(&mut end_sorted);
        Ok(())
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
    pub fn test_update_fresh_stack() {
        let alignments = vec![
            FakeAlignment { id: "0".to_owned(), interval: (0, 10).try_into().unwrap() },
            FakeAlignment { id: "1".to_owned(), interval: (1, 11).try_into().unwrap() },
            FakeAlignment { id: "2".to_owned(), interval: (2, 12).try_into().unwrap() },
            FakeAlignment { id: "3".to_owned(), interval: (10, 20).try_into().unwrap() },
            FakeAlignment { id: "4".to_owned(), interval: (11, 22).try_into().unwrap() },
        ];
        let region = GenomicRegion::new("X", 0, 25).unwrap();

        let expected_stack = vec![
            vec![alignments[0].clone(), alignments[4].clone()],
            vec![alignments[3].clone()],
            vec![alignments[2].clone()],
            vec![alignments[1].clone()],
        ];

        let init_region = GenomicRegion::new("X", 0, 1000).unwrap();
        let mut stack = AlignmentStack::new(init_region);
        stack.update(alignments, &region).unwrap();
        assert_eq!(stack.rows, expected_stack);
        assert_eq!(stack.buffered_region, region);
    }

    #[test]
    pub fn test_update_existing_stack_with_larger_interval() {
        let alignments1 = vec![
            FakeAlignment { id: "2".to_owned(), interval: (2, 12).try_into().unwrap() },
            FakeAlignment { id: "3".to_owned(), interval: (10, 20).try_into().unwrap() },
            FakeAlignment { id: "4".to_owned(), interval: (11, 22).try_into().unwrap() },
        ];
        let alignments2 = vec![
            FakeAlignment { id: "0".to_owned(), interval: (0, 10).try_into().unwrap() },
            FakeAlignment { id: "1".to_owned(), interval: (1, 11).try_into().unwrap() },
            FakeAlignment { id: "5".to_owned(), interval: (13, 24).try_into().unwrap() },
            FakeAlignment { id: "6".to_owned(), interval: (24, 30).try_into().unwrap() },
        ];
        let expected_stack = vec![
            vec![alignments2[0].clone(), alignments1[2].clone(), alignments2[3].clone()],
            vec![alignments1[1].clone()],
            vec![alignments1[0].clone(), alignments2[2].clone()],
            vec![alignments2[1].clone()],
        ];
        let region1 = GenomicRegion::new("X", 0, 25).unwrap();
        let region2 = GenomicRegion::new("X", 0, 30).unwrap();

        let init_region = GenomicRegion::new("X", 0, 1000).unwrap();
        let mut stack = AlignmentStack::new(init_region);
        stack.update(alignments1, &region1).unwrap();
        stack.update(alignments2, &region2).unwrap();

        assert_eq!(stack.rows, expected_stack);
    }

    #[test]
    pub fn test_update_existing_stack_with_partially_overlapping_interval() {
        let alignments1 = vec![
            FakeAlignment { id: "2".to_owned(), interval: (2, 12).try_into().unwrap() },
            FakeAlignment { id: "3".to_owned(), interval: (10, 20).try_into().unwrap() },
            FakeAlignment { id: "4".to_owned(), interval: (11, 22).try_into().unwrap() },
        ];
        let alignments2 = vec![
            FakeAlignment { id: "5".to_owned(), interval: (13, 24).try_into().unwrap() },
            FakeAlignment { id: "6".to_owned(), interval: (24, 30).try_into().unwrap() },
        ];
        let expected_stack = vec![
            vec![alignments1[2].clone(), alignments2[1].clone()],
            vec![alignments1[1].clone()],
            vec![alignments2[0].clone()],
        ];
        let region1 = GenomicRegion::new("X", 0, 25).unwrap();
        let region2 = GenomicRegion::new("X", 13, 30).unwrap();

        let init_region = GenomicRegion::new("X", 0, 1000).unwrap();
        let mut stack = AlignmentStack::new(init_region);
        stack.update(alignments1, &region1).unwrap();
        stack.update(alignments2, &region2).unwrap();

        assert_eq!(stack.rows, expected_stack);
    }

    #[test]
    pub fn test_update_stack_with_duplicate_ids() {
        let alignments1 = vec![
            FakeAlignment { id: "2".to_owned(), interval: (2, 12).try_into().unwrap() },
            FakeAlignment { id: "3".to_owned(), interval: (15, 25).try_into().unwrap() },
        ];
        let alignments2 = vec![
            FakeAlignment { id: "2".to_owned(), interval: (0, 12).try_into().unwrap() },
            FakeAlignment { id: "3".to_owned(), interval: (15, 25).try_into().unwrap() },
            FakeAlignment { id: "4".to_owned(), interval: (24, 30).try_into().unwrap() },
        ];
        let expected_stack = vec![
            vec![alignments2[0].clone(), alignments1[1].clone()],
            vec![alignments2[2].clone()],
        ];
        let region1 = GenomicRegion::new("X", 0, 25).unwrap();
        let region2 = GenomicRegion::new("X", 0, 30).unwrap();

        let init_region = GenomicRegion::new("X", 0, 1000).unwrap();
        let mut stack = AlignmentStack::new(init_region);
        stack.update(alignments1, &region1).unwrap();
        stack.update(alignments2, &region2).unwrap();

        assert_eq!(stack.rows, expected_stack);
    }

    #[test]
    pub fn test_clear_stack() {
        let alignments = vec![
            FakeAlignment { id: "0".to_owned(), interval: (0, 10).try_into().unwrap() },
            FakeAlignment { id: "1".to_owned(), interval: (1, 11).try_into().unwrap() },
            FakeAlignment { id: "2".to_owned(), interval: (2, 12).try_into().unwrap() },
            FakeAlignment { id: "3".to_owned(), interval: (10, 20).try_into().unwrap() },
            FakeAlignment { id: "4".to_owned(), interval: (11, 22).try_into().unwrap() },
        ];
        let region = GenomicRegion::new("X", 0, 25).unwrap();

        let init_region = GenomicRegion::new("X", 0, 1000).unwrap();
        let mut stack = AlignmentStack::new(init_region);
        stack.update(alignments, &region).unwrap();
        let region2 = GenomicRegion::new("X", 40, 100).unwrap();
        stack.clear(&region2);
        let expected_stack: Vec<VecDeque<FakeAlignment>> = Vec::new();
        assert_eq!(stack.rows, expected_stack);
        assert_eq!(stack.buffered_region, region2);
    }

    #[test]
    pub fn test_update_stack_with_empty_input() {
        let alignments: Vec<FakeAlignment> = Vec::new();

        let init_region = GenomicRegion::new("X", 0, 1000).unwrap();
        let mut stack = AlignmentStack::new(init_region);
        let region = GenomicRegion::new("X", 0, 25).unwrap();
        stack.update(alignments, &region).unwrap();
        let expected_result: Vec<VecDeque<FakeAlignment>> = Vec::new();
        assert_eq!(stack.rows, expected_result);
    }
}
