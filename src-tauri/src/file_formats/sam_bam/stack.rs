use std::collections::HashMap;
use std::rc::Rc;

use anyhow::{Context, Result};

use crate::alignment::Alignment;
use crate::bio_util::genomic_coordinates::GenomicInterval;
use crate::file_formats::sam_bam::aligned_read::AlignedPair;

struct AlignmentNode<T> {
    pos: u64,
    alignment: Rc<T>,
}

impl<T: Alignment> AlignmentNode<T> {
    fn new(alignment: &T) -> Self {
        Self { alignment: Rc::new(*alignment), pos: alignment.interval().start }
    }
}

fn construct_treap_by_start_pos<T: Alignment>(alignments: &Vec<T>) -> TreapMap<u64, Rc<T>> {
    alignments.iter().map(|alignment| (alignment.interval().start, Rc::new(alignment))).into()
}

/// Given a key in a TreapMap find the closest value which has key >= the input key and pop it from
/// the tree.
fn pop_next_pos<T, U>(treap: &TreapMap<U, Rc<T>>, key: &U) -> Option<Rc<T>> {
    match treap.ceil(key) {
        Some(next_pos) => {
            Some(treap.remove(next_pos).context("Ceil is missing from treap (BUG)")?.1)
        }
        None => None,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignmentStack<T> {
    #[serde(skip_serializing)]
    alignments: Vec<T>,

    #[serde(skip_serializing)]
    region: GenomicInterval,

    pub rows: Vec<Vec<Rc<T>>>,
}

impl<T: Alignment> AlignmentStack<T> {
    pub fn new(alignments: Vec<T>, region: GenomicInterval) -> Self {
        Self { alignments, rows: Vec::new(), region }
    }

    pub fn stack_by_start_pos(&mut self) -> Result<()> {
        if self.alignments.len() == 0 {
            return;
        }
        let nodes = self.alignments.iter().map(|alignment| AlignmentNode::new(alignment));
        let mut treap = construct_treap_by_start_pos(&self.alignments);

        while !treap.is_empty() {
            let mut current_pos =
                *treap.min().context("Attempted to take min of empty alignment treap (BUG)")?;
            let mut row = Vec::new();
            loop {
                match pop_next_pos(&treap, &current_pos) {
                    Some(next_alignment) => {
                        current_pos = next_alignment.interval().end;
                        row.push(next_alignment);
                    }
                    None => break,
                }
            }
            if !row.is_empty() {
                self.rows.push(row);
            }
        }
        Ok(())
    }
}
