#[macro_use]
extern crate rocket;

mod routes;
mod types;

use crate::types::{ApiErrorDetail, ApiErrorResponse};
use rocket::serde::json::Json;

#[catch(404)]
fn not_found() -> Json<ApiErrorResponse> {
    Json(ApiErrorResponse {
        error: ApiErrorDetail {
            code: "NOT_FOUND".into(),
            message: "The requested resource was not found".into(),
        },
    })
}

#[catch(500)]
fn internal_error() -> Json<ApiErrorResponse> {
    Json(ApiErrorResponse {
        error: ApiErrorDetail {
            code: "INTERNAL_ERROR".into(),
            message: "Internal server error".into(),
        },
    })
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .mount("/", routes![routes::health::get_health])
        .mount("/v1/tokens", routes![routes::tokens::get_tokens])
        .mount(
            "/",
            routes![
                routes::metadata::get_metadata,
                routes::metadata::get_metadata_history,
                routes::distributions::get_distributions,
            ],
        )
        .mount(
            "/",
            routes![
                routes::catch_all::catch_all_get,
                routes::catch_all::catch_all_post,
                routes::catch_all::catch_all_put,
            ],
        )
        .register("/", catchers![not_found, internal_error])
}
