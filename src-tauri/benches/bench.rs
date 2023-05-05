use criterion::{black_box, criterion_group, criterion_main, Criterion};

use gensketch_lib::interface::backend::Backend;
use gensketch_lib::interface::events::StubEventEmitter;
use gensketch_lib::paths::get_test_data_path;

mod perf;

fn bam_read() {
    let backend = Backend::new().unwrap();
    let event_emitter = StubEventEmitter::new();
    backend.initialize(&event_emitter).unwrap();
    let event_emitter = StubEventEmitter::new();
    let file_path = get_test_data_path("fake-genome.reads.bam");
    backend.split_grid.read().add_track(&event_emitter, file_path).unwrap();
}

pub fn bam_read_benchmark(c: &mut Criterion) {
    #[allow(clippy::unit_arg)]
    c.bench_function("bench", |b| b.iter(|| black_box(bam_read())));
}

criterion_group! {
    name = bench_bam_read;
    config = Criterion::default().with_profiler(perf::FlamegraphProfiler::new("bam_read", 100));
    targets = bam_read_benchmark
}
criterion_main!(bench_bam_read);
