use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct StructuredError {
    pub code: String,
    pub message: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Not found: {0}")]
    #[allow(dead_code)]
    NotFound(String),
    #[error("Auth failed: {0}")]
    #[allow(dead_code)]
    AuthFailed(String),
    #[error("Rate limited: {0}")]
    #[allow(dead_code)]
    RateLimited(String),
    #[error("{0}")]
    Custom(String),
}

impl AppError {
    /// Return a machine-readable error code for frontend consumption.
    pub fn error_code(&self) -> &str {
        match self {
            AppError::Db(_) => "DB_ERROR",
            AppError::Io(_) => "IO_ERROR",
            AppError::Http(_) => "HTTP_ERROR",
            AppError::Json(_) => "JSON_ERROR",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::AuthFailed(_) => "GITHUB_AUTH_FAILED",
            AppError::RateLimited(_) => "RATE_LIMITED",
            AppError::Custom(msg) => {
                if msg.contains("not found") || msg.contains("NOT_FOUND") {
                    "NOT_FOUND"
                } else if msg.contains("lock poisoned") {
                    "INTERNAL_ERROR"
                } else if msg.contains("WORKTREE_CONFLICT") {
                    "WORKTREE_CONFLICT"
                } else {
                    "CUSTOM_ERROR"
                }
            }
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let structured = StructuredError {
            code: self.error_code().to_string(),
            message: self.to_string(),
        };
        structured.serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_error_displays_message() {
        let err = AppError::Custom("something went wrong".to_string());
        assert_eq!(err.to_string(), "something went wrong");
    }

    #[test]
    fn error_serializes_as_structured() {
        let err = AppError::Custom("test error".to_string());
        let json = serde_json::to_string(&err).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["code"], "CUSTOM_ERROR");
        assert_eq!(parsed["message"], "test error");
    }

    #[test]
    fn db_error_converts_from_rusqlite() {
        let rusqlite_err = rusqlite::Error::QueryReturnedNoRows;
        let app_err: AppError = rusqlite_err.into();
        assert!(app_err.to_string().contains("Database error"));
        assert_eq!(app_err.error_code(), "DB_ERROR");
    }

    #[test]
    fn not_found_error_code() {
        let err = AppError::NotFound("session abc".to_string());
        assert_eq!(err.error_code(), "NOT_FOUND");
        assert!(err.to_string().contains("session abc"));
    }

    #[test]
    fn auth_failed_error_code() {
        let err = AppError::AuthFailed("bad token".to_string());
        assert_eq!(err.error_code(), "GITHUB_AUTH_FAILED");
    }

    #[test]
    fn rate_limited_error_code() {
        let err = AppError::RateLimited("try again later".to_string());
        assert_eq!(err.error_code(), "RATE_LIMITED");
    }

    #[test]
    fn custom_not_found_detected() {
        let err = AppError::Custom("session not found".to_string());
        assert_eq!(err.error_code(), "NOT_FOUND");
    }

    #[test]
    fn worktree_conflict_detected() {
        let err = AppError::Custom("WORKTREE_CONFLICT: branch in use".to_string());
        assert_eq!(err.error_code(), "WORKTREE_CONFLICT");
    }
}
