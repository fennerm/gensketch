#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use anyhow::Result;
use tauri_plugin_log::{LogTarget, LoggerBuilder};

use gensketch_lib::interface::backend::Backend;
// TODO Figure out why I need to import these __cmd__ functions manually. This started happening
// when I switched from a binary to a library crate.
use gensketch_lib::interface::commands::{
    __cmd__add_alignment_track, __cmd__add_split, __cmd__get_alignments, __cmd__get_focused_region,
    __cmd__get_focused_sequence, __cmd__get_reference_sequence, __cmd__get_splits,
    __cmd__get_user_config, __cmd__initialize, __cmd__update_focused_region,
};
use gensketch_lib::interface::commands::{
    add_alignment_track, add_split, get_alignments, get_focused_region, get_focused_sequence,
    get_reference_sequence, get_splits, get_user_config, initialize, update_focused_region,
};

fn main() -> Result<()> {
    tauri::Builder::default()
        .plugin(
            LoggerBuilder::new()
                .targets([LogTarget::LogDir, LogTarget::Stdout, LogTarget::Webview])
                .build(),
        )
        .manage(Backend::new()?)
        .invoke_handler(tauri::generate_handler![
            add_alignment_track,
            add_split,
            get_alignments,
            get_focused_region,
            get_focused_sequence,
            get_reference_sequence,
            get_splits,
            get_user_config,
            initialize,
            update_focused_region
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    Ok(())
}
