use std::env;
use std::path::{Path, PathBuf};

fn dir_contains(dir: &Path, filename: &str) -> bool {
    for entry in dir.read_dir().unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.file_name().unwrap() == filename {
            return true;
        }
    }
    false
}

// Slight hack
// This function and get_test_data_path are only really needed for benchmarks and tests but we're
// not conditionally compiling them because the benchmarks can only import public functions.
pub fn get_test_data_dir() -> PathBuf {
    let exe_path = env::current_exe().unwrap();
    let mut dir = exe_path.parent().unwrap().to_owned();

    let mut i = 0;
    while !dir_contains(&dir, "test_data") {
        dir.pop();
        i += 1;
        if i > 10 {
            panic!("Could not find test_data directory");
        }
    }
    dir.push("test_data");
    dir
}

pub fn get_test_data_path(filename: &str) -> PathBuf {
    let mut path = get_test_data_dir();
    path.push(filename);
    path
}
