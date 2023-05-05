use std::collections::BTreeMap;
use std::path::PathBuf;

use anyhow::Result;
use rust_htslib::bam;
use rust_htslib::bam::Read;

/// Maps target ids (tids) from a bam to human-readable sequence names.
#[derive(Debug)]
pub struct TidMap {
    map: BTreeMap<u32, String>,
}

impl TidMap {
    pub fn new<P: Into<PathBuf>>(bam_path: P) -> Result<Self> {
        let reader = bam::IndexedReader::from_path(&bam_path.into())?;
        let bam_header = reader.header();
        let mut map = BTreeMap::new();
        for target_name in bam_header.target_names().iter() {
            let tid_option = bam_header.tid(target_name);
            if let Some(tid) = tid_option {
                let target_name_string = String::from_utf8_lossy(target_name).to_string();
                map.insert(tid, target_name_string);
            }
        }
        Ok(Self { map })
    }

    pub fn get_seq_name(&self, tid: i32) -> Option<&String> {
        if tid < 0 {
            // Negative tid indicates the read is unmapped
            return None;
        }
        // This cast should be safe because a tid can be -1 but otherwise should be >0
        let tid_unsigned = tid as u32;

        self.map.get(&tid_unsigned)
    }

    pub fn get_tid(&self, seq_name: &str) -> Option<&u32> {
        self.map.iter().find_map(|(tid, val)| if val == seq_name { Some(tid) } else { None })
    }
}

impl From<BTreeMap<u32, String>> for TidMap {
    fn from(item: BTreeMap<u32, String>) -> Self {
        Self { map: item }
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;

    use super::*;
    use crate::paths::get_test_data_path;

    #[test]
    pub fn test_init_tid_map() {
        let bam_path = get_test_data_path("fake-genome.reads.bam");
        let tid_map = TidMap::new(bam_path).unwrap();
        assert_eq!(tid_map.get_seq_name(0), Some(&"euk_genes".to_owned()));
        assert_eq!(tid_map.get_seq_name(1), Some(&"mt".to_owned()));
        assert_eq!(tid_map.get_tid("euk_genes"), Some(&0));
        assert_eq!(tid_map.get_tid("mt"), Some(&1));
    }
}
