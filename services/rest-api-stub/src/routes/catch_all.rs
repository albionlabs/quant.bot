use crate::types::{ApiErrorDetail, ApiErrorResponse};
use rocket::http::Status;
use rocket::response::status::Custom;
use rocket::serde::json::Json;

fn not_implemented(path: &str) -> Custom<Json<ApiErrorResponse>> {
    Custom(
        Status::NotImplemented,
        Json(ApiErrorResponse {
            error: ApiErrorDetail {
                code: "NOT_IMPLEMENTED".into(),
                message: format!("Endpoint '{}' is not implemented in the stub API", path),
            },
        }),
    )
}

#[get("/<path..>", rank = 100)]
pub fn catch_all_get(path: std::path::PathBuf) -> Custom<Json<ApiErrorResponse>> {
    not_implemented(&format!("/{}", path.display()))
}

#[post("/<path..>", rank = 100)]
pub fn catch_all_post(path: std::path::PathBuf) -> Custom<Json<ApiErrorResponse>> {
    not_implemented(&format!("/{}", path.display()))
}

#[put("/<path..>", rank = 100)]
pub fn catch_all_put(path: std::path::PathBuf) -> Custom<Json<ApiErrorResponse>> {
    not_implemented(&format!("/{}", path.display()))
}
