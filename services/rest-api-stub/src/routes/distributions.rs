use crate::types::DistributionsListResponse;
use rocket::serde::json::Json;

#[get("/distributions/list/<_address>")]
pub fn get_distributions(_address: &str) -> Json<DistributionsListResponse> {
    Json(DistributionsListResponse {
        distributions: vec![],
    })
}
