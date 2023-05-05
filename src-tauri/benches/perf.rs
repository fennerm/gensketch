//! Automatically generate flamegraphs for benchmarks
//! See https://www.jibbow.com/posts/criterion-flamegraphs/ for inspiration
use std::io::Write;
use std::{fs::File, os::raw::c_int, path::Path};

use anyhow::Result;
use criterion::profiler::Profiler;
use inferno::flamegraph;
use pprof::protos::Message;
use pprof::{ProfilerGuard, Report};

/// Set up flamegraph configuration for benchmarks
fn set_flamegraph_options<'a>() -> flamegraph::Options<'a> {
    let mut options = flamegraph::Options::default();
    options.font_size = 4;
    options.min_width = 0.0001;
    options
}

/// Write a flamegraph to a .svg file
fn write_flamegraph<W: Write>(report: &Report, writer: W) -> Result<()> {
    let lines: Vec<String> = report
        .data
        .iter()
        .map(|(key, value)| {
            let mut line = String::new();
            if !key.thread_name.is_empty() {
                line.push_str(&key.thread_name);
            } else {
                line.push_str(&format!("{:?}", key.thread_id));
            }
            line.push(';');

            for frame in key.frames.iter().rev() {
                for symbol in frame.iter().rev() {
                    line.push_str(&format!("{}/", symbol));
                }
                line.pop().unwrap_or_default();
                line.push(';');
            }

            line.pop().unwrap_or_default();
            line.push_str(&format!(" {}", value));

            line
        })
        .collect();
    let mut flamegraph_options = set_flamegraph_options();
    if !lines.is_empty() {
        flamegraph::from_lines(&mut flamegraph_options, lines.iter().map(|s| &**s), writer)
            .unwrap();
    }

    Ok(())
}

/// Write benchmark report to a .proto file
/// .proto file can be loaded into IDE or pprof for visualization
fn write_protobuf_report(report: &Report, writer: &mut File) {
    let profile = report.pprof().unwrap();

    let mut content = Vec::new();
    profile.encode(&mut content).unwrap();
    writer.write_all(&content).unwrap();
}

/// Custom profiler for use with criterion
///
/// Automatically creates flamegraph plots and pprof .proto files for each benchmark in
/// src-tauri/benches
pub struct FlamegraphProfiler<'a> {
    name: String,
    frequency: c_int,
    active_profiler: Option<ProfilerGuard<'a>>,
}

impl<'a> FlamegraphProfiler<'a> {
    #[allow(dead_code)]
    pub fn new(name: &str, frequency: c_int) -> Self {
        FlamegraphProfiler { name: name.to_owned(), frequency, active_profiler: None }
    }
}

impl<'a> Profiler for FlamegraphProfiler<'a> {
    fn start_profiling(&mut self, _benchmark_id: &str, _benchmark_dir: &Path) {
        self.active_profiler = Some(ProfilerGuard::new(self.frequency).unwrap());
    }

    fn stop_profiling(&mut self, _benchmark_id: &str, benchmark_dir: &Path) {
        std::fs::create_dir_all(benchmark_dir).unwrap();
        let flamegraph_path = benchmark_dir.join(format!("{}.svg", self.name));
        let flamegraph_file =
            File::create(flamegraph_path).expect("File system error while creating flamegraph svg");
        let protobuf_path = benchmark_dir.join(format!("{}.pb", self.name));
        let mut protobuf_file =
            File::create(protobuf_path).expect("File system error while creating protobuf report");
        if let Some(profiler) = self.active_profiler.take() {
            let report = profiler.report().build().unwrap();
            write_protobuf_report(&report, &mut protobuf_file);
            write_flamegraph(&report, flamegraph_file).expect("Error writing flamegraph");
        }
    }
}
