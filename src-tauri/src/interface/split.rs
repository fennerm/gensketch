use std::path::PathBuf;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;
use crate::file_formats::fasta::reader::FastaReader;
use crate::impl_wrapped_uuid;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct SplitId(Uuid);
impl_wrapped_uuid!(SplitId);

/// BUFFER_SIZE * focused_region.length() will be buffered on either side of the focused region
/// This is so that the user can scroll the focused region left or right without needing to refresh
/// the entire alignment stack.
const BUFFER_SIZE: u64 = 1;

const REFRESH_FRACTION: u64 = 2;

#[derive(Debug)]
pub enum BoundState {
    OutsideBuffered,
    OutsideRefreshBound,
    WithinRefreshBound,
    OutsideRenderRange,
}

fn map_seqview_to_string(opt_seqview: &Option<SequenceView>) -> Result<Option<String>> {
    opt_seqview.as_ref().map(|sv| sv.to_string()).transpose()
}

/// Get the region around the focused region which should be buffered.
///
/// # Arguments
///
/// * `focused_region` - Focused genomic region.
/// * `seq_length` - The length of the focused contig/chromosome (i.e the max possible end position
///     for a genomic region on that contig/chromosome).
pub fn get_buffered_region(
    focused_region: &GenomicRegion,
    seq_length: u64,
) -> Result<GenomicRegion> {
    let mut expanded = focused_region.expand(BUFFER_SIZE * focused_region.len())?;
    if expanded.interval.end > seq_length {
        expanded.interval.end = seq_length;
    }
    Ok(expanded)
}

pub fn get_refresh_bound_region(
    focused_region: &GenomicRegion,
    seq_length: u64,
) -> Result<GenomicRegion> {
    let mut expanded =
        focused_region.expand(focused_region.len() * BUFFER_SIZE / REFRESH_FRACTION)?;
    if expanded.interval.end > seq_length {
        expanded.interval.end = seq_length;
    }
    Ok(expanded)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Split {
    pub id: SplitId,
    pub focused_region: GenomicRegion,
    pub buffered_region: GenomicRegion,
    pub refresh_bound_region: GenomicRegion,
    #[serde(skip_serializing)]
    pub max_render_window: u64,
    #[serde(skip_serializing)]
    pub buffered_sequence: Option<SequenceView>,
    #[serde(skip_serializing)]
    ref_seq_reader: FastaReader,
}

impl Split {
    pub fn new<P: Into<PathBuf>>(
        reference_path: P,
        focused_region: GenomicRegion,
        max_render_window: u64,
        // TODO seq_length should be fetched cached in ref_seq_reader
        seq_length: u64,
    ) -> Result<Self> {
        let mut ref_seq_reader = FastaReader::new(reference_path)?;
        let mut buffered_sequence = None;
        if focused_region.len() <= max_render_window {
            buffered_sequence = Some(ref_seq_reader.read(&focused_region)?);
        }
        let buffered_region = get_buffered_region(&focused_region, seq_length)?;
        let refresh_bound_region = get_refresh_bound_region(&focused_region, seq_length)?;

        Ok(Self {
            id: SplitId::new(),
            focused_region,
            buffered_region,
            buffered_sequence,
            refresh_bound_region,
            max_render_window,
            ref_seq_reader,
        })
    }

    pub fn focused_sequence(&self) -> Result<Option<SequenceView>> {
        let seq = self
            .buffered_sequence
            .as_ref()
            .map(|seqview| {
                seqview.subseq(self.focused_region.interval.start, self.focused_region.interval.end)
            })
            .transpose()?;
        Ok(seq)
    }

    pub fn focused_sequence_as_string(&self) -> Result<Option<String>> {
        map_seqview_to_string(&self.focused_sequence()?)
    }

    pub fn buffered_sequence_as_string(&self) -> Result<Option<String>> {
        map_seqview_to_string(&self.buffered_sequence)
    }

    pub fn set_max_render_window(&mut self, max_render_window: u64) -> Result<()> {
        match self.buffered_sequence {
            Some(_) => {
                if self.focused_region.len() > max_render_window {
                    self.buffered_sequence = None;
                }
            }
            None => {
                if self.focused_region.len() <= max_render_window {
                    self.buffered_sequence = Some(self.ref_seq_reader.read(&self.buffered_region)?);
                }
            }
        };
        self.max_render_window = max_render_window;
        Ok(())
    }

    pub fn check_bounds(&self, region: &GenomicRegion) -> BoundState {
        if region.len() > self.max_render_window {
            BoundState::OutsideRenderRange
        } else if region.seq_name != self.buffered_region.seq_name
            || region.start() < self.buffered_region.start()
            || region.end() > self.buffered_region.end()
            || self.buffered_region.len() > self.max_render_window
        {
            BoundState::OutsideBuffered
        } else if region.start() < self.refresh_bound_region.start()
            || region.end() > self.refresh_bound_region.end()
        {
            BoundState::OutsideRefreshBound
        } else {
            BoundState::WithinRefreshBound
        }
    }

    /// Set the focused region of a split.
    ///
    /// # Arguments
    ///
    /// * `focused_region` - Focused genomic region.
    /// * `seq_length` - The length of the focused contig/chromosome (i.e the max possible end
    ///     position for a genomic region on that contig/chromosome).
    pub fn set_focused_region(
        &mut self,
        focused_region: GenomicRegion,
        // TODO seq_length should be fetched cached in ref_seq_reader
        seq_length: u64,
    ) -> Result<()> {
        let buffered_region = get_buffered_region(&focused_region, seq_length)?;
        let refresh_bound_region = get_refresh_bound_region(&focused_region, seq_length)?;
        match self.check_bounds(&focused_region) {
            // TODO For now we just always update the buffered sequence when the focused region is
            // updated. Need to benchmark this and see if its worth queuing the update like we do
            // for alignments. Downside is that the split would temporarily have its buffered
            // sequence out of sync with its buffered region.
            BoundState::OutsideBuffered
            | BoundState::OutsideRefreshBound
            | BoundState::WithinRefreshBound => {
                self.buffered_sequence = Some(self.ref_seq_reader.read(&buffered_region)?);
            }
            BoundState::OutsideRenderRange => self.buffered_sequence = None,
        }
        self.buffered_region = buffered_region;
        self.refresh_bound_region = refresh_bound_region;
        self.focused_region = focused_region;
        Ok(())
    }
}
