/// Implement the Alignment trait for a struct with an GenomicInterval field.
#[macro_export]
macro_rules! impl_alignment {
    ( $( $t:ty ),* ) => {
        $(impl Alignment for $t {
            fn id(&self) -> &str {
                &self.id
            }

            fn start(&self) -> u64 {
                self.interval.start
            }

            fn end(&self) -> u64 {
                self.interval.end
            }
        })*
    };
}

/// Implement a wrapped UUID type
///
/// This is just a simple struct which wraps and derefs to a V4 Uuid object. This protects us from
/// accidentally passing around the wrong UUID.
#[macro_export]
macro_rules! impl_wrapped_uuid {
    ( $( $t:ty ),* ) => {

        $(impl $t {
            pub fn new() -> Self {
                Self(uuid::Uuid::new_v4())
            }

            #[cfg(test)]
            pub fn from_string(s: &str) -> Result<Self, uuid::Error> {
                Ok(Self(uuid::Uuid::parse_str(s)?))
            }
        }

        impl Default for $t {
            fn default() -> Self {
                Self::new()
            }
        }

        impl std::ops::Deref for $t {
            type Target = Uuid;
            fn deref(&self) -> &Uuid {
                &self.0
            }
        }

        impl std::ops::DerefMut for $t {
            fn deref_mut(&mut self) -> &mut Uuid {
                &mut self.0
            }
        }

        impl std::fmt::Display for $t {
            fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(f, "{}", self.0)
            }
        })*
    };
}
