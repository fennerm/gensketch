use crate::bio_util::genomic_coordinates::GenomicInterval;

pub trait Alignment {
    fn interval(&self) -> &GenomicInterval;
}
