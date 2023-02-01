use std::sync::Arc;

use anyhow::Result;
use serde::Serialize;

use crate::bio_util::alignment::Alignment;

struct AlignmentNode<T> {
    pos: u64,
    alignment: Arc<T>,
}

impl<T: Alignment> AlignmentNode<T> {
    fn new(alignment: &Arc<T>) -> Self {
        Self { alignment: Arc::clone(alignment), pos: alignment.interval().start }
    }
}

/// Binary search for the next alignment and pop it.
///
/// # Arguments
///
/// * `alignments` - The list of alignments which are being stacked.
/// * `min_pos` - The alignment with the closest start position after this position will be popped.
fn pop_next_alignment<'a, T: Alignment>(
    alignments: &'a mut Vec<AlignmentNode<T>>,
    min_pos: u64,
) -> Option<Arc<T>> {
    let maybe_last = alignments.last();
    if maybe_last.is_none() {
        return None;
    } else if let Some(last_alignment) = maybe_last {
        if last_alignment.pos < min_pos {
            return None;
        }
    }
    let mut low = 0;
    let mut high = alignments.len();
    let mut mid;
    while low != high {
        mid = (low + high) / 2;
        if alignments[mid].pos < min_pos {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    Some(alignments.remove(low).alignment)
}

/// Alignments packed into rows for rendering in the GUI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignmentStack<T> {
    #[serde(skip_serializing)]
    alignments: Vec<Arc<T>>,
    pub rows: Vec<Vec<Arc<T>>>,
}

impl<T: Alignment> AlignmentStack<T> {
    pub fn new(alignments: Vec<T>) -> Self {
        let mut alignments: Vec<Arc<T>> = alignments.into_iter().map(|x| Arc::new(x)).collect();
        alignments.sort_by(|a, b| a.interval().start.cmp(&b.interval().start));
        Self { alignments, rows: Vec::new() }
    }

    pub fn len(&self) -> usize {
        return self.alignments.len();
    }

    pub fn stack_by_start_pos(&mut self) -> Result<()> {
        if self.alignments.len() == 0 {
            return Ok(());
        }
        let mut nodes: Vec<_> =
            self.alignments.iter().map(|alignment| AlignmentNode::new(alignment)).collect();

        while !nodes.is_empty() {
            let mut current_pos = nodes[0].pos;
            let mut row = Vec::new();
            loop {
                match pop_next_alignment(&mut nodes, current_pos) {
                    Some(next_alignment) => {
                        // We force reads to have at least 1bp between them so that adjacent reads
                        // don't appear merged in the UI
                        current_pos = next_alignment.interval().end + 1;
                        row.push(next_alignment);
                    }
                    None => break,
                }
            }
            self.rows.push(row);
        }
        Ok(())
    }
}

impl<T: Alignment> Default for AlignmentStack<T> {
    fn default() -> Self {
        return AlignmentStack::new(Vec::new());
    }
}

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
            FakeAlignment { id: 0, interval: (0, 10).into() },
            FakeAlignment { id: 1, interval: (1, 11).into() },
            FakeAlignment { id: 2, interval: (2, 12).into() },
            FakeAlignment { id: 3, interval: (10, 20).into() },
            FakeAlignment { id: 4, interval: (11, 22).into() },
        ];

        let expected_stack = vec![
            vec![Arc::new(alignments[0].clone()), Arc::new(alignments[4].clone())],
            vec![Arc::new(alignments[1].clone())],
            vec![Arc::new(alignments[2].clone())],
            vec![Arc::new(alignments[3].clone())],
        ];

        let mut stack = AlignmentStack::new(alignments);
        stack.stack_by_start_pos().unwrap();
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
