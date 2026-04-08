use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("{0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Other(#[from] anyhow::Error),

    #[error("Validation failed: {0}")]
    Validation(String),

    #[error("Package not found: {0}")]
    NotFound(String),
}
