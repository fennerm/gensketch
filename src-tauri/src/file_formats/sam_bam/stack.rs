use std::rc::Rc;

use anyhow::Result;
use serde::Serialize;
use ts_rs::TS;

use crate::alignment::Alignment;

struct AlignmentNode<T> {
    pos: u64,
    alignment: Rc<T>,
}

impl<T: Alignment> AlignmentNode<T> {
    fn new(alignment: &Rc<T>) -> Self {
        Self { alignment: Rc::clone(alignment), pos: alignment.interval().start }
    }
}

fn pop_next_alignment<'a, T: Alignment>(
    alignments: &'a mut Vec<AlignmentNode<T>>,
    min_pos: u64,
) -> Option<Rc<T>> {
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
        mid = low + high / 2;
        if alignments[mid].pos < min_pos {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    Some(alignments.remove(low).alignment)
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename = "AlignmentStackData")]
#[ts(export)]
pub struct AlignmentStack<T> {
    #[serde(skip_serializing)]
    alignments: Vec<Rc<T>>,
    pub rows: Vec<Vec<Rc<T>>>,
}

impl<T: Alignment> AlignmentStack<T> {
    pub fn new(alignments: Vec<T>) -> Self {
        let mut alignments: Vec<Rc<T>> = alignments.into_iter().map(|x| Rc::new(x)).collect();
        alignments.sort_by(|a, b| b.interval().start.cmp(&a.interval().start));
        Self { alignments, rows: Vec::new() }
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
                        current_pos = next_alignment.interval().end;
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
