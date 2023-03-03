use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::impl_wrapped_uuid;

// BUFFER_SIZE * focused_region.length() will be buffered on either side of the focused region
// This is so that the user can scroll the focused region left or right without needing to refresh
// the entire alignment stack.
const BUFFER_SIZE: u64 = 1;

const REFRESH_FRACTION: u64 = 2;

const MAX_RENDER_WINDOW: u64 = 20000;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct SplitId(Uuid);
impl_wrapped_uuid!(SplitId);

fn get_buffered_region(region: &GenomicRegion) -> Result<GenomicRegion> {
    Ok(region.expand(BUFFER_SIZE * region.len())?)
}

fn get_refresh_bound_region(
    focused_region: &GenomicRegion,
    buffered_region: &GenomicRegion,
) -> Result<GenomicRegion> {
    buffered_region.contract(focused_region.len() * BUFFER_SIZE / REFRESH_FRACTION)
}

pub enum BoundState {
    OutsideBuffered,
    OutsideRefreshBound,
    WithinRefreshBound,
    OutsideRenderRange,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Split {
    pub id: SplitId,
    focused_region: GenomicRegion,
    buffered_region: GenomicRegion,
    refresh_bound_region: GenomicRegion,
}

impl Split {
    pub fn new(focused_region: GenomicRegion) -> Result<Self> {
        let buffered_region = get_buffered_region(&focused_region)?;
        let refresh_bound_region = get_refresh_bound_region(&focused_region, &buffered_region)?;
        Ok(Self { focused_region, id: SplitId::new(), buffered_region, refresh_bound_region })
    }

    pub fn buffered_region(&self) -> &GenomicRegion {
        &self.buffered_region
    }

    pub fn focused_region(&self) -> &GenomicRegion {
        &self.focused_region
    }

    pub fn refresh_bound_region(&self) -> &GenomicRegion {
        &self.refresh_bound_region
    }

    pub fn check_bounds(&self, region: &GenomicRegion) -> BoundState {
        if region.len() > MAX_RENDER_WINDOW {
            BoundState::OutsideRenderRange
        } else if region.seq_name != self.buffered_region.seq_name
            || region.start() < self.buffered_region.start()
            || region.end() > self.buffered_region.end()
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

    pub fn set_focused_region(&mut self, focused_region: GenomicRegion) -> Result<()> {
        self.buffered_region = get_buffered_region(&focused_region)?;
        self.refresh_bound_region =
            get_refresh_bound_region(&focused_region, &self.buffered_region)?;
        self.focused_region = focused_region;
        Ok(())
    }
}

#[derive(Debug, Serialize)]
pub struct SplitList {
    pub inner: Vec<Split>,
}

impl SplitList {
    pub fn new() -> Self {
        Self { inner: Vec::new() }
    }

    pub fn add_split(&mut self, focused_region: GenomicRegion) -> Result<&Split> {
        let split = Split::new(focused_region)?;
        self.inner.push(split);
        Ok(&self.inner.last().unwrap())
    }

    pub fn get_split(&mut self, split_id: SplitId) -> Result<&mut Split> {
        Ok(self
            .inner
            .iter_mut()
            .find(|split| *split.id == *split_id)
            .context(format!("Split {} doesn't exist", split_id.to_string()))?)
    }
}
