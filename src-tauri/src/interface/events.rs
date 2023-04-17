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
    RegionPanned,
    RegionZoomed,
    RegionBuffering,
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
            Event::RegionZoomed => write!(f, "region-zoomed"),
            Event::RegionPanned => write!(f, "region-panned"),
            Event::RegionBuffering => write!(f, "region-buffering"),
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

pub trait EmitEvent {
    fn emit<S: Serialize + Clone>(&self, event: Event, payload: S) -> Result<()>;
}

pub struct EventEmitter<'a> {
    app: &'a AppHandle,
}

impl<'a> EventEmitter<'a> {
    pub fn new(app: &'a AppHandle) -> Self {
        Self { app }
    }
}

impl<'a> EmitEvent for EventEmitter<'a> {
    fn emit<S: Serialize + Clone>(&self, event: Event, payload: S) -> Result<()> {
        let event_name = event.to_string();
        self.app.emit_all(&event_name, &payload)?;
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
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusedRegionUpdatedPayload<'a> {
    pub split_id: &'a SplitId,
    pub genomic_region: &'a GenomicRegion,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionBufferingPayload<'a> {
    pub split_id: &'a SplitId,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlignmentsUpdatedPayload<'a> {
    pub split_id: &'a SplitId,
    pub track_id: &'a TrackId,
    pub focused_region: &'a GenomicRegion,
    pub alignments: &'a AlignmentStackKind,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusedSequenceUpdatedPayload<'a> {
    pub split_id: &'a SplitId,
    pub focused_region: &'a GenomicRegion,
    pub buffered_region: &'a GenomicRegion,
    pub focused_sequence: &'a Option<String>,
    pub buffered_sequence: &'a Option<String>,
}
