use std::fmt;

use anyhow::Result;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::file_formats::enums::AlignmentStackKind;
use crate::interface::split::SplitId;
use crate::interface::track::TrackId;

// Truncate events to this length when logging
const MAX_LOGGED_EVENT_LEN: usize = 1000;

pub enum Event {
    AlignmentsUpdated,
    AlignmentsUpdateQueued,
    AlignmentsPanned,
    AlignmentsZoomed,
    AlignmentsCleared,
    FocusedRegionUpdated,
    FocusedSequenceUpdated,
    RefSeqFileUpdated,
    SplitAdded,
    SplitGridCleared,
    TrackAdded,
    UserConfigUpdated,
}

impl fmt::Display for Event {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Event::AlignmentsUpdated => write!(f, "alignments-updated"),
            Event::AlignmentsUpdateQueued => write!(f, "alignments-update-queued"),
            Event::AlignmentsZoomed => write!(f, "alignments-zoomed"),
            Event::AlignmentsPanned => write!(f, "alignments-panned"),
            Event::AlignmentsCleared => write!(f, "alignments-cleared"),
            Event::FocusedRegionUpdated => write!(f, "focused-region-updated"),
            Event::FocusedSequenceUpdated => write!(f, "focused-sequence-updated"),
            Event::RefSeqFileUpdated => write!(f, "ref-seq-file-updated"),
            Event::SplitAdded => write!(f, "split-added"),
            Event::SplitGridCleared => write!(f, "split-grid-cleared"),
            Event::TrackAdded => write!(f, "track-added"),
            Event::UserConfigUpdated => write!(f, "user-config-updated"),
        }
    }
}

pub fn emit_event<S: Serialize + Clone>(app: &AppHandle, event: Event, payload: S) -> Result<()> {
    let event_name = event.to_string();
    app.emit_all(&event_name, &payload)?;
    if cfg!(debug_assertions) {
        let mut json = serde_json::to_string(&payload)?;
        if json.len() > MAX_LOGGED_EVENT_LEN {
            json.truncate(MAX_LOGGED_EVENT_LEN);
            json.push_str("...");
        }
        log::debug!("{} event {}", &event_name, json);
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusedRegionUpdatedPayload {
    pub split_id: SplitId,
    pub genomic_region: GenomicRegion,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignmentsClearedPayload {
    pub split_id: SplitId,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignmentsUpdatedPayload<'a> {
    pub split_id: SplitId,
    pub track_id: TrackId,
    pub focused_region: GenomicRegion,
    pub alignments: &'a AlignmentStackKind,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusedSequenceUpdatedPayload {
    pub split_id: SplitId,
    pub sequence: Option<String>,
}
