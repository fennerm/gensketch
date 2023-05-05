use anyhow::Result;
use tauri::api::dialog::FileDialogBuilder;
use tauri::{AppHandle, CustomMenuItem, Manager, Menu, MenuItem, Submenu};

use crate::interface::backend::Backend;
use crate::interface::events::EventEmitter;

pub fn setup_system_menu() -> Result<Menu> {
    let open_file = CustomMenuItem::new("open_file".to_string(), "Open File");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let file_submenu = Submenu::new(
        "File",
        Menu::new().add_item(open_file).add_native_item(MenuItem::Separator).add_item(quit),
    );
    let menu = Menu::new().add_submenu(file_submenu);
    Ok(menu)
}

pub fn open_files(app: AppHandle) {
    FileDialogBuilder::new().pick_files(move |file_paths| {
        if let Some(file_paths) = file_paths {
            let event_emitter = EventEmitter::new(&app);
            let state: tauri::State<Backend> = app.state();
            for file_path in file_paths {
                let result = state.split_grid.read().add_track(&event_emitter, file_path.clone());
                if result.is_err() {
                    log::error!("Failed to add track from file: {}", file_path.to_string_lossy());
                }
            }
        }
    });
}
