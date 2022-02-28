use crate::{read_state, RuntimeState};
use group_index_canister::c2c_recommended_groups::{Response::*, *};
use ic_cdk_macros::query;
use std::collections::HashSet;

#[query]
fn c2c_recommended_groups(args: Args) -> Response {
    read_state(|state| c2c_recommended_groups_impl(args, state))
}

fn c2c_recommended_groups_impl(args: Args, runtime_state: &RuntimeState) -> Response {
    let exclusions: HashSet<_> = args.exclusions.into_iter().collect();
    let groups = runtime_state
        .data
        .cached_hot_groups
        .get(args.count as usize, &exclusions)
        .into_iter()
        .filter_map(|g| runtime_state.data.public_groups.hydrate_cached_summary(g))
        .collect();

    Success(SuccessResult { groups })
}