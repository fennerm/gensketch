use anyhow::{Context, Result};
use serde::Serialize;
use ts_rs::TS;
use uuid::Uuid;

use crate::bio_util::genomic_coordinates::GenomicRegion;

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename = "SplitData")]
#[ts(export)]
pub struct Split {
    pub id: Uuid,
    pub focused_region: Option<GenomicRegion>,
}

impl Split {
    pub fn new(focused_region: Option<GenomicRegion>) -> Result<Self> {
        Ok(Self { focused_region, id: Uuid::new_v4() })
    }
}

#[derive(Debug, Serialize, TS)]
#[ts(rename = "SplitListData")]
#[ts(export)]
pub struct SplitList {
    pub splits: Vec<Split>,
}

impl SplitList {
    pub fn new() -> Self {
        Self { splits: Vec::new() }
    }

    pub fn add_split(&mut self, focused_region: Option<GenomicRegion>) -> Result<&Split> {
        let split = Split::new(focused_region)?;
        self.splits.push(split);
        Ok(&self.splits.last().unwrap())
    }

    pub fn get_split(&mut self, split_id: Uuid) -> Result<&mut Split> {
        Ok(self
            .splits
            .iter_mut()
            .find(|split| split.id == split_id)
            .context(format!("Split {} doesn't exist", split_id.to_string()))?)
    }
}
