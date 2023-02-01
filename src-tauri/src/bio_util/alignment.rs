use crate::bio_util::genomic_coordinates::GenomicInterval;

pub trait Alignment {
    fn interval(&self) -> &GenomicInterval;
}

#[macro_export]
macro_rules! impl_alignment {
    ( $( $t:ty ),* ) => {
        $(impl Alignment for $t {
            fn interval(&self) -> &GenomicInterval {
                &self.interval
            }
        })*
    };
}
