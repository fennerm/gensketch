use std::fmt::Display;

use serde::{Serialize, Serializer};

pub type CommandResult<T, E = CommandError> = anyhow::Result<T, E>;

/// Errors which are returned to the frontend
pub enum CommandError {
    // This is necessary because anyhow errors to not implement the Serialize trait. Tauri docs
    // suggest implementing lots of different error types but that feels like overkill here.
    RuntimeError(anyhow::Error),
    SerializationError(serde_json::Error),
    TauriError(tauri::Error),
    ValidationError(String),
}

impl Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandError::RuntimeError(error) => write!(f, "{}", error),
            CommandError::ValidationError(error) => write!(f, "{}", error),
            CommandError::TauriError(error) => write!(f, "{}", error),
            CommandError::SerializationError(error) => write!(f, "{}", error),
        }
    }
}

impl Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

impl From<anyhow::Error> for CommandError {
    fn from(inner: anyhow::Error) -> Self {
        // Make sure to log full traceback whenever anyhow errors are converted to CommandErrors
        log::error!("{}", inner.backtrace());
        CommandError::RuntimeError(inner)
    }
}

impl From<tauri::Error> for CommandError {
    fn from(inner: tauri::Error) -> Self {
        log::error!("{}", inner);
        CommandError::TauriError(inner)
    }
}

impl From<serde_json::Error> for CommandError {
    fn from(inner: serde_json::Error) -> Self {
        log::error!("{}", inner);
        CommandError::SerializationError(inner)
    }
}

#[derive(thiserror::Error, Debug)]
pub enum InternalError {
    #[error("{start}-{end} is an invalid genomic interval")]
    InvalidGenomicInterval { start: u64, end: u64 },

    #[error("{seq_name} is not present in reference")]
    InvalidSeqName { seq_name: String },

    #[error("Error opening {filename} - file type is not supported")]
    InvalidFileType { filename: String },

    #[error("No reference sequence initialized")]
    NoRefSeqInitialized {},

    #[error("No tracks initialized")]
    NoTracksInitialized {},

    #[error("Pushing this item would lead to invalid sort")]
    PushError {},
}
