use anyhow::Result;
use parking_lot::RwLock;

use crate::interface::events::{EmitEvent, Event};
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

    pub fn initialize<E: EmitEvent>(&self, event_emitter: &E) -> Result<()> {
        log::info!("Initializing backend");
        let max_render_window = self.user_config.read().general.max_render_window;
        *self.split_grid.write() = SplitGrid::new(max_render_window)?;
        event_emitter.emit(Event::UserConfigUpdated, &*self.user_config.read())?;
        // let mut refseq = state.reference_sequence.write();
        // *refseq = get_default_reference()?;
        // let mut splits = state.splits.write();
        // *splits = SplitList::new();
        // let mut tracks = state.tracks.write();
        // *tracks = TrackList::new();
        // let mut alignments = state.alignments.write();
        // *alignments = AlignmentsManager::new();
        // drop(splits);
        // drop(tracks);
        // emit_event(&app, Event::RefSeqFileUpdated, &*refseq)?;
        // drop(refseq);
        // emit_event(&app, Event::SplitGridCleared, {})?;
        log::info!("Backend initialization complete");
        Ok(())
    }
}
