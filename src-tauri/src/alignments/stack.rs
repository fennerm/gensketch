use std::collections::VecDeque;
use std::sync::Arc;

use anyhow::Result;
use parking_lot::RwLock;
use serde::Serialize;

use crate::alignments::alignment::Alignment;
use crate::bio_util::genomic_coordinates::GenomicRegion;
//
// struct AlignmentNode<T> {
//     pos: u64,
//     alignment: Arc<RwLock<T>>,
// }
//
// impl<T: Alignment> AlignmentNode<T> {
//     fn new(alignment: &Arc<RwLock<T>>) -> Self {
//         Self { alignment: Arc::clone(alignment), pos: alignment.read().start() }
//     }
// }

/// Binary search for the next alignment and pop it.
///
/// # Arguments
///
/// * `alignments` - The list of alignments which are being stacked.
/// * `min_pos` - The alignment with the closest start position after this position will be popped.
fn pop_by_start_pos<T: Alignment>(
    alignments: &mut Vec<Arc<RwLock<T>>>,
    min_start: u64,
) -> Option<Arc<RwLock<T>>> {
    let maybe_last = alignments.last();
    if maybe_last.is_none() {
        return None;
    } else if let Some(last_alignment) = maybe_last {
        if last_alignment.read().start() < min_start {
            return None;
        }
    }
    let mut low = 0;
    let mut high = alignments.len();
    let mut mid;
    while low != high {
        mid = (low + high) / 2;
        if alignments[mid].read().start() < min_start {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    Some(alignments.remove(low))
}

fn pop_by_end_pos<T: Alignment>(
    alignments: &mut Vec<Arc<RwLock<T>>>,
    max_end: u64,
) -> Option<Arc<RwLock<T>>> {
    let maybe_first = alignments.first();
    if maybe_first.is_none() {
        return None;
    } else if let Some(first_alignment) = maybe_first {
        if first_alignment.read().end() > max_end {
            return None;
        }
    }
    let mut low = 0;
    let mut high = alignments.len();
    let mut mid;
    while low != high {
        mid = (low + high) / 2;
        if alignments[mid].read().end() > max_end {
            high = mid - 1;
        } else {
            low = mid;
        }
    }
    Some(alignments.remove(low))
}

#[derive(Debug, Serialize)]
pub enum SortKind {
    StartPos,
}

/// Alignments packed into rows for rendering in the GUI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignmentStack<T> {
    #[serde(skip_serializing)]
    alignments: Vec<Arc<RwLock<T>>>,
    pub rows: Vec<VecDeque<Arc<RwLock<T>>>>,
    pub buffered_region: Option<GenomicRegion>,
}

impl<T: Alignment> AlignmentStack<T> {
    pub fn new() -> Self {
        Self { alignments: Vec::new(), rows: Vec::new(), buffered_region: None }
    }

    fn trim(&mut self) {
        if let Some(buffered_region) = self.buffered_region {
            self.rows.iter_mut().map(|row| {
                row.retain(|alignment| {
                    buffered_region.start <= alignment.read().end()
                        && buffered_region.end <= alignment.read().start()
                })
            });
        }
    }

    fn sort_alignments(&self, alignments: &mut Vec<Arc<RwLock<T>>>) {
        alignments.sort_by_key(|k| (k.read().start(), k.read().id()));
    }

    fn replace_duplicates(&mut self, alignments: Vec<Arc<RwLock<T>>>) -> Vec<Arc<RwLock<T>>> {
        let mut self_idx = 0;
        let mut updated_alignments = Vec::with_capacity(alignments.len());
        for alignment in alignments.into_iter() {
            let start = alignment.read().start();
            while self_idx < self.alignments.len()
                && self.alignments[self_idx].read().start() < start
            {
                self_idx += 1;
            }
            let mut self_alignment = self.alignments[self_idx].write();
            if alignment.read().id() == self_alignment.id() {
                *self_alignment = alignment.into_inner();
            } else {
                updated_alignments.push(alignment);
            }
        }
        updated_alignments
    }

    pub fn update(&mut self, alignments: Vec<T>, updated_region: &GenomicRegion) {
        self.buffered_region = Some(updated_region.to_owned());
        self.trim();
        let mut alignments: Vec<_> =
            alignments.into_iter().map(|x| Arc::new(RwLock::new(x))).collect();
        alignments.sort_by_key(|k| (k.read().start(), k.read().id()));
        let novel_alignments = self.replace_duplicates(alignments);
        self.extend_stack(novel_alignments);
    }

    pub fn clear(&mut self, updated_region: &GenomicRegion) {
        self.buffered_region = Some(updated_region.to_owned());
        self.alignments.clear();
        self.rows.clear();
    }

    pub fn len(&self) -> usize {
        return self.alignments.len();
    }

    fn extend_stack_right(&mut self, new_alignments: &mut Vec<Arc<RwLock<T>>>) {
        let mut row_idx = 0;
        while row_idx < self.rows.len() {
            let mut min_start = 0;
            if row_idx < self.rows.len() && self.rows[row_idx].len() > 0 {
                min_start = self.rows[row_idx][0].read().start();
            }
            loop {
                match pop_by_start_pos(&mut new_alignments, min_start) {
                    Some(next_alignment) => {
                        min_start = next_alignment.read().end();
                        self.alignments.push(next_alignment);
                        self.rows[row_idx].push_back(next_alignment);
                    }
                    None => break,
                }
            }
            row_idx += 1;
        }
    }

    fn extend_stack_left(&mut self, new_alignments: &mut Vec<Arc<RwLock<T>>>) {
        new_alignments.sort_by_key(|k| (k.read().end(), k.read().id()));
        let mut row_idx = 0;
        while !new_alignments.is_empty() {
            let mut row_idx = 0;
            let mut max_end = self.rows[row_idx][0].read().start();
            loop {
                match pop_by_end_pos(&mut new_alignments, max_end) {
                    Some(next_alignment) => {
                        max_end = next_alignment.read().start();
                        self.rows[row_idx].push_front(next_alignment);
                        self.alignments.push(next_alignment);
                    }
                    None => break,
                }
            }
            row_idx += 1;
            if self.rows.len() <= row_idx {
                self.rows.push(VecDeque::new());
            }
        }
    }

    pub fn extend_stack(&mut self, new_alignments: Vec<Arc<RwLock<T>>>) -> Result<()> {
        self.extend_stack_right(&mut new_alignments);
        self.extend_stack_left(&mut new_alignments);
        self.alignments.sort_by_key(|k| (k.read().start(), k.read().id()));
        Ok(())
    }

    //     pub fn stack_by_start_pos(&mut self) -> Result<()> {
    //         if self.alignments.len() == 0 {
    //             return Ok(());
    //         }
    //         let mut nodes: Vec<_> =
    //             self.alignments.iter().map(|alignment| AlignmentNode::new(alignment)).collect();
    //
    //         while !nodes.is_empty() {
    //             let mut current_pos = nodes[0].pos;
    //             let mut row = Vec::new();
    //             loop {
    //                 match pop_next_alignment(&mut nodes, current_pos) {
    //                     Some(next_alignment) => {
    //                         // We force reads to have at least 1bp between them so that adjacent reads
    //                         // don't appear merged in the UI
    //                         current_pos = next_alignment.read().end() + 1;
    //                         row.push(next_alignment);
    //                     }
    //                     None => break,
    //                 }
    //             }
    //             self.rows.push(row);
    //         }
    //         Ok(())
    //     }
}
//
// struct IterByStart<'a, T: 'a> {
//     inner: &'a AlignmentStack<T>,
//     idx_by_row: Vec<usize>,
//     start_by_row: Vec<Option<u64>>,
// }
//
// impl<'a, T> IterByStart<'a, T> {
//     pub fn new(inner: &'a AlignmentStack<T>) -> Self {
//         let idx_by_row = vec![0, inner.rows.len()];
//         let start_by_row: Vec<_> = inner.rows.iter().map(|r| r.get(0)).collect();
//         Self { inner, idx_by_row, start_by_row }
//     }
// }
//
// impl<'a, T> Iterator for IterByStart<'a, T> {
//     type Item = &'a T;
// }

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;
    use std::sync::Arc;

    use super::*;
    use crate::bio_util::genomic_coordinates::GenomicInterval;
    use crate::impl_alignment;

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct FakeAlignment {
        id: u32,
        interval: GenomicInterval,
    }

    impl_alignment!(FakeAlignment);

    #[test]
    pub fn test_stack_by_start_pos() {
        let alignments = vec![
            FakeAlignment { id: 0, interval: (0, 10).try_into().unwrap() },
            FakeAlignment { id: 1, interval: (1, 11).try_into().unwrap() },
            FakeAlignment { id: 2, interval: (2, 12).try_into().unwrap() },
            FakeAlignment { id: 3, interval: (10, 20).try_into().unwrap() },
            FakeAlignment { id: 4, interval: (11, 22).try_into().unwrap() },
        ];
        let region = GenomicRegion::new("X", 0, 25).unwrap();

        let expected_stack = vec![
            vec![alignments[0].clone(), alignments[4].clone()],
            vec![alignments[1].clone()],
            vec![alignments[2].clone()],
            vec![alignments[3].clone()],
        ];

        let mut stack = AlignmentStack::new();
        stack.update(alignments, &region);
        assert_eq!(stack.rows, expected_stack);
    }

    #[test]
    pub fn test_stack_by_start_pos_with_empty_input() {
        let alignments: Vec<FakeAlignment> = Vec::new();

        let mut stack = AlignmentStack::new(alignments);
        stack.stack_by_start_pos().unwrap();
        let expected_result: Vec<Vec<Arc<FakeAlignment>>> = Vec::new();
        assert_eq!(stack.rows, expected_result);
    }
}
