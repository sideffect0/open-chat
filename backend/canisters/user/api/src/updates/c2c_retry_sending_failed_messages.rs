use candid::CandidType;
use serde::Deserialize;
use types::UserId;

#[derive(CandidType, Deserialize, Debug)]
pub struct Args {
    pub recipient: UserId,
}

#[derive(CandidType, Deserialize, Debug)]
pub enum Response {
    Success,
}