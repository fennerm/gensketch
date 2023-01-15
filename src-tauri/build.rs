use std::path::PathBuf;
use std::{env, fs};

fn main() {
    tauri_build::build();
    if let Some(manifest_dir) = env::var_os("CARGO_MANIFEST_DIR") {
        let mut bindings_path = PathBuf::from(&manifest_dir);
        bindings_path.push("bindings");
        let mut output_bindings_path = PathBuf::from(manifest_dir);
        output_bindings_path.pop();
        output_bindings_path.push("frontend/bindings");
        fs::rename(bindings_path, output_bindings_path).unwrap();
    };
}
