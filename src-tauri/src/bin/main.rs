#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use anyhow::Result;
use tauri_plugin_log::fern::colors::{Color, ColoredLevelConfig};
use tauri_plugin_log::LogTarget;

use gensketch_lib::interface::backend::Backend;
// TODO Figure out why I need to import these __cmd__ functions manually. This started happening
// when I switched from a binary to a library crate.
use gensketch_lib::interface::commands::{
    __cmd__add_alignment_track, __cmd__add_split, __cmd__get_alignments, __cmd__get_focused_region,
    __cmd__get_focused_sequence, __cmd__get_grid_focus, __cmd__get_reference_sequence,
    __cmd__get_splits, __cmd__get_user_config, __cmd__initialize, __cmd__pan_focused_split,
    __cmd__update_focused_region, __cmd__update_grid_focus,
};
use gensketch_lib::interface::commands::{
    add_alignment_track, add_split, get_alignments, get_focused_region, get_focused_sequence,
    get_grid_focus, get_reference_sequence, get_splits, get_user_config, initialize,
    pan_focused_split, update_focused_region, update_grid_focus,
};

#[cfg(debug_assertions)]
fn spawn_deadlock_detection_thread() {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(10));
        let deadlocks = parking_lot::deadlock::check_deadlock();
        if deadlocks.is_empty() {
            continue;
        }

        log::error!("{} deadlocks detected", deadlocks.len());
        for (i, threads) in deadlocks.iter().enumerate() {
            log::error!("Deadlock #{}", i);
            for t in threads {
                log::error!("Thread Id {:#?}", t.thread_id());
                log::error!("{:#?}", t.backtrace());
            }
        }
    });
}

fn main() -> Result<()> {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([LogTarget::LogDir, LogTarget::Stdout, LogTarget::Webview])
                .with_colors(ColoredLevelConfig {
                    error: Color::Red,
                    warn: Color::Yellow,
                    debug: Color::Green,
                    info: Color::Green,
                    trace: Color::Cyan,
                })
                .build(),
        )
        .manage(Backend::new()?)
        .invoke_handler(tauri::generate_handler![
            add_alignment_track,
            add_split,
            get_alignments,
            get_focused_region,
            get_focused_sequence,
            get_grid_focus,
            get_reference_sequence,
            get_splits,
            get_user_config,
            initialize,
            pan_focused_split,
            update_focused_region,
            update_grid_focus
        ])
        .setup(|_| {
            #[cfg(debug_assertions)]
            spawn_deadlock_detection_thread();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
    Ok(())
}
