use crate::types::HealthResponse;
use rocket::serde::json::Json;

#[get("/health")]
pub fn get_health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
    })
}
