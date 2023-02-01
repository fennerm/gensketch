use std::env;
use std::path::PathBuf;

pub fn get_test_data_dir() -> PathBuf {
    let mut dir = env::current_exe().unwrap();
    for _ in 0..4 {
        dir.pop();
    }
    dir.push("test_data");
    dir
}

pub fn get_test_data_path(filename: &str) -> PathBuf {
    let mut path = get_test_data_dir();
    path.push(filename);
    path
}
