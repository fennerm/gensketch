use anyhow::Result;
use parking_lot::RwLock;

use crate::interface::split_grid::SplitGrid;
use crate::interface::user_config::{read_user_config, UserConfig};

#[derive(Debug)]
pub struct Backend {
    pub split_grid: RwLock<SplitGrid>,
    pub user_config: RwLock<UserConfig>,
}

impl Backend {
    pub fn new() -> Result<Self> {
        let user_config = RwLock::new(read_user_config()?);
        let max_render_window = user_config.read().general.max_render_window;
        let split_grid = RwLock::new(SplitGrid::new(max_render_window)?);
        Ok(Self { user_config, split_grid })
    }
}
