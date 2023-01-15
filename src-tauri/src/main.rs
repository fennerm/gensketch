#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod alignment;
mod bio_util;
mod errors;
mod file_formats;
mod interface;
mod util;

use anyhow::Result;
// Removing until stable release on crates.io
// use tauri_plugin_log::{LogTarget, LoggerBuilder};

use crate::interface::backend::Backend;
use crate::interface::commands::{
    add_alignment_track, add_split, default_reference, get_alignments, get_reference_sequence,
    update_focused_region,
};

fn main() -> Result<()> {
    tauri::Builder::default()
        // .plugin(
        //     LoggerBuilder::new()
        //         .targets([LogTarget::LogDir, LogTarget::Stdout, LogTarget::Webview])
        //         .build(),
        // )
        .manage(Backend::new()?)
        .invoke_handler(tauri::generate_handler![
            add_alignment_track,
            add_split,
            default_reference,
            get_alignments,
            get_reference_sequence,
            update_focused_region
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    Ok(())
}
