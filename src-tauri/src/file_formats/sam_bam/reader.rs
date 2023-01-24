use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::Result;
use rust_htslib::bam;
use rust_htslib::bam::record::Record;
use rust_htslib::bam::HeaderView;
use rust_htslib::bam::Read;

use crate::bio_util::genomic_coordinates::GenomicRegion;
use crate::bio_util::sequence::SequenceView;
use crate::errors::InternalError;
use crate::file_formats::sam_bam::aligned_read::AlignedRead;

pub fn map_tid_to_seq_name(bam_header: &HeaderView) -> HashMap<u32, String> {
    let mut map = HashMap::new();
    for target_name in bam_header.target_names().iter() {
        let tid_option = bam_header.tid(target_name);
        if let Some(tid) = tid_option {
            let target_name_string = String::from_utf8_lossy(target_name).to_string();
            map.insert(tid, target_name_string);
        }
    }
    map
}

#[derive(Debug)]
pub struct BamReader {
    pub bam_path: PathBuf,
    reader: bam::IndexedReader,
    tid_to_seq_name: HashMap<u32, String>,
}

impl BamReader {
    pub fn new<P: Into<PathBuf>>(bam_path: P) -> Result<BamReader> {
        let pathbuf: PathBuf = bam_path.into();
        let reader = bam::IndexedReader::from_path(&pathbuf)?;
        let tid_to_seq_name = map_tid_to_seq_name(&reader.header());
        Ok(BamReader { bam_path: pathbuf, reader, tid_to_seq_name })
    }

    fn get_mate_pos(&self, record: &Record) -> Option<GenomicRegion> {
        let raw_mate_pos = record.mpos();
        let raw_mate_tid = record.mtid();
        if raw_mate_pos < 0 || raw_mate_tid < 0 {
            // SAM spec suggests unmapped reads have 1-indexed pos=0, so I believe they should have
            // pos=-1 when converted to 0 indexed.
            return None;
        }

        let mate_start = record.mpos() as u64;
        let mate_tid = record.mtid() as u32;
        match self.tid_to_seq_name.get(&mate_tid) {
            Some(seq_name) => Some(GenomicRegion::new(seq_name, mate_start, mate_start + 1)),
            None => None,
        }
    }

    pub fn read(
        &mut self,
        region: &GenomicRegion,
        refseq: &SequenceView,
    ) -> Result<Vec<AlignedRead>> {
        if !self.tid_to_seq_name.values().any(|seq_name| *seq_name == region.seq_name) {
            return Err(InternalError::InvalidSeqName { seq_name: region.seq_name.clone() })
                .map_err(anyhow::Error::msg);
        }
        self.reader.fetch((region.seq_name.as_str(), region.start, region.end))?;
        let mut record = Record::new();
        let mut alignments = Vec::new();
        loop {
            if let None = self.reader.read(&mut record) {
                break;
            }
            let alignment = AlignedRead::from_record(
                &record,
                &region.seq_name,
                refseq,
                self.get_mate_pos(&record),
            )?;
            alignments.push(alignment);
        }
        Ok(alignments)
    }
}
