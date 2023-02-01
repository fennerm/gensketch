use rust_htslib::bam::record::CigarString;
use rust_htslib::bam::Record;

const DEFAULT_POS: i64 = 1003;
const DEFAULT_TID: i32 = 0;

pub struct RecordBuilder {
    pub record: Record,
}

impl RecordBuilder {
    pub fn new(qname: &[u8], seq: &[u8], cigar: Option<&CigarString>, qual: &[u8]) -> Self {
        let mut record = Record::new();
        record.set(qname, cigar, seq, qual);
        record.set_pos(DEFAULT_POS);
        record.set_tid(DEFAULT_TID);
        RecordBuilder { record }
    }

    pub fn qname(mut self, qname: &[u8]) -> Self {
        self.record.set_qname(qname);
        self
    }

    pub fn pos(mut self, pos: i64) -> Self {
        self.record.set_pos(pos);
        self
    }

    pub fn tid(mut self, tid: i32) -> Self {
        self.record.set_tid(tid);
        self
    }

    pub fn mtid(mut self, mtid: i32) -> Self {
        self.record.set_mtid(mtid);
        self
    }

    pub fn mpos(mut self, mpos: i64) -> Self {
        self.record.set_mpos(mpos);
        self
    }
}

impl Default for RecordBuilder {
    fn default() -> Self {
        let mut record = Record::new();
        record.set(b"test", Some(&CigarString::try_from("4M").unwrap()), b"AGCT", b"BBBB");
        record.set_pos(DEFAULT_POS);
        record.set_tid(DEFAULT_TID);
        RecordBuilder { record }
    }
}
